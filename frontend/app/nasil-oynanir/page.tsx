import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Nasıl Oynanır — Kelime Tahmin" };

export default function HakkindaPage() {
  return (
    <LegalPage title="Nasıl Oynanır?">
      <p>
        Kelime Tahmin, gerçek rakiplere karşı oynanan hızlı bir kelime düellosudur.
        Amaç, gizli kelimeyi rakibinden önce bulmaktır.
      </p>

      <h2>Temel Kurallar</h2>
      <p>
        Her turda gizli bir kelime vardır ve kelimenin ilk harfi ile kaç harfli olduğu
        gösterilir. Bir kelime tahmin ettiğinizde harfler renklenir: yeşil harf doğru
        yerde, sarı harf kelimede var ama yanlış yerde, gri harf kelimede yok demektir.
        Wordle oynadıysanız bu mantık tanıdık gelecek.
      </p>

      <h2>Sıra ve Buzzer</h2>
      <p>
        Tur başında sıra boştur — kim önce yazmaya başlarsa söz hakkı onda olur. Doğru
        bilemezseniz sıra rakibinize geçer. İki oyuncu sırayla tahmin yaparak kelimeyi
        bulmaya çalışır. Kelimeyi ilk bulan turu kazanır ve kalan süreye göre puan alır.
      </p>

      <h2>Sesli Cevap</h2>
      <p>
        Klavyeyle yazmak yerine mikrofon düğmesine basılı tutup kelimeyi sesli
        söyleyebilirsiniz. Söylediğiniz kelime kutucuklara yazılır, onaylayıp
        gönderirsiniz. (Tarayıcınızın ses tanımayı desteklemesi gerekir.)
      </p>

      <h2>Lig, Rozet ve Kupalar</h2>
      <p>
        Her maçta topladığınız puan sizi lig sıralamasında yükseltir. Günlük en iyi
        maçınız aylık toplamınıza eklenir. Ay sonunda ilk üç oyuncu kupa ve madalya
        kazanır. Ayrıca oyun ilerledikçe çeşitli rozetler açarsınız.
      </p>

      <h2>Günün Kelimesi</h2>
      <p>
        Her gün herkese aynı özel kelime sunulur. Tek başınıza çözer, sonucunuzu
        arkadaşlarınızla paylaşırsınız. Yarın yeni bir kelime gelir.
      </p>

      <div style={{ marginTop: 30 }}>
        <a href="/oyna" style={{
          display: "inline-block", padding: "14px 28px", background: "var(--accent)",
          color: "#1a1330", borderRadius: 12, fontWeight: 700, fontFamily: "var(--font-display)",
        }}>Hemen Oyna →</a>
      </div>
    </LegalPage>
  );
}
