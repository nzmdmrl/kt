"use client";

/**
 * Profil fotoğrafı yükleme — sürükle-bırak veya "Göz at".
 *
 * Küçültme TARAYICIDA yapılır: seçilen görsel kareye kırpılır, 200x200
 * boyutuna indirilir ve ORTA kalitede JPEG'e çevrilir. Sunucuya yalnızca bu
 * küçük görsel gider; orijinal dosya hiçbir yere yüklenmez/saklanmaz.
 *
 * Yükleme admin onayına düşer: onaylanana kadar fotoğrafı sadece sahibi görür.
 */

import { useRef, useState } from "react";

const MAX_BYTES = 15 * 1024 * 1024;   // 15 MB
const OUT_SIZE = 200;                 // 200x200
const JPEG_QUALITY = 0.72;            // orta kalite

async function fileToSquareJpeg(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Dosya okunamadı"));
    fr.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Görsel açılamadı"));
    im.src = dataUrl;
  });

  // Merkezden kare kırp, sonra 200x200'e ölçekle.
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = OUT_SIZE;
  canvas.height = OUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tarayıcı görsel işleyemedi");
  ctx.fillStyle = "#ffffff";              // şeffaf PNG'ler için beyaz zemin
  ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT_SIZE, OUT_SIZE);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export default function PhotoUpload({
  current,
  pending,
  onUploaded,
  onRemoved,
}: {
  /** Şu an görünen fotoğraf (varsa). */
  current?: string | null;
  /** Yüklenen fotoğraf onay bekliyor mu? */
  pending?: boolean;
  onUploaded: (dataUrl: string) => Promise<boolean> | boolean;
  onRemoved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file?: File | null) {
    setErr("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Lütfen bir görsel dosyası seç."); return; }
    if (file.size > MAX_BYTES) { setErr("Dosya 15 MB'tan büyük olamaz."); return; }
    setBusy(true);
    try {
      const small = await fileToSquareJpeg(file);
      await onUploaded(small);
    } catch (e: any) {
      setErr(e?.message || "Fotoğraf işlenemedi.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        style={{
          display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
          padding: 14, borderRadius: 14,
          border: `2px dashed ${drag ? "var(--accent)" : "var(--border-soft)"}`,
          background: drag ? "var(--accent-glow)" : "var(--bg-elevated)",
          transition: "all .15s",
        }}
      >
        <div style={{
          width: 68, height: 68, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
          background: "var(--bg-panel)", border: "1px solid var(--border-soft)",
          display: "grid", placeItems: "center", fontSize: 26,
        }}>
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : "🖼️"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 14 }}>
            {busy ? "Fotoğraf hazırlanıyor…" : "Fotoğrafı sürükle bırak veya seç"}
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
            JPG/PNG · en fazla 15 MB · 200×200 boyutuna küçültülüp kaydedilir
          </div>
        </div>
        <span style={{
          padding: "9px 14px", borderRadius: 10, background: "var(--accent)", color: "#1a1330",
          fontWeight: 800, fontSize: 13, flexShrink: 0,
        }}>Göz at</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFile(e.target.files?.[0])}
        style={{ display: "none" }}
      />

      {err && <div style={{ color: "var(--accent-hot)", fontSize: 13 }}>{err}</div>}

      {pending && (
        <div style={{
          padding: "10px 12px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
          background: "var(--bg-panel)", border: "1px solid var(--accent)", color: "var(--text-soft)",
        }}>
          ⏳ Fotoğrafın <strong style={{ color: "var(--accent)" }}>onay bekliyor</strong>. Sen görüyorsun;
          onaylanınca diğer oyuncular da görecek.
        </div>
      )}

      {current && onRemoved && (
        <button
          onClick={onRemoved}
          style={{
            justifySelf: "start", padding: "8px 14px", borderRadius: 10, cursor: "pointer",
            border: "1px solid var(--border-soft)", background: "transparent",
            color: "var(--accent-hot)", fontWeight: 700, fontSize: 13,
          }}
        >Fotoğrafı kaldır</button>
      )}
    </div>
  );
}
