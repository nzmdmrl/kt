package com.kelimetahmin.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
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
                JSObject res = new JSObject();
                boolean ok = task.isSuccessful();
                res.put("taskSuccessful", ok);
                res.put("authenticated", ok && task.getResult() != null
                        && task.getResult().isAuthenticated());
                describe(res, task.getException());
                call.resolve(res);
            })
        );
    }

    /**
     * Gerekirse Play Games giris ekranini acar.
     *
     * ASLA reject ETMEZ — her zaman resolve eder ve TESHIS ALANLARINI doldurur.
     * Sebep: Play Games v2'de signIn BASARISIZ oldugunda Task cogu zaman
     * "successful" doner, sadece isAuthenticated() false olur; ortada exception
     * YOKTUR. "Basarisiz" demek yetmedigi icin elde ne varsa toplaniyor:
     *   taskSuccessful  - Task'in kendisi hata verdi mi
     *   exceptionClass  - varsa istisnanin sinifi
     *   message         - varsa istisnanin ham metni
     *   statusCode      - ApiException ise Google'in sayisal kodu
     *   statusName      - o kodun adi (SIGN_IN_REQUIRED, DEVELOPER_ERROR...)
     *   playerProbe     - asagiya bak
     *
     * playerProbe: Task exception tasimadiginda Google'in kodunu ogrenmenin tek
     * yolu bir oyuncu sorgusu denemektir. getCurrentPlayer() oturum yokken
     * ApiException firlatir ve O istisna gercek durum kodunu tasir
     * (ornegin DEVELOPER_ERROR = Play Console/imza/OAuth istemcisi uyusmuyor,
     * SIGN_IN_REQUIRED = kullanici girmedi, NETWORK_ERROR = aglayamadi).
     * Yalnizca giris basarisizken calisir; basarili akisa maliyet bindirmez.
     */
    @PluginMethod
    public void signIn(PluginCall call) {
        getActivity().runOnUiThread(() ->
            client().signIn().addOnCompleteListener(task -> {
                JSObject res = new JSObject();
                boolean ok = task.isSuccessful();
                res.put("taskSuccessful", ok);

                boolean authenticated = false;
                if (ok && task.getResult() != null) {
                    authenticated = task.getResult().isAuthenticated();
                }
                res.put("authenticated", authenticated);
                describe(res, task.getException());

                if (authenticated) {
                    call.resolve(res);
                    return;
                }
                // Giris olmadi: gercek durum kodunu oyuncu sorgusundan cikarmaya calis.
                probePlayer(call, res);
            })
        );
    }

    /** Istisnayi teshis alanlarina acar (null ise alanlar bos kalir). */
    private void describe(JSObject res, Exception e) {
        if (e == null) return;
        res.put("exceptionClass", e.getClass().getName());
        res.put("message", String.valueOf(e.getMessage()));
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            res.put("statusCode", code);
            res.put("statusName", CommonStatusCodes.getStatusCodeString(code));
        }
    }

    /** getCurrentPlayer() denemesi — amaci veri degil, GOOGLE'IN HATA KODU. */
    private void probePlayer(PluginCall call, JSObject res) {
        try {
            PlayGames.getPlayersClient(getActivity()).getCurrentPlayer()
                .addOnCompleteListener(t -> {
                    if (t.isSuccessful()) {
                        // Beklenmedik ama mumkun: giris aslinda olmus.
                        res.put("playerProbe", "basarili");
                    } else {
                        Exception pe = t.getException();
                        res.put("playerProbe", pe == null ? "bilinmeyen hata" : pe.getClass().getSimpleName());
                        JSObject probe = new JSObject();
                        describe(probe, pe);
                        res.put("probe", probe);
                    }
                    call.resolve(res);
                });
        } catch (Exception e) {
            res.put("playerProbe", "cagrilamadi: " + e.getMessage());
            call.resolve(res);
        }
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

    private void fail(PluginCall call, Exception e) {
        call.reject(e == null ? "Play Games hatasi" : e.getMessage(), e);
    }
}
