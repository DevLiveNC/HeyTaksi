import { ArrowLeft, CreditCard, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { PaymentBrand, PaymentMethod, WalletView } from "@heytaksi/shared";
import { passengerApi } from "../../services/passengerApi";

const brands: { value: PaymentBrand; label: string }[] = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "troy", label: "Troy" },
  { value: "amex", label: "Amex" },
];

export function WalletMethodsPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => passengerApi.wallet(auth.authorizedFetch).then(setWallet);

  useEffect(() => {
    void reload().catch((cause) => setError(cause instanceof Error ? cause.message : "Kartlar yüklenemedi"));
  }, [auth.authorizedFetch]);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await passengerApi.addMethod(auth.authorizedFetch, {
        brand: String(data.brand) as PaymentBrand,
        last4: String(data.last4),
        holderName: String(data.holderName),
        expMonth: Number(data.expMonth),
        expYear: Number(data.expYear),
        isDefault: true,
      });
      event.currentTarget.reset();
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kart eklenemedi");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (method: PaymentMethod) => {
    setBusy(true);
    try {
      await passengerApi.deleteMethod(auth.authorizedFetch, method.id);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kart silinemedi");
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
          <h1>Kartlarım</h1>
        </div>
      </header>
      <section className="settings-card">
        {(wallet?.methods ?? []).map((method) => (
          <div className="address-setting" key={method.id}>
            <i>
              <CreditCard />
            </i>
            <span>
              <strong>{method.brand.toUpperCase()} •••• {method.last4}</strong>
              <small>
                {method.holderName} · {String(method.expMonth).padStart(2, "0")}/{method.expYear}
                {method.isDefault ? " · Varsayılan" : ""}
              </small>
            </span>
            <button onClick={() => void remove(method)} aria-label="Kartı sil" disabled={busy}>
              <Trash2 />
            </button>
          </div>
        ))}
        {wallet && wallet.methods.length === 0 && <p className="empty-hint">Kayıtlı kart yok.</p>}
      </section>
      <form className="wallet-form" onSubmit={(event) => void add(event)}>
        <h2>Yeni kart ekle</h2>
        <p>Tam kart numarası istenmez; yalnızca marka ve son 4 hane kaydedilir.</p>
        <label>
          Kart sahibi
          <input name="holderName" required minLength={2} placeholder="Ad Soyad" />
        </label>
        <div className="field-row">
          <label>
            Marka
            <select name="brand">
              {brands.map((brand) => (
                <option key={brand.value} value={brand.value}>{brand.label}</option>
              ))}
            </select>
          </label>
          <label>
            Son 4 hane
            <input name="last4" required pattern="\d{4}" maxLength={4} placeholder="2086" />
          </label>
        </div>
        <div className="field-row">
          <label>
            Ay
            <input name="expMonth" type="number" min={1} max={12} required defaultValue={12} />
          </label>
          <label>
            Yıl
            <input name="expYear" type="number" min={2026} max={2040} required defaultValue={2028} />
          </label>
        </div>
        {error && <div className="booking-error">{error}</div>}
        <button className="request-primary" disabled={busy}>
          <Plus /> Kartı kaydet
        </button>
      </form>
    </div>
  );
}
