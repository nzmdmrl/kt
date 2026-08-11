import LegalPage from "@/components/LegalPage";
import { COMPANY, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = {
  title: "Gizlilik Politikası ve KVKK Aydınlatma Metni — Kelime Tahmin",
  description:
    "Kelime Tahmin'de hangi kişisel verilerin işlendiğini, ne amaçla kullanıldığını, ne kadar saklandığını ve KVKK kapsamındaki haklarınızı açıklar.",
};

export default function GizlilikPage() {
  return (
    <LegalPage title="Gizlilik Politikası ve KVKK Aydınlatma Metni" updated={LEGAL_UPDATED}>
      <p>
        <strong>{COMPANY.product}</strong> ({COMPANY.domain} — bundan sonra
        &quot;Platform&quot;), <strong>{COMPANY.name}</strong> tarafından işletilmektedir. Bu
        metin, Platform&apos;u kullandığınızda hangi kişisel verilerinizi topladığımızı, bunları
        neden ve hangi hukuki sebeple işlediğimizi, kimlerle paylaştığımızı, ne kadar süreyle
        sakladığımızı ve 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;)
        kapsamındaki haklarınızı açıklar.
      </p>
      <p>
        Temel yaklaşımımız şudur: <strong>oyunu çalıştırmak için gerekenden fazla veri
        toplamayız.</strong> Kişisel verilerinizi satmayız ve reklam amacıyla üçüncü taraflara
        pazarlamayız.
      </p>

      <nav className="legal-toc">
        <ol>
          <li><a href="#veri-sorumlusu">Veri sorumlusu</a></li>
          <li><a href="#toplanan">Topladığımız veriler</a></li>
          <li><a href="#amac">İşleme amaçlarımız</a></li>
          <li><a href="#hukuki">Hukuki sebepler</a></li>
          <li><a href="#herkese-acik">Herkese açık olan bilgiler</a></li>
          <li><a href="#cerez">Çerezler ve yerel depolama</a></li>
          <li><a href="#ucuncu-taraf">Üçüncü taraf hizmetler ve paylaşım</a></li>
          <li><a href="#yurtdisi">Yurt dışına aktarım</a></li>
          <li><a href="#saklama">Saklama süreleri</a></li>
          <li><a href="#guvenlik">Veri güvenliği</a></li>
          <li><a href="#cocuk">Çocukların gizliliği</a></li>
          <li><a href="#haklar">KVKK kapsamındaki haklarınız</a></li>
          <li><a href="#silme">Hesabınızı silmek</a></li>
          <li><a href="#degisiklik">Bu metindeki değişiklikler</a></li>
          <li><a href="#iletisim">İletişim</a></li>
        </ol>
      </nav>

      <h2 id="veri-sorumlusu">1. Veri sorumlusu</h2>
      <p>
        KVKK anlamında veri sorumlusu <strong>{COMPANY.legalName}</strong>&apos;dır.
        <br />
        Adres: {COMPANY.address}
        <br />
        E-posta: <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>
      </p>

      <h2 id="toplanan">2. Topladığımız veriler</h2>

      <h3>2.1 Bize doğrudan verdikleriniz</h3>
      <ul>
        <li>
          <strong>Hesap bilgileri:</strong> e-posta adresi, kullanıcı adı, görünen ad ve şifreniz.
          Şifreniz açık metin olarak <em>saklanmaz</em>; yalnızca geri döndürülemez şekilde
          şifrelenmiş (hash) hâli tutulur — biz dahil kimse şifrenizi göremez.
        </li>
        <li>
          <strong>Profil bilgileri:</strong> avatar/profil görseliniz ve profilinizde göstermeyi
          seçtiğiniz diğer bilgiler.
        </li>
        <li>
          <strong>İletişim içeriği:</strong> bize destek veya şikâyet için yazdığınızda gönderdiğiniz
          mesaj ve iletişim bilginiz.
        </li>
        <li>
          <strong>Oyun içi etkileşimler:</strong> arkadaşlık istekleri, maç içi hazır ifadeler
          (emote) ve oda davetleri.
        </li>
      </ul>

      <h3>2.2 Oyun oynarken oluşan veriler</h3>
      <ul>
        <li>Maç ve arena sonuçlarınız, tahminleriniz, süreleriniz ve puanlarınız.</li>
        <li>ELO puanı, XP, seviye, unvan, rozetler, kupa ve madalyalar.</li>
        <li>Lig sıralaması için günlük/aylık/tüm zamanlar skorlarınız.</li>
        <li>Maraton ve Günün Kelimesi ilerlemeniz.</li>
      </ul>

      <h3>2.3 Otomatik olarak toplanan teknik veriler</h3>
      <ul>
        <li>
          <strong>Sunucu kayıtları:</strong> IP adresi, istek zamanı, tarayıcı ve işletim sistemi
          bilgisi. Bunlar hata ayıklama, kötüye kullanım (bot, hile, saldırı) tespiti ve yasal
          yükümlülükler için tutulur.
        </li>
        <li>
          <strong>Oturum verisi:</strong> giriş jetonunuz (JWT) ve çevrim içi durumunuz.
        </li>
      </ul>

      <h3>2.4 Üçüncü taraflardan gelen veriler</h3>
      <p>
        <strong>Google ile giriş</strong> yaparsanız Google bize yalnızca temel kimlik bilgilerini
        iletir: Google hesap kimliğiniz (sub), e-posta adresiniz, adınız ve varsa profil
        fotoğrafınızın adresi. Google şifrenizi <em>hiçbir zaman</em> görmeyiz.
      </p>

      <h3>2.5 Misafir oyuncular</h3>
      <p>
        Üye olmadan da oynayabilirsiniz. Misafir oynarken hesap açılmaz; tarayıcınızda geçici bir
        misafir kimliği oluşturulur. <strong>Misafir oyuncuların adları hiçbir yerde
        gösterilmez</strong> — maç kayıtlarında yalnızca &quot;Misafir&quot; olarak görünürler ve
        misafir oyuncular puan, rozet veya sıralama kazanmaz.
      </p>

      <h2 id="amac">3. İşleme amaçlarımız</h2>
      <ul>
        <li>Hesabınızı oluşturmak, girişinizi sağlamak ve oturumunuzu sürdürmek.</li>
        <li>Oyunu çalıştırmak: rakip eşleştirme, maç ve arena akışı, sonuçların hesaplanması.</li>
        <li>Sıralama, lig, rozet, unvan ve ödül sistemlerini işletmek.</li>
        <li>Arkadaşlık, davet ve bildirim özelliklerini sunmak.</li>
        <li>Hile, bot kullanımı, çoklu hesap ve kötüye kullanımı tespit edip önlemek.</li>
        <li>Hataları gidermek, performansı ölçmek ve oyunu geliştirmek.</li>
        <li>Destek taleplerinizi yanıtlamak.</li>
        <li>Yasal yükümlülüklerimizi yerine getirmek.</li>
      </ul>

      <h2 id="hukuki">4. Hukuki sebepler</h2>
      <p>Verilerinizi KVKK m.5 kapsamında şu sebeplere dayanarak işleriz:</p>
      <ul>
        <li>
          <strong>Sözleşmenin kurulması ve ifası:</strong> hesabınızı açmak ve size oyun hizmetini
          sunmak için zorunlu olan veriler.
        </li>
        <li>
          <strong>Meşru menfaat:</strong> hile ve kötüye kullanım tespiti, güvenlik, hata ayıklama
          ve hizmet iyileştirme.
        </li>
        <li>
          <strong>Hukuki yükümlülük:</strong> mevzuatın saklamamızı veya yetkili makamlara
          bildirmemizi zorunlu kıldığı kayıtlar.
        </li>
        <li>
          <strong>Açık rıza:</strong> zorunlu olmayan durumlarda (örneğin isteğe bağlı bildirimler)
          onayınıza dayanırız; rızanızı dilediğiniz an geri çekebilirsiniz.
        </li>
      </ul>

      <h2 id="herkese-acik">5. Herkese açık olan bilgiler</h2>
      <p>Bu bir çok oyunculu oyun olduğu için bazı bilgiler diğer oyuncular tarafından görülür:</p>
      <ul>
        <li>Görünen adınız, kullanıcı adınız ve avatarınız.</li>
        <li>Seviyeniz, unvanınız, rozetleriniz, kupa ve madalyalarınız.</li>
        <li>ELO puanınız, maç istatistikleriniz ve lig sıralamanız.</li>
      </ul>
      <p>
        <strong>E-posta adresiniz hiçbir zaman diğer oyunculara gösterilmez.</strong> Görünen
        adınızı istediğiniz zaman profil ayarlarından değiştirebilirsiniz — gerçek adınızı
        kullanmak zorunda değilsiniz.
      </p>

      <h2 id="cerez">6. Çerezler ve yerel depolama</h2>
      <p>
        Platform, reklam veya profilleme amaçlı çerez kullanmaz. Oturumunuzu ve tercihlerinizi
        (tema, ses) hatırlamak için tarayıcınızın yerel depolaması (localStorage) kullanılır.
        Ayrıntılar için <a href="/cerez">Çerez Politikası</a> sayfamıza bakabilirsiniz.
      </p>

      <h2 id="ucuncu-taraf">7. Üçüncü taraf hizmetler ve paylaşım</h2>
      <p>
        Kişisel verilerinizi <strong>satmayız</strong> ve reklam amacıyla üçüncü taraflara
        aktarmayız. Yalnızca hizmetin çalışması için gerekli olan aşağıdaki tedarikçilerle
        paylaşırız:
      </p>
      <ul>
        <li>
          <strong>Sunucu ve altyapı sağlayıcısı:</strong> Platform verilerinin barındırıldığı
          veri merkezi hizmeti.
        </li>
        <li>
          <strong>Google — &quot;Google ile giriş&quot;:</strong> yalnızca bu yöntemi seçerseniz
          devreye girer. Google&apos;ın veri işleme uygulamaları kendi gizlilik politikasına tabidir.
        </li>
        <li>
          <strong>Google reCAPTCHA:</strong> e-posta ile kayıt sırasında bot kayıtlarını engellemek
          için kullanılır. Bu doğrulama sırasında Google, IP adresiniz ve tarayıcı etkileşimleriniz
          gibi verileri kendi politikaları kapsamında işler.
        </li>
      </ul>
      <p>
        Bunların dışında verilerinizi yalnızca <strong>yasal bir zorunluluk</strong> hâlinde
        (mahkeme kararı, yetkili kamu kurumu talebi) veya haklarımızı korumak için gerekli olduğunda
        paylaşırız.
      </p>

      <h2 id="yurtdisi">8. Yurt dışına aktarım</h2>
      <p>
        Kullandığımız barındırma ve giriş hizmetleri, sunucuları yurt dışında bulunan sağlayıcılar
        olabilir. Bu durumda kişisel verileriniz KVKK m.9 kapsamında, gerekli güvenlik önlemleri ve
        sözleşmesel taahhütler sağlanarak yurt dışına aktarılır. Platform&apos;u kullanarak bu
        aktarımdan haberdar olduğunuzu kabul edersiniz.
      </p>

      <h2 id="saklama">9. Saklama süreleri</h2>
      <ul>
        <li>
          <strong>Hesap ve profil verileri:</strong> hesabınız açık olduğu sürece saklanır; hesabınızı
          silerseniz kaldırılır.
        </li>
        <li>
          <strong>Maç, arena ve sıralama kayıtları:</strong> hesabınız silinse dahi oyun geçmişi ve
          sıralama bütünlüğü için kimliğinizle ilişkilendirilemeyecek (anonim) biçimde kalabilir.
        </li>
        <li>
          <strong>Sunucu kayıtları (log):</strong> genellikle <strong>12 aya kadar</strong>, güvenlik
          ve hata ayıklama amacıyla.
        </li>
        <li>
          <strong>Destek yazışmaları:</strong> talebin çözülmesinden sonra makul bir süre.
        </li>
        <li>
          Mevzuatın daha uzun saklama öngördüğü hâllerde ilgili süre uygulanır.
        </li>
      </ul>

      <h2 id="guvenlik">10. Veri güvenliği</h2>
      <ul>
        <li>Tüm trafik HTTPS ile şifrelenerek taşınır.</li>
        <li>Şifreler geri döndürülemez şekilde (hash) saklanır.</li>
        <li>Oturumlar süreli jetonlarla (JWT) yönetilir.</li>
        <li>Kayıt işlemlerinde bot koruması (reCAPTCHA) uygulanır.</li>
        <li>Veritabanına erişim yetkili kişilerle sınırlıdır ve düzenli yedek alınır.</li>
      </ul>
      <p>
        Hiçbir sistemin %100 güvenli olmadığını hatırlatırız. Hesabınızın güvenliği için güçlü ve
        başka sitelerde kullanmadığınız bir şifre seçmenizi öneririz. Bir güvenlik açığı fark
        ederseniz lütfen <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresinden bize
        bildirin.
      </p>

      <h2 id="cocuk">11. Çocukların gizliliği</h2>
      <p>
        Platform {COMPANY.minAge} yaşından küçükler için tasarlanmamıştır ve bilerek bu yaşın
        altındaki kullanıcılardan veri toplamayız. {COMPANY.minAge}–18 yaş arasındaysanız
        Platform&apos;u ancak veli veya vasinizin bilgisi ve izniyle kullanabilirsiniz. Çocuğunuza
        ait bir hesap olduğunu düşünüyorsanız bize yazın; hesabı ve verileri sileriz.
      </p>

      <h2 id="haklar">12. KVKK kapsamındaki haklarınız</h2>
      <p>KVKK m.11 uyarınca şu haklara sahipsiniz:</p>
      <ul>
        <li>Kişisel verinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme.</li>
        <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme.</li>
        <li>Yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme.</li>
        <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme.</li>
        <li>Silinmesini veya yok edilmesini isteme.</li>
        <li>Düzeltme/silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme.</li>
        <li>
          Yalnızca otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç doğmasına itiraz
          etme.
        </li>
        <li>Hukuka aykırı işleme sebebiyle zarara uğrarsanız zararın giderilmesini talep etme.</li>
        <li>Verdiğiniz açık rızayı geri çekme.</li>
      </ul>
      <p>
        Başvurunuzu <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a> adresine
        veya yukarıdaki posta adresine iletebilirsiniz. Talebinizi en geç{" "}
        <strong>30 gün</strong> içinde sonuçlandırırız. Sonuçtan memnun kalmazsanız Kişisel Verileri
        Koruma Kurulu&apos;na şikâyette bulunma hakkınız saklıdır.
      </p>

      <h2 id="silme">13. Hesabınızı silmek</h2>
      <p>
        Hesabınızı ve ilişkili kişisel verilerinizi silmemizi istediğinizde talebiniz karşılanır.
        Silme işleminden sonra kullanıcı adınız, e-postanız, profil bilgileriniz ve arkadaş
        listeniz kaldırılır. Diğer oyuncuların maç geçmişinde adınız yerine anonim bir ifade
        görünür. Bu işlem <strong>geri alınamaz</strong>; puanlarınız, rozetleriniz ve unvanlarınız
        kurtarılamaz.
      </p>

      <h2 id="degisiklik">14. Bu metindeki değişiklikler</h2>
      <p>
        Bu metni zaman zaman güncelleyebiliriz. Güncel sürüm her zaman bu sayfada yayımlanır ve
        yukarıdaki &quot;son güncelleme&quot; tarihi değiştirilir. Önemli değişikliklerde
        Platform üzerinden ayrıca bilgilendirme yaparız.
      </p>

      <h2 id="iletisim">15. İletişim</h2>
      <p>
        Gizlilikle ilgili her türlü soru, talep ve şikâyetiniz için:
        <br />
        <strong>{COMPANY.legalName}</strong>
        <br />
        E-posta: <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>
        <br />
        Adres: {COMPANY.address}
      </p>

      <p style={{ marginTop: 24, fontSize: 13, fontStyle: "italic", color: "var(--text-dim)" }}>
        Not: Bu metin bilgilendirme amaçlıdır ve hukuki danışmanlık yerine geçmez. Yayına
        girmeden önce bir hukuk danışmanına inceletilmesi önerilir.
      </p>
    </LegalPage>
  );
}
