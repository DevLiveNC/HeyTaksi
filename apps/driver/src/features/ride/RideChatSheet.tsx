import { MessageCircle, SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDriver } from "../../state/DriverContext";

const quickReplies = ["Konuma geldim.", "5 dakika içinde oradayım.", "Lütfen cadde karşısındaki kapıda bekleyin.", "Trafik yoğun, yolun tamamındayım."];

/** Yolculuk içi mesajlaşma; mesajlar WebSocket ile canlı akar. */
export function RideChatSheet({ onClose }: { onClose: () => void }) {
  const { messages, sendMessage, busy, error } = useDriver();
  const [draft, setDraft] = useState("");
  const listEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = async (body: string) => {
    const text = body.trim();
    if (!text) return;
    setDraft("");
    await sendMessage(text);
  };

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label="Mesajlaşma">
      <div className="sheet-card chat">
        <header>
          <MessageCircle size={18} />
          <strong>Yolcu mesajları</strong>
          <button onClick={onClose} aria-label="Kapat">Kapat</button>
        </header>
        <div className="chat-log">
          {messages.length === 0 && (
            <p className="chat-empty">Henüz mesaj yok. Yolcuya kısa bir bilgi gönderebilirsin.</p>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`bubble ${message.senderRole}`}>
              <span>{message.body}</span>
              <small>
                {message.senderName.split(" ")[0]} ·{" "}
                {new Date(message.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
              </small>
            </div>
          ))}
          <div ref={listEnd} />
        </div>
        <div className="chat-quick">
          {quickReplies.map((reply) => (
            <button key={reply} onClick={() => void submit(reply)} disabled={busy}>
              {reply}
            </button>
          ))}
        </div>
        {error && <div className="driver-error">{error}</div>}
        <form
          className="chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Mesajını yaz…"
            maxLength={500}
            aria-label="Mesaj"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Gönder">
            <SendHorizonal size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
