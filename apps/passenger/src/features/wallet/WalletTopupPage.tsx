import { ArrowLeft, WalletCards } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { WalletView } from "@heytaksi/shared";
import { passengerApi } from "../../services/passengerApi";

const presets = [100, 250, 500, 1000];

export function WalletTopupPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [amount, setAmount] = useState(250);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void passengerApi.wallet(auth.authorizedFetch).then(setWallet).catch(() => undefined);
  }, [auth.authorizedFetch]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await passengerApi.topup(auth.authorizedFetch, {
        amount,
        methodId: wallet?.methods.find((item) => item.isDefault)?.id,
      });
      setWallet(next);
      navigate("/wallet");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Yükleme yapılamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sub-page wallet-page">
      <header className="sub-header">
        <button onClick={() => navigate(-1)} aria-label="Geri dön">
          <ArrowLeft />
        </button>
        <div>
          <small>CÜZDAN</small>
          <h1>Bakiye ekle</h1>
        </div>
      </header>
      <section className="balance-card compact">
        <small>Mevcut bakiye</small>
        <strong>₺{(wallet?.balance ?? 0).toFixed(2)}</strong>
      </section>
      <form className="wallet-form" onSubmit={(event) => void submit(event)}>
        <div className="preset-row">
          {presets.map((value) => (
            <button type="button" key={value} className={amount === value ? "active" : ""} onClick={() => setAmount(value)}>
              ₺{value}
            </button>
          ))}
        </div>
        <label>
          Tutar
          <input type="number" min={50} max={5000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        </label>
        {error && <div className="booking-error">{error}</div>}
        <button className="request-primary" disabled={busy}>
          <WalletCards /> ₺{amount} yükle
        </button>
        <p className="empty-hint">Demo yükleme gerçek karta yansımaz; iç cüzdan bakiyesini artırır.</p>
      </form>
    </div>
  );
}
