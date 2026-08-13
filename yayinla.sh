#!/bin/bash
set -e

MESAJ="$1"

if [ -z "$MESAJ" ]; then
  echo "HATA: Commit mesajı gerekli."
  echo "Kullanım: ./yayinla.sh \"commit mesajı\""
  exit 1
fi

cd /root/projeler/kelimetahmin

echo "==> mobile-app dalına geçiliyor..."
git checkout mobile-app

echo "==> Değişiklikler ekleniyor..."
git add -A

echo "==> Commit yapılıyor: $MESAJ"
git commit -m "$MESAJ" || echo "    (Commit edilecek değişiklik yok, devam ediliyor)"

echo "==> mobile-app sunucuya gönderiliyor..."
git push origin mobile-app

echo "==> main dalına geçiliyor..."
git checkout main

echo "==> mobile-app main'e birleştiriliyor..."
git merge mobile-app --no-edit

echo "==> main sunucuya gönderiliyor..."
git push origin main

echo "==> mobile-app dalına geri dönülüyor..."
git checkout mobile-app

echo ""
echo "✅ Tamamlandı! Şimdi Coolify'da Deploy butonuna bas."
