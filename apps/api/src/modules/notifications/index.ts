import type { Pool } from 'pg';

export async function createNotification(
  db: Pool,
  input: { userId: string; title: string; body: string; rideId?: string | null },
) {
  await db.query(
    'INSERT INTO user_notifications(user_id, title, body, ride_id) VALUES ($1,$2,$3,$4)',
    [input.userId, input.title, input.body, input.rideId ?? null],
  );
}

export async function listNotifications(db: Pool, userId: string) {
  const result = await db.query(
    `SELECT id, title, body, ride_id AS "rideId", (read_at IS NOT NULL) AS read, created_at AS "createdAt"
     FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return result.rows;
}

export async function markNotificationsRead(db: Pool, userId: string, id?: string) {
  if (id) {
    await db.query(
      'UPDATE user_notifications SET read_at=COALESCE(read_at, NOW()) WHERE id=$1 AND user_id=$2',
      [id, userId],
    );
    return;
  }
  await db.query('UPDATE user_notifications SET read_at=COALESCE(read_at, NOW()) WHERE user_id=$1 AND read_at IS NULL', [userId]);
}

export const notificationsModule = { name: 'notifications', status: 'active' } as const;
