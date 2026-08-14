/**
 * Admin panelinden düzenlenen sayfa metnini basar (Hakkımızda, Nasıl Oynanır).
 *
 * Sade markdown alt kümesi — HAM HTML BASILMAZ (dangerouslySetInnerHTML yok),
 * her şey React öğesi olarak üretilir:
 *   ## Başlık        -> <h2>
 *   - madde          -> <ul><li>
 *   **kalın**        -> <strong>
 *   [metin](adres)   -> <a>
 *   boş satır        -> yeni paragraf
 */

import React from "react";

// Satır içi biçimlendirme: **kalın** ve [metin](adres).
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    } else {
      const href = m[3];
      const external = /^https?:\/\//.test(href);
      out.push(
        <a
          key={`${keyBase}-a${i++}`}
          href={href}
          style={{ color: "var(--accent)" }}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {m[2]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function PageBody({ body }: { body: string }) {
  // Boş satır = blok ayracı. Blok "## " ile başlıyorsa başlık, "- " ile liste.
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <>
      {blocks.map((block, bi) => {
        if (block.startsWith("## ")) {
          return (
            <h2 key={bi} className="brand-mono" style={{ fontSize: 20, marginTop: 30, marginBottom: 10, color: "var(--text-strong)" }}>
              {inline(block.slice(3).trim(), `h${bi}`)}
            </h2>
          );
        }
        if (block.startsWith("- ")) {
          // Liste maddeleri satır sonuyla ayrılır; devam satırları maddeye eklenir.
          const items: string[] = [];
          for (const line of block.split("\n")) {
            if (line.trimStart().startsWith("- ")) items.push(line.trimStart().slice(2).trim());
            else if (items.length) items[items.length - 1] += " " + line.trim();
          }
          return (
            <ul key={bi} style={{ margin: "10px 0 10px 20px", display: "grid", gap: 8 }}>
              {items.map((it, ii) => (
                <li key={ii} style={{ color: "var(--text-soft)", lineHeight: 1.75 }}>
                  {inline(it, `l${bi}-${ii}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} style={{ color: "var(--text-soft)", lineHeight: 1.8, margin: "0 0 14px" }}>
            {inline(block.replace(/\n/g, " "), `p${bi}`)}
          </p>
        );
      })}
    </>
  );
}
