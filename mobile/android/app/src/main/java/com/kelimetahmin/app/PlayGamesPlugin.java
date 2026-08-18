package com.kelimetahmin.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;

/**
 * Play Games Services v2 girisi — YEREL Capacitor eklentisi (npm paketi yok).
 *
 * Kullandigi tek kutuphane: com.google.android.gms:play-services-games-v2
 * (surum android/variables.gradle -> playServicesGamesVersion). Firebase gerekmez.
 *
 * Bu dosya `npx cap sync` tarafindan URETILMEZ, elle bakilan kaynaktir; sync
 * uzerine yazmaz. Eklenti otomatik taninmaz, MainActivity'de registerPlugin ile
 * kaydedilir.
 *
 * JS tarafi: Capacitor.Plugins.PlayGames.{isAuthenticated,signIn,requestServerSideAccess}
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    /** Uygulama acilirken bir kez calisir; SDK burada sessiz girisi kendi dener. */
    @Override
    public void load() {
        PlayGamesSdk.initialize(getContext());
    }

    /** Ekran ACMADAN sorar: cihaz zaten oturum acmis mi? */
    @PluginMethod
    public void isAuthenticated(PluginCall call) {
        getActivity().runOnUiThread(() ->
            client().isAuthenticated().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) { fail(call, task.getException()); return; }
                resolveAuth(call, task.getResult().isAuthenticated());
            })
        );
    }

    /** Gerekirse Play Games giris ekranini acar. */
    @PluginMethod
    public void signIn(PluginCall call) {
        getActivity().runOnUiThread(() ->
            client().signIn().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) { fail(call, task.getException()); return; }
                resolveAuth(call, task.getResult().isAuthenticated());
            })
        );
    }

    /**
     * Sunucumuzun kullanacagi tek kullanimlik yetki kodu (OAuth authorization code).
     * serverClientId = Google Cloud'daki WEB istemci kimligi (Android'inki degil).
     */
    @PluginMethod
    public void requestServerSideAccess(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("serverClientId zorunlu");
            return;
        }
        boolean forceRefresh = Boolean.TRUE.equals(call.getBoolean("forceRefreshToken", false));
        getActivity().runOnUiThread(() ->
            client().requestServerSideAccess(serverClientId, forceRefresh).addOnCompleteListener(task -> {
                if (!task.isSuccessful()) { fail(call, task.getException()); return; }
                JSObject res = new JSObject();
                res.put("serverAuthCode", task.getResult());
                call.resolve(res);
            })
        );
    }

    private GamesSignInClient client() {
        return PlayGames.getGamesSignInClient(getActivity());
    }

    private void resolveAuth(PluginCall call, boolean authenticated) {
        JSObject res = new JSObject();
        res.put("authenticated", authenticated);
        call.resolve(res);
    }

    private void fail(PluginCall call, Exception e) {
        call.reject(e == null ? "Play Games hatasi" : e.getMessage(), e);
    }
}
