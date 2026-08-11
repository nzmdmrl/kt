import LegalPage from "@/components/LegalPage";
import { COMPANY, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = {
  title: "Çerez Politikası — Kelime Tahmin",
  description:
    "Kelime Tahmin'in tarayıcınızda hangi bilgileri sakladığı, neden sakladığı ve bunları nasıl temizleyebileceğiniz.",
};

export default function CerezPage() {
  return (
    <LegalPage title="Çerez Politikası" updated={LEGAL_UPDATED}>
      <p>
        Bu politika, <strong>{COMPANY.name}</strong> tarafından işletilen{" "}
        <strong>{COMPANY.product}</strong> ({COMPANY.domain}) üzerinde tarayıcınızda hangi bilgilerin
        saklandığını, bunların ne işe yaradığını ve nasıl kaldırabileceğinizi açıklar.
      </p>
      <p>
        Kısaca: <strong>reklam veya takip amaçlı çerez kullanmıyoruz.</strong> Sizi siteler arasında
        izlemiyor, profilinizi çıkarmıyor ve verilerinizi reklam ağlarına satmıyoruz. Sakladığımız
        şeyler oyunun çalışması ve tercihlerinizin hatırlanması içindir.
      </p>

      <nav className="legal-toc">
        <ol>
          <li><a href="#nedir">Çerez ve yerel depolama nedir?</a></li>
          <li><a href="#neler">Tarayıcınızda ne saklıyoruz?</a></li>
          <li><a href="#ucuncu">Üçüncü taraf çerezleri</a></li>
          <li><a href="#kullanmadiklarimiz">Kullanmadıklarımız</a></li>
          <li><a href="#yonetim">Nasıl temizler veya engellersiniz?</a></li>
          <li><a href="#degisiklik">Değişiklikler</a></li>
          <li><a href="#iletisim">İletişim</a></li>
        </ol>
      </nav>

      <h2 id="nedir">1. Çerez ve yerel depolama nedir?</h2>
      <p>
        <strong>Çerez (cookie)</strong>, bir siteyi ziyaret ettiğinizde tarayıcınıza kaydedilen küçük
        bir metin dosyasıdır. <strong>Yerel depolama (localStorage)</strong> ise benzer işi gören,
        bilgiyi yalnızca tarayıcınızda tutan ve sunucuya kendiliğinden göndermeyen bir tarayıcı
        özelliğidir.
      </p>
      <p>
        Platform büyük ölçüde <strong>localStorage</strong> kullanır. Yani sakladığımız bilgiler
        cihazınızda kalır; her istekte sunucuya otomatik olarak gönderilmez.
      </p>

      <h2 id="neler">2. Tarayıcınızda ne saklıyoruz?</h2>

      <h3>2.1 Zorunlu — oyun bunlar olmadan çalışmaz</h3>
      <ul>
        <li>
          <strong>kt_token</strong> — giriş jetonunuz (JWT). Her sayfa yenilendiğinde yeniden giriş
          yapmak zorunda kalmamanızı sağlar. Çıkış yaptığınızda silinir.
        </li>
        <li>
          <strong>kt_uid</strong> — kullanıcı kimliğiniz. Maç ve arena bağlantılarında sizi doğru
          oyuncuyla eşleştirmek için kullanılır.
        </li>
        <li>
          <strong>kt_user</strong> — profilinizin son bilinen özeti (ad, seviye, puan). Sayfa
          açılışında profilinizin anında görünmesini sağlar, sonra sunucudan tazelenir.
        </li>
        <li>
          <strong>Misafir kimliği</strong> — üye olmadan oynarken maç boyunca sizi tanımlayan geçici
          kimlik. Kalıcı bir hesapla ilişkilendirilmez.
        </li>
      </ul>

      <h3>2.2 Tercih — deneyiminizi hatırlar</h3>
      <ul>
        <li>
          <strong>kt_theme</strong> — gece/gündüz teması seçiminiz.
        </li>
        <li>
          <strong>Ses tercihi</strong> — ses efektlerini ve müziği açık mı kapalı mı tuttuğunuz,
          seçtiğiniz ses seviyesi.
        </li>
      </ul>
      <p>
        Bunlar silinirse oyun yine çalışır; yalnızca tercihleriniz varsayılana döner.
      </p>

      <h2 id="ucuncu">3. Üçüncü taraf çerezleri</h2>
      <p>
        Kendi analitik veya reklam çerezimiz yoktur. Ancak aşağıdaki hizmetleri kullandığınızda ilgili
        sağlayıcı kendi çerezlerini yerleştirebilir:
      </p>
      <ul>
        <li>
          <strong>Google ile giriş:</strong> yalnızca bu butonu kullandığınızda devreye girer.
          Google, oturumunuzu doğrulamak için kendi çerezlerini kullanır.
        </li>
        <li>
          <strong>Google reCAPTCHA:</strong> e-posta ile kayıt ekranındaki &quot;Ben robot
          değilim&quot; doğrulaması. Google, bot olup olmadığınızı anlamak için çerez ve tarayıcı
          etkileşimi verisi kullanır.
        </li>
        <li>
          <strong>Google Fonts:</strong> sitenin yazı tipleri Google sunucularından yüklenir.
        </li>
      </ul>
      <p>
        Bu hizmetlerin veri işleme uygulamaları Google&apos;ın kendi gizlilik politikasına tabidir ve
        bizim kontrolümüz dışındadır.
      </p>

      <h2 id="kullanmadiklarimiz">4. Kullanmadıklarımız</h2>
      <ul>
        <li>Reklam veya yeniden hedefleme (retargeting) çerezleri.</li>
        <li>Sizi başka sitelerde takip eden üçüncü taraf izleyiciler.</li>
        <li>Kişisel verilerinizi reklam ağlarına aktaran araçlar.</li>
        <li>Sosyal medya takip pikselleri.</li>
      </ul>

      <h2 id="yonetim">5. Nasıl temizler veya engellersiniz?</h2>
      <p>
        Platform&apos;dan <strong>Çıkış Yap</strong> demeniz giriş jetonunuzu ve profil özetinizi
        siler. Tümünü temizlemek isterseniz tarayıcınızın site verilerini silme özelliğini
        kullanabilirsiniz:
      </p>
      <ul>
        <li>
          <strong>Chrome:</strong> Ayarlar → Gizlilik ve güvenlik → Tarama verilerini temizle
        </li>
        <li>
          <strong>Safari:</strong> Ayarlar → Safari → Geçmişi ve Web Sitesi Verilerini Sil
        </li>
        <li>
          <strong>Firefox:</strong> Ayarlar → Gizlilik ve Güvenlik → Çerezler ve Site Verileri
        </li>
        <li>
          <strong>Edge:</strong> Ayarlar → Çerezler ve site izinleri
        </li>
      </ul>
      <p>
        <strong>Dikkat:</strong> Zorunlu kayıtları sildiğinizde oturumunuz kapanır ve yeniden giriş
        yapmanız gerekir. Misafir olarak oynuyorsanız misafir kimliğiniz kaybolur ve o kimliğe bağlı
        oyun ilerlemeniz <strong>geri getirilemez</strong>. Tarayıcınızdan tüm çerezleri engellerseniz
        giriş yapmanız mümkün olmayabilir.
      </p>

      <h2 id="degisiklik">6. Değişiklikler</h2>
      <p>
        Platform&apos;a yeni bir özellik eklediğimizde bu politikayı güncelleyebiliriz. Güncel sürüm
        her zaman bu sayfada yayımlanır ve yukarıdaki &quot;son güncelleme&quot; tarihi değiştirilir.
      </p>

      <h2 id="iletisim">7. İletişim</h2>
      <p>
        Çerezler ve saklanan veriler hakkındaki sorularınız için:
        <br />
        <strong>{COMPANY.legalName}</strong>
        <br />
        E-posta: <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>
      </p>
      <p>
        Kişisel verilerinizin işlenmesine ilişkin ayrıntılar için{" "}
        <a href="/gizlilik">Gizlilik Politikası ve KVKK Aydınlatma Metni</a> sayfamıza bakabilirsiniz.
      </p>

      <p style={{ marginTop: 24, fontSize: 13, fontStyle: "italic", color: "var(--text-dim)" }}>
        Not: Bu metin bilgilendirme amaçlıdır ve hukuki danışmanlık yerine geçmez. Yayına
        girmeden önce bir hukuk danışmanına inceletilmesi önerilir.
      </p>
    </LegalPage>
  );
}
