import LegalPage from "@/components/LegalPage";
import { COMPANY, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = {
  title: "Kullanım Koşulları — Kelime Tahmin",
  description:
    "Kelime Tahmin'i kullanırken geçerli olan kurallar: hesap, adil oyun, yasak davranışlar, fikri mülkiyet, sorumluluk ve hesap kapatma.",
};

export default function KosullarPage() {
  return (
    <LegalPage title="Kullanım Koşulları" updated={LEGAL_UPDATED}>
      <p>
        Bu koşullar, <strong>{COMPANY.name}</strong> tarafından işletilen{" "}
        <strong>{COMPANY.product}</strong> ({COMPANY.domain} — &quot;Platform&quot;) ile sizin
        aranızdaki sözleşmedir. Platform&apos;a girerek, hesap açarak veya misafir olarak oynayarak
        bu koşulları kabul etmiş olursunuz. Kabul etmiyorsanız Platform&apos;u kullanmamalısınız.
      </p>

      <nav className="legal-toc">
        <ol>
          <li><a href="#lisans">Size verdiğimiz kullanım hakkı</a></li>
          <li><a href="#uygunluk">Kimler oynayabilir</a></li>
          <li><a href="#hesap">Hesabınız</a></li>
          <li><a href="#misafir">Misafir oyun</a></li>
          <li><a href="#adil-oyun">Adil oyun ve yasak davranışlar</a></li>
          <li><a href="#icerik">Kullanıcı içeriği ve isimler</a></li>
          <li><a href="#sanal">Puan, rozet ve unvanların statüsü</a></li>
          <li><a href="#fikri">Fikri mülkiyet</a></li>
          <li><a href="#degisiklikler">Oyunda yapılabilecek değişiklikler</a></li>
          <li><a href="#ucuncu">Üçüncü taraf hizmetler</a></li>
          <li><a href="#askiya">Hesabın askıya alınması ve kapatılması</a></li>
          <li><a href="#garanti">Garanti reddi</a></li>
          <li><a href="#sorumluluk">Sorumluluğun sınırı</a></li>
          <li><a href="#tazminat">Tazmin yükümlülüğü</a></li>
          <li><a href="#kosul-degisiklik">Koşullardaki değişiklikler</a></li>
          <li><a href="#hukuk">Uygulanacak hukuk ve yetkili mahkeme</a></li>
          <li><a href="#iletisim">İletişim</a></li>
        </ol>
      </nav>

      <h2 id="lisans">1. Size verdiğimiz kullanım hakkı</h2>
      <p>
        Bu koşullara uyduğunuz sürece size Platform&apos;u <strong>kişisel ve ticari olmayan</strong>{" "}
        amaçlarla kullanmanız için sınırlı, devredilemez ve geri alınabilir bir hak veriyoruz. Bu hak
        size Platform üzerinde mülkiyet vermez. Özellikle şunlar yasaktır:
      </p>
      <ul>
        <li>Kaynak koda ulaşmaya çalışmak, tersine mühendislik yapmak veya oyunu kopyalamak.</li>
        <li>Kelime havuzunu, soruları veya diğer içerikleri toplu olarak çekmek (scraping, veri madenciliği).</li>
        <li>Platform&apos;u veya bir bölümünü izinsiz olarak satmak, kiralamak ya da yeniden yayımlamak.</li>
        <li>İzinsiz olarak reklam yerleştirmek veya Platform üzerinden ticari faaliyet yürütmek.</li>
      </ul>

      <h2 id="uygunluk">2. Kimler oynayabilir</h2>
      <p>
        Platform&apos;u kullanabilmek için en az <strong>{COMPANY.minAge} yaşında</strong> olmanız
        gerekir. 18 yaşından küçükseniz Platform&apos;u ancak veli veya vasinizin izniyle
        kullanabilirsiniz; bu koşulları onların da okuduğunu ve kabul ettiğini beyan etmiş
        olursunuz. İnternet bağlantısı ve cihaz masrafları size aittir.
      </p>

      <h2 id="hesap">3. Hesabınız</h2>
      <ul>
        <li>
          Kayıt olurken doğru bilgi vermeyi ve e-posta adresinizi güncel tutmayı kabul edersiniz.
        </li>
        <li>
          Şifrenizin gizliliğinden <strong>siz sorumlusunuz</strong>. Hesabınızdan yapılan tüm
          işlemler size ait sayılır.
        </li>
        <li>Hesabınızı başkasına satamaz, devredemez veya ortak kullandıramazsınız.</li>
        <li>
          Sıralamayı etkilemek amacıyla <strong>birden fazla hesap</strong> açmak yasaktır.
        </li>
        <li>
          Yetkisiz bir erişimden şüphelenirseniz derhal{" "}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine bildirin.
        </li>
      </ul>

      <h2 id="misafir">4. Misafir oyun</h2>
      <p>
        Üye olmadan misafir olarak oynayabilirsiniz. Misafir oyunlarda kalıcı bir hesabınız olmaz;
        ELO, XP, rozet, unvan, kupa ve sıralama <strong>kazanılmaz</strong>. Tarayıcı verilerinizi
        temizlediğinizde misafir kimliğiniz kaybolur ve geri getirilemez. Misafir oyuncuların adları
        Platform&apos;da gösterilmez.
      </p>

      <h2 id="adil-oyun">5. Adil oyun ve yasak davranışlar</h2>
      <p>Platform bir rekabet oyunudur; herkesin eşit şartlarda oynaması esastır. Şunlar yasaktır:</p>
      <ul>
        <li>
          <strong>Hile ve otomasyon:</strong> bot, makro, otomatik kelime çözücü, üçüncü taraf
          yardımcı yazılım kullanmak veya oyun trafiğini değiştirmek.
        </li>
        <li>
          <strong>Danışıklı oyun:</strong> sıralama yükseltmek için başka bir oyuncuyla anlaşarak
          kasten kazanmak/kaybetmek, sahte hesaplarla puan çiftçiliği yapmak.
        </li>
        <li>
          <strong>Taciz ve nefret söylemi:</strong> hakaret, küfür, tehdit, ayrımcılık, cinsel
          içerikli veya rahatsız edici davranışlar.
        </li>
        <li>
          <strong>Kimlik yanıltma:</strong> başka bir kişi, kurum veya Platform yetkilisi gibi
          davranmak.
        </li>
        <li>
          <strong>Teknik kötüye kullanım:</strong> sunuculara aşırı yük bindirmek, güvenlik
          açıklarından yararlanmak, izinsiz erişim denemesi yapmak, zararlı yazılım yaymak.
        </li>
        <li>Yasa dışı içerik paylaşmak veya yasa dışı faaliyette bulunmak.</li>
      </ul>
      <p>
        Bu kurallara aykırı davranış; uyarı, puan/rozet iptali, sıralamadan çıkarma, geçici askıya
        alma veya hesabın kalıcı olarak kapatılmasıyla sonuçlanabilir.
      </p>

      <h2 id="icerik">6. Kullanıcı içeriği ve isimler</h2>
      <p>
        Görünen adınız, kullanıcı adınız, avatarınız ve oda adları gibi girdiğiniz içeriklerden siz
        sorumlusunuz. Bu içerikler hakaret, küfür, nefret söylemi, cinsel içerik, reklam veya bir
        başkasının hakkını ihlal eden unsurlar barındıramaz. Uygunsuz bulduğumuz içeriği önceden
        bildirim yapmaksızın değiştirebilir veya kaldırabiliriz.
      </p>
      <p>
        Platform&apos;a içerik girerek, bu içeriği Platform&apos;un işletilmesi ve tanıtımı amacıyla
        kullanmamız için bize ücretsiz ve devredilebilir bir kullanım izni vermiş olursunuz. İçeriğin
        mülkiyeti sizde kalır.
      </p>

      <h2 id="sanal">7. Puan, rozet ve unvanların statüsü</h2>
      <p>
        ELO puanı, XP, seviye, rozet, unvan, kupa ve madalyalar yalnızca oyun içi ilerlemeyi gösteren
        <strong> dijital göstergelerdir</strong>. Bunların <strong>gerçek para karşılığı yoktur</strong>;
        satılamaz, devredilemez, nakde çevrilemez ve üzerlerinde mülkiyet hakkı doğurmaz. Denge
        ayarları, kural değişiklikleri veya hile tespiti nedeniyle bu değerleri güncelleyebilir ya da
        sıfırlayabiliriz. Özel Arena maçlarında bilinçli olarak kupa, madalya ve XP verilmez.
      </p>
      <p>
        Platform şu anda ücretli hizmet veya oyun içi satın alma sunmamaktadır. İleride sunulması
        hâlinde satın almalara ilişkin koşullar ve tüketici mevzuatından doğan cayma haklarınız ayrıca
        duyurulacaktır.
      </p>

      <h2 id="fikri">8. Fikri mülkiyet</h2>
      <p>
        Platform&apos;un yazılımı, tasarımı, arayüzü, logosu, marka adı, ses ve müzikleri, kelime
        havuzu ve tüm içeriği {COMPANY.name}&apos;ya veya lisans verenlerine aittir ve fikri mülkiyet
        mevzuatıyla korunur. Yazılı iznimiz olmadan kopyalanamaz, çoğaltılamaz, değiştirilemez veya
        dağıtılamaz. Oyun içi görüntülerinizi kişisel sosyal medya paylaşımlarınızda kullanmanız
        serbesttir.
      </p>

      <h2 id="degisiklikler">9. Oyunda yapılabilecek değişiklikler</h2>
      <p>
        Platform sürekli geliştirilen bir hizmettir. Oyun modlarını, kuralları, puanlama ve ödül
        sistemlerini değiştirebilir; özellik ekleyebilir veya kaldırabiliriz. Bakım, güncelleme veya
        teknik sorunlar nedeniyle hizmete geçici olarak ara verilebilir.
      </p>

      <h2 id="ucuncu">10. Üçüncü taraf hizmetler</h2>
      <p>
        Platform&apos;da Google ile giriş ve bot koruması (reCAPTCHA) gibi üçüncü taraf hizmetler
        kullanılır. Bu hizmetler kendi kullanım şartlarına ve gizlilik politikalarına tabidir. Dış
        bağlantılarla ulaşılan sitelerin içeriğinden sorumlu değiliz.
      </p>

      <h2 id="askiya">11. Hesabın askıya alınması ve kapatılması</h2>
      <p>
        Bu koşulları ihlal ettiğinizi tespit etmemiz hâlinde hesabınızı uyarı yaparak veya ağır
        ihlallerde doğrudan askıya alabilir ya da kapatabiliriz. Siz de dilediğiniz zaman hesabınızın
        silinmesini talep ederek sözleşmeyi sonlandırabilirsiniz — bkz.{" "}
        <a href="/gizlilik#silme">Gizlilik Politikası</a>. Hesap kapandığında oyun içi ilerlemeniz
        için herhangi bir bedel veya tazminat talep edilemez.
      </p>

      <h2 id="garanti">12. Garanti reddi</h2>
      <p>
        Platform, mevzuatın izin verdiği azami ölçüde <strong>&quot;olduğu gibi&quot;</strong> sunulur.
        Kesintisiz, hatasız veya her cihazda sorunsuz çalışacağını, sunucuların her zaman erişilebilir
        olacağını garanti etmiyoruz. Bu madde, tüketici mevzuatından doğan ve sözleşmeyle
        kaldırılamayan haklarınızı etkilemez.
      </p>

      <h2 id="sorumluluk">13. Sorumluluğun sınırı</h2>
      <p>
        Mevzuatın izin verdiği ölçüde; Platform&apos;un kullanımından doğan dolaylı zararlardan, kâr
        kaybından, veri kaybından, oyun ilerlemesinin kaybolmasından veya hizmet kesintilerinden
        sorumlu tutulamayız. Kasıt ve ağır ihmalimizden doğan sorumluluğumuz saklıdır.
      </p>

      <h2 id="tazminat">14. Tazmin yükümlülüğü</h2>
      <p>
        Bu koşulları ihlal etmeniz veya hukuka aykırı kullanımınız nedeniyle üçüncü kişilerce bize
        yöneltilen talep ve zararları karşılamayı kabul edersiniz.
      </p>

      <h2 id="kosul-degisiklik">15. Koşullardaki değişiklikler</h2>
      <p>
        Bu koşulları güncelleyebiliriz. Güncel metin her zaman bu sayfada yayımlanır ve
        &quot;son güncelleme&quot; tarihi değiştirilir. Önemli değişiklikleri Platform üzerinden
        duyururuz. Değişiklikten sonra Platform&apos;u kullanmaya devam etmeniz yeni koşulları kabul
        ettiğiniz anlamına gelir.
      </p>

      <h2 id="hukuk">16. Uygulanacak hukuk ve yetkili mahkeme</h2>
      <p>
        Bu koşullara <strong>Türkiye Cumhuriyeti hukuku</strong> uygulanır. Uyuşmazlıklarda Türkiye
        Cumhuriyeti mahkemeleri ve icra daireleri yetkilidir. Tüketici sıfatıyla, ikametgâhınızın
        bulunduğu yerdeki tüketici hakem heyetlerine ve tüketici mahkemelerine başvurma hakkınız
        saklıdır.
      </p>

      <h2 id="iletisim">17. İletişim</h2>
      <p>
        <strong>{COMPANY.legalName}</strong>
        <br />
        E-posta: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
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
