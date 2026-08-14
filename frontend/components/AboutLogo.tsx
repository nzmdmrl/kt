"use client";

import AnimatedWordmark from "@/components/AnimatedWordmark";

/**
 * Hakkımızda sayfasının tepesindeki KARE logo.
 *
 * KELİME / TAHMİN / OYUNU✓ alt alta, ana sayfadaki gibi tek tek çevrilerek
 * (sesli) açılır. Kare çerçeve ve çevresindeki boşluk bilinçli: ekran görüntüsü
 * alınıp sosyal medyada profil fotoğrafı olarak kullanılabilsin.
 */
export default function AboutLogo() {
  return (
    <div className="kt-about-logo">
      <AnimatedWordmark variant="square" />
    </div>
  );
}
