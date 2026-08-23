import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Plus,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { usePassengerExperience } from "../../state/PassengerExperience";
export function WalletPage() {
  const { state } = usePassengerExperience();
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
        <strong>₺{state.walletBalance.toFixed(2)}</strong>
        <footer>
          <span>•••• 2086</span>
          <span>GÜVENLİ</span>
        </footer>
      </section>
      <div className="wallet-actions">
        <button>
          <i>
            <Plus />
          </i>
          <span>Bakiye ekle</span>
        </button>
        <button>
          <i>
            <CreditCard />
          </i>
          <span>Kartlarım</span>
        </button>
        <button>
          <i>
            <ReceiptText />
          </i>
          <span>Harcamalar</span>
        </button>
      </div>
      <section className="transactions">
        <div className="section-heading">
          <div>
            <span>SON İŞLEMLER</span>
            <h2>Hareketler</h2>
          </div>
        </div>
        <article>
          <i>
            <ArrowDownLeft />
          </i>
          <span>
            <strong>Cüzdana yükleme</strong>
            <small>20 Ağustos · Visa •2086</small>
          </span>
          <b className="positive">+₺500,00</b>
        </article>
        <article>
          <i>
            <ArrowUpRight />
          </i>
          <span>
            <strong>Mersin Marina yolculuğu</strong>
            <small>21 Ağustos · 18:42</small>
          </span>
          <b>-₺184,50</b>
        </article>
      </section>
      <div className="phase-notice">
        <WalletCards />
        <p>
          Ödeme işlemleri temsili durum verisidir; gerçek ödeme sağlayıcısı
          bağlı değildir.
        </p>
      </div>
    </div>
  );
}
