import LegalPage from "@/components/LegalPage";
import CookiePreferenceButton from "@/components/CookiePreferenceButton";
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
        şeyler oyunun çalışması, tercihlerinizin hatırlanması ve siteyi geliştirmemize yardımcı olan
        anonim ziyaret istatistikleri içindir.
      </p>
      <p>
        Ziyaret istatistikleri için <strong>Google Analytics</strong> kullanıyoruz ve bunu{" "}
        <strong>istediğiniz zaman kapatabilirsiniz</strong> — aşağıdaki{" "}
        <a href="#tercih">çerez tercihiniz</a> bölümünden.
      </p>

      <nav className="legal-toc">
        <ol>
          <li><a href="#nedir">Çerez ve yerel depolama nedir?</a></li>
          <li><a href="#neler">Tarayıcınızda ne saklıyoruz?</a></li>
          <li><a href="#analitik">Ziyaret istatistikleri (Google Analytics)</a></li>
          <li><a href="#ucuncu">Diğer üçüncü taraf hizmetler</a></li>
          <li><a href="#kullanmadiklarimiz">Kullanmadıklarımız</a></li>
          <li><a href="#tercih">Çerez tercihiniz</a></li>
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

      <h3>2.3 İstatistik — kapatılabilir</h3>
      <ul>
        <li>
          <strong>kt_cookie_consent</strong> — çerez bandında verdiğiniz kararı (kabul/ret) saklar.
          Bandın her ziyarette yeniden çıkmaması için gereklidir.
        </li>
        <li>
          <strong>Google Analytics çerezleri</strong> (<code>_ga</code>, <code>_ga_*</code>) —
          ziyaretinizi ölçmek için Google tarafından yerleştirilir. Ayrıntılar bir sonraki bölümde.
        </li>
      </ul>

      <h2 id="analitik">3. Ziyaret istatistikleri (Google Analytics)</h2>
      <p>
        Sitenin hangi bölümlerinin kullanıldığını, hangi cihazlarda sorun yaşandığını ve
        ziyaretçi sayısını anlamak için <strong>Google Analytics 4</strong> kullanıyoruz. Amaç
        oyunu geliştirmektir; kimseyi kişisel olarak tanımlamaya çalışmayız.
      </p>
      <ul>
        <li>
          Ölçüm <strong>anonim</strong> yapılır: IP adresiniz kısaltılarak işlenir
          (<em>anonymize_ip</em>) ve adınız, e-postanız gibi kimlik bilgileriniz Google&apos;a
          gönderilmez.
        </li>
        <li>
          Toplanan tipik veriler: ziyaret ettiğiniz sayfalar, sitede geçirdiğiniz süre, yaklaşık
          konum (şehir düzeyinde), cihaz ve tarayıcı türü, siteye nereden geldiğiniz.
        </li>
        <li>
          Bu ölçümü <strong>reddedebilirsiniz</strong>; reddettiğinizde Google Analytics anında
          durur ve sonraki ziyaretlerinizde hiç yüklenmez. Oyun tüm özellikleriyle çalışmaya devam
          eder.
        </li>
      </ul>
      <p>
        Google Analytics, Google Ireland Limited tarafından sağlanır ve veriler Google&apos;ın
        sunucularında işlenebilir. Google&apos;ın bu verileri nasıl kullandığı kendi gizlilik
        politikasına tabidir.
      </p>

      <h2 id="ucuncu">4. Diğer üçüncü taraf hizmetler</h2>
      <p>
        Aşağıdaki hizmetleri kullandığınızda ilgili sağlayıcı kendi çerezlerini yerleştirebilir:
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

      <h2 id="kullanmadiklarimiz">5. Kullanmadıklarımız</h2>
      <ul>
        <li>Reklam veya yeniden hedefleme (retargeting) çerezleri.</li>
        <li>Kişisel verilerinizi reklam ağlarına aktaran araçlar.</li>
        <li>Sosyal medya takip pikselleri.</li>
        <li>Google Analytics verilerinin reklam amacıyla kullanılmasına yönelik özellikler.</li>
      </ul>

      <h2 id="tercih">6. Çerez tercihiniz</h2>
      <p>
        Siteye ilk girdiğinizde alt kısımda bir bilgilendirme bandı çıkar. Karar verene kadar
        istatistik ölçümü çalışır; <strong>&quot;Reddet&quot;</strong> derseniz anında durur.
        Kararınızı sonradan değiştirmek isterseniz aşağıdaki butonu kullanabilirsiniz:
      </p>
      <CookiePreferenceButton />
      <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
        Not: Zorunlu ve tercih kayıtları (oturum, tema, ses) oyunun çalışması için gereklidir ve
        kapatılamaz; bunlar için üçüncü taraflara veri gönderilmez.
      </p>

      <h2 id="yonetim">7. Nasıl temizler veya engellersiniz?</h2>
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

      <h2 id="degisiklik">8. Değişiklikler</h2>
      <p>
        Platform&apos;a yeni bir özellik eklediğimizde bu politikayı güncelleyebiliriz. Güncel sürüm
        her zaman bu sayfada yayımlanır ve yukarıdaki &quot;son güncelleme&quot; tarihi değiştirilir.
      </p>

      <h2 id="iletisim">9. İletişim</h2>
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
