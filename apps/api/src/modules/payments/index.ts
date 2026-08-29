import type { Pool } from 'pg';
import type { PaymentMethodCreateInput, WalletTopupInput, WalletView } from '@heytaksi/shared';
import { AppError } from '../../core/errors/app-error.js';

const toNumber = (value: unknown) => Number(value ?? 0);

export class PaymentService {
  constructor(private readonly db: Pool) {}

  async ensureWallet(userId: string) {
    await this.db.query('INSERT INTO wallets(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  }

  async getWallet(userId: string): Promise<WalletView> {
    await this.ensureWallet(userId);
    const [wallet, methods, transactions] = await Promise.all([
      this.db.query<{ balance: string; currency: string }>('SELECT balance, currency FROM wallets WHERE user_id=$1', [userId]),
      this.db.query(
        `SELECT id, brand, last4, holder_name AS "holderName", exp_month AS "expMonth", exp_year AS "expYear",
         is_default AS "isDefault", created_at AS "createdAt" FROM payment_methods WHERE user_id=$1
         ORDER BY is_default DESC, created_at DESC`,
        [userId],
      ),
      this.db.query(
        `SELECT id, type, amount::float8 AS amount, balance_after::float8 AS "balanceAfter", description,
         ride_id AS "rideId", created_at AS "createdAt" FROM wallet_transactions WHERE user_id=$1
         ORDER BY created_at DESC LIMIT 30`,
        [userId],
      ),
    ]);
    return {
      balance: toNumber(wallet.rows[0]?.balance),
      currency: wallet.rows[0]?.currency ?? 'TRY',
      methods: methods.rows,
      transactions: transactions.rows,
    };
  }

  async topup(userId: string, input: WalletTopupInput) {
    await this.ensureWallet(userId);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const wallet = await client.query<{ balance: string }>(
        'SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE',
        [userId],
      );
      const next = toNumber(wallet.rows[0]?.balance) + input.amount;
      await client.query('UPDATE wallets SET balance=$2, updated_at=NOW() WHERE user_id=$1', [userId, next]);
      await client.query(
        `INSERT INTO wallet_transactions(user_id, payment_method_id, type, amount, balance_after, description)
         VALUES ($1,$2,'topup',$3,$4,$5)`,
        [userId, input.methodId ?? null, input.amount, next, 'Cüzdana yükleme'],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getWallet(userId);
  }

  async addMethod(userId: string, input: PaymentMethodCreateInput) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      if (input.isDefault !== false) {
        await client.query('UPDATE payment_methods SET is_default=FALSE WHERE user_id=$1', [userId]);
      }
      const result = await client.query(
        `INSERT INTO payment_methods(user_id, brand, last4, holder_name, exp_month, exp_year, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, brand, last4, holder_name AS "holderName", exp_month AS "expMonth", exp_year AS "expYear",
         is_default AS "isDefault", created_at AS "createdAt"`,
        [userId, input.brand, input.last4, input.holderName, input.expMonth, input.expYear, input.isDefault !== false],
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteMethod(userId: string, methodId: string) {
    const result = await this.db.query('DELETE FROM payment_methods WHERE id=$1 AND user_id=$2', [methodId, userId]);
    if (!result.rowCount) throw new AppError(404, 'METHOD_NOT_FOUND', 'Ödeme yöntemi bulunamadı.');
  }

  /** Tamamlanan yolculuk ücretini cüzdandan düşer; bakiye yetmezse tahsilatı atlar. */
  async chargeRide(userId: string, rideId: string, amount: number, description: string) {
    if (amount <= 0) return;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO wallets(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
      const wallet = await client.query<{ balance: string }>(
        'SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE',
        [userId],
      );
      const current = toNumber(wallet.rows[0]?.balance);
      if (current < amount) {
        await client.query('COMMIT');
        return;
      }
      const next = current - amount;
      await client.query('UPDATE wallets SET balance=$2, updated_at=NOW() WHERE user_id=$1', [userId, next]);
      await client.query(
        `INSERT INTO wallet_transactions(user_id, ride_id, type, amount, balance_after, description)
         VALUES ($1,$2,'ride_charge',$3,$4,$5)`,
        [userId, rideId, -amount, next, description],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const paymentsModule = { name: 'payments', status: 'active' } as const;
