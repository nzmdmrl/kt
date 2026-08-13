/* Kelime Tahmin — web push service worker.
 *
 * Bu dosya STATİK'tir (public/), derlenmez. Firebase yapılandırması kendi
 * sorgu dizesinden okunur; böylece anahtarlar dosyaya gömülmez ve admin
 * panelinden değiştirilebilir:
 *
 *   /firebase-messaging-sw.js?apiKey=...&projectId=...&appId=...&messagingSenderId=...
 *
 * (Kayıt lib/webpush.ts içinde yapılır.)
 */

/* Sürüm, npm'deki firebase paketiyle aynı tutulmalı (frontend/package.json). */
var FB_VERSION = "12.17.1";
importScripts("https://www.gstatic.com/firebasejs/" + FB_VERSION + "/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/" + FB_VERSION + "/firebase-messaging-compat.js");

var params = new URL(self.location).searchParams;
var projectId = params.get("projectId") || "";

try {
  firebase.initializeApp({
    apiKey: params.get("apiKey") || "",
    authDomain: projectId ? projectId + ".firebaseapp.com" : "",
    projectId: projectId,
    messagingSenderId: params.get("messagingSenderId") || "",
    appId: params.get("appId") || "",
  });
  // Arka plan bildirimlerini FCM'in kendisi gösterir (yükte "notification" var).
  firebase.messaging();
} catch (e) {
  // Yapılandırma eksikse SW yine kurulur; sadece push almaz.
}

/** Bildirim yükünün farklı biçimlerinden hedef yolu çıkarır. */
function routeFromNotification(n) {
  var d = (n && n.data) || {};
  var fcm = d.FCM_MSG || {};
  var route =
    d.route ||
    (fcm.data && fcm.data.route) ||
    (fcm.notification && fcm.notification.click_action) ||
    (fcm.fcmOptions && fcm.fcmOptions.link) ||
    (d.fcmOptions && d.fcmOptions.link) ||
    "/";
  // Mutlak adres geldiyse yola indir (aynı origin'de gezineceğiz).
  try {
    if (/^https?:\/\//i.test(route)) {
      var u = new URL(route);
      route = u.pathname + u.search + u.hash;
    }
  } catch (e) { route = "/"; }
  return route.charAt(0) === "/" ? route : "/" + route;
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var route = routeFromNotification(event.notification);
  var target = new URL(route, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      // Bu sitenin açık bir sekmesi varsa onu öne getir ve hedefe götür.
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (new URL(c.url).origin !== self.location.origin) continue;
        if ("navigate" in c) {
          return c.navigate(target).then(function (nc) { return (nc || c).focus(); });
        }
        return c.focus();
      }
      // Yoksa yeni pencere aç.
      return clients.openWindow(target);
    })
  );
});
