export default function Logo({ size = 44 }: { size?: number }) {
  // "KT" monogramı — iki kutu içinde K ve T, oyunun grid diline gönderme.
  // Renk/kenar/gölge globals.css'teki .kt-logo-* sınıflarından gelir; böylece
  // arayüz stili 2'de (yeşil K / sarı T) tek yerden değiştirilebiliyor.
  return (
    <span className="kt-logo" style={{ ["--kt-logo-size" as any]: `${size}px` }} aria-hidden>
      <span className="kt-logo-tile kt-logo-tile--k">K</span>
      <span className="kt-logo-tile kt-logo-tile--t">T</span>
    </span>
  );
}
