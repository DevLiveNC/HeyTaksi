import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Plus,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { WalletView } from "@heytaksi/shared";
import { passengerApi } from "../../services/passengerApi";

export function WalletPage() {
  const auth = useAuth();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    passengerApi
      .wallet(auth.authorizedFetch)
      .then((next) => {
        if (alive) setWallet(next);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Cüzdan yüklenemedi"));
    return () => {
      alive = false;
    };
  }, [auth.authorizedFetch]);
  const defaultCard = wallet?.methods.find((item) => item.isDefault) ?? wallet?.methods[0];
  return (
    <div className="sub-page wallet-page">
      <header className="page-title">
        <span>ÖDEMELER</span>
        <h1>Cüzdan</h1>
        <p>Ödeme yöntemlerin ve hareketlerin.</p>
      </header>
      <section className="balance-card">
        <div className="balance-brand">
          <div>HT</div>
          <span>HEY TAKSİ CÜZDAN</span>
          <ShieldCheck />
        </div>
        <small>Kullanılabilir bakiye</small>
        <strong>₺{(wallet?.balance ?? 0).toFixed(2)}</strong>
        <footer>
          <span>{defaultCard ? `•••• ${defaultCard.last4}` : "Kart eklenmedi"}</span>
          <span>GÜVENLİ</span>
        </footer>
      </section>
      <div className="wallet-actions">
        <Link to="/wallet/topup">
          <i>
            <Plus />
          </i>
          <span>Bakiye ekle</span>
        </Link>
        <Link to="/wallet/methods">
          <i>
            <CreditCard />
          </i>
          <span>Kartlarım</span>
        </Link>
        <a href="#hareketler">
          <i>
            <ReceiptText />
          </i>
          <span>Harcamalar</span>
        </a>
      </div>
      {error && <div className="booking-error">{error}</div>}
      <section className="transactions" id="hareketler">
        <div className="section-heading">
          <div>
            <span>SON İŞLEMLER</span>
            <h2>Hareketler</h2>
          </div>
        </div>
        {(wallet?.transactions ?? []).map((item) => (
          <article key={item.id}>
            <i>{item.amount >= 0 ? <ArrowDownLeft /> : <ArrowUpRight />}</i>
            <span>
              <strong>{item.description}</strong>
              <small>{new Date(item.createdAt).toLocaleString("tr-TR")}</small>
            </span>
            <b className={item.amount >= 0 ? "positive" : ""}>
              {item.amount >= 0 ? "+" : ""}₺{item.amount.toFixed(2)}
            </b>
          </article>
        ))}
        {wallet && wallet.transactions.length === 0 && <p className="empty-hint">Henüz cüzdan hareketi yok.</p>}
      </section>
      <div className="phase-notice">
        <WalletCards />
        <p>Kart numarası saklanmaz; yalnızca son 4 hane ve marka tutulur. Gerçek POS/Stripe tahsilatı sonraki fazdadır.</p>
      </div>
    </div>
  );
}
