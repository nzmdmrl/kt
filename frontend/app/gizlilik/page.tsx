import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Gizlilik Politikası — Kelime Tahmin" };

export default function GizlilikPage() {
  return (
    <LegalPage title="Gizlilik Politikası ve KVKK Aydınlatma Metni" updated="Temmuz 2026">
      <p>
        Kelime Tahmin (&quot;Platform&quot;) olarak kişisel verilerinizin güvenliğine önem
        veriyoruz. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;)
        kapsamında hangi verileri işlediğimizi ve nasıl koruduğumuzu açıklar.
      </p>

      <h2>Toplanan Veriler</h2>
      <p>
        Hesap oluşturduğunuzda e-posta adresiniz, kullanıcı adınız ve şifrenizin
        şifrelenmiş hâli saklanır. Google ile giriş yaparsanız Google hesabınızdan
        gelen temel kimlik bilgileri kullanılır. Oyun sırasında maç istatistikleriniz,
        ELO puanınız ve lig sıralamanız tutulur.
      </p>

      <h2>Verilerin Kullanım Amacı</h2>
      <p>
        Verileriniz yalnızca oyun hizmetinin sağlanması, sıralama ve rozet sistemlerinin
        işletilmesi, hesabınızın güvenliğinin sağlanması amacıyla kullanılır. Verileriniz
        pazarlama amacıyla üçüncü taraflarla paylaşılmaz.
      </p>

      <h2>Çerezler</h2>
      <p>
        Platform, oturumunuzu sürdürmek ve misafir oyuncu kimliğini hatırlamak için
        tarayıcınızın yerel depolamasını (localStorage) kullanır. Reklam veya izleme
        amaçlı üçüncü taraf çerezleri kullanılmaz.
      </p>

      <h2>Haklarınız</h2>
      <p>
        KVKK kapsamında; verilerinize erişme, düzeltilmesini veya silinmesini isteme
        haklarına sahipsiniz. Hesabınızın ve verilerinizin silinmesini talep etmek için
        bizimle iletişime geçebilirsiniz.
      </p>

      <h2>İletişim</h2>
      <p>
        Gizlilikle ilgili sorularınız için site üzerindeki iletişim kanallarından bize
        ulaşabilirsiniz.
      </p>

      <p style={{ marginTop: 24, fontSize: 13, fontStyle: "italic", color: "var(--text-dim)" }}>
        Not: Bu metin genel bir bilgilendirme şablonudur. Yayına geçmeden önce bir hukuk
        danışmanına inceletmeniz önerilir.
      </p>
    </LegalPage>
  );
}
