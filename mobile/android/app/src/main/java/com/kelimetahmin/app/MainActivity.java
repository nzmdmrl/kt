package com.kelimetahmin.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Yerel (npm'siz) eklentiler burada kaydedilir. npm eklentileri
        // capacitor.plugins.json uzerinden otomatik gelir, bunlar gelmez.
        // registerPlugin cagrisi super.onCreate'ten ONCE olmali.
        registerPlugin(PlayGamesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
