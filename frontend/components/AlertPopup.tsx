"use client";

/**
 * Basit uyarı/hata açılır kutusu (popup).
 *
 * Form hatalarını satır arası küçük yazı yerine ekranın ortasında gösterir —
 * "kullanıcı adı en fazla 20 karakter" gibi kuralların gözden kaçmaması için.
 * Diğer modalların (ör. ProfileEditModal, zIndex 200) ÜSTÜNDE durur.
 */
export default function AlertPopup({
  message,
  title = "Uyarı",
  onClose,
}: {
  message: string;
  title?: string;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 300,
        display: "grid", placeItems: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-label={title}
        style={{
          background: "var(--bg-panel)", borderRadius: 14, padding: "20px 20px 16px",
          width: "min(380px, 100%)", textAlign: "center",
          border: "1px solid var(--accent-hot)", boxShadow: "var(--shadow-soft)",
        }}
      >
        <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 8 }}>⚠️</div>
        <div className="brand-mono" style={{ fontSize: 17, color: "var(--text-strong)", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--text-soft)", lineHeight: 1.5, marginBottom: 16 }}>{message}</div>
        <button
          onClick={onClose}
          autoFocus
          style={{
            width: "100%", padding: "11px 16px", borderRadius: 10, border: "none",
            background: "var(--accent)", color: "#1a1330", fontWeight: 700, fontSize: 15, cursor: "pointer",
          }}
        >
          Tamam
        </button>
      </div>
    </div>
  );
}
