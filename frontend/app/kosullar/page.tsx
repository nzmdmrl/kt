import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Kullanım Koşulları — Kelime Tahmin" };

export default function KosullarPage() {
  return (
    <LegalPage title="Kullanım Koşulları" updated="Temmuz 2026">
      <p>
        Kelime Tahmin platformunu kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız.
      </p>

      <h2>Hizmetin Kullanımı</h2>
      <p>
        Platform, karşılıklı kelime tahmin oyunu sunar. Hizmeti yalnızca yasalara uygun
        ve platformun amacına uygun şekilde kullanmayı kabul edersiniz. Hesabınızın
        güvenliğinden siz sorumlusunuz.
      </p>

      <h2>Kullanıcı Davranışı</h2>
      <p>
        Oyun içinde ve kullanıcı adlarında hakaret, küfür, taciz veya başkalarını rahatsız
        edici davranışlar yasaktır. Hile yapmak, otomatik araçlar kullanmak veya sistemi
        kötüye kullanmak hesabınızın askıya alınmasına yol açabilir.
      </p>

      <h2>Fikri Mülkiyet</h2>
      <p>
        Platformun tasarımı, kodu ve içeriği Kelime Tahmin&apos;e aittir. İzinsiz
        kopyalanamaz veya dağıtılamaz.
      </p>

      <h2>Sorumluluk Reddi</h2>
      <p>
        Hizmet &quot;olduğu gibi&quot; sunulur. Kesintisiz veya hatasız çalışacağı garanti
        edilmez. Platform, hizmetin kullanımından doğabilecek dolaylı zararlardan sorumlu
        tutulamaz.
      </p>

      <h2>Değişiklikler</h2>
      <p>
        Bu koşullar zaman zaman güncellenebilir. Güncel koşullar bu sayfada yayımlanır.
      </p>

      <p style={{ marginTop: 24, fontSize: 13, fontStyle: "italic", color: "var(--text-dim)" }}>
        Not: Bu metin genel bir bilgilendirme şablonudur. Yayına geçmeden önce bir hukuk
        danışmanına inceletmeniz önerilir.
      </p>
    </LegalPage>
  );
}
