package com.kelimetahmin.app;

import com.getcapacitor.BridgeActivity;

/**
 * Uygulamanin tek Activity'si.
 *
 * Burada YEREL (npm'siz) Capacitor eklentileri registerPlugin ile kaydedilirdi.
 * Asama 5'te Play Games eklentisi tamamen sokuldugu icin oyle bir eklenti
 * kalmadi; npm eklentileri zaten capacitor.plugins.json uzerinden otomatik
 * geliyor. Yeni bir yerel eklenti eklenirse registerPlugin cagrisi
 * super.onCreate'ten ONCE yapilmali.
 */
public class MainActivity extends BridgeActivity {
}
