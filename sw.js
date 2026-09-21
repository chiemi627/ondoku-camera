/* おんどくカメラ — オフライン用のキャッシュ。
   アプリ本体は「通信優先・失敗したらキャッシュ」、
   OCRエンジンや辞書データ・フォントは「キャッシュ優先」で保存する。 */

var VERSION = "ondoku-v2";   // 共通の app.js / app.css とスペイン語版を足した
var SHELL = [
  // 英語版と共通の本体
  "./app.js",
  "./app.css",
  // 英語版
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  // スペイン語版
  "./es/",
  "./es/index.html",
  "./es/manifest.webmanifest",
  "./es/icon.svg",
  "./es/icon-192.png",
  "./es/icon-512.png",
  "./es/apple-touch-icon.png"
];

// 初回に取りに行ったら、次回以降はキャッシュから返す相手。
var RUNTIME_HOSTS = [
  "cdn.jsdelivr.net",              // tesseract.js 本体・WASM、単語リスト
  "tessdata.projectnaptha.com",    // 英語・スペイン語の学習済みデータ
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(VERSION).then(function(cache){
      // 1つ失敗しても全体を巻き添えにしない
      return Promise.all(SHELL.map(function(u){
        return cache.add(new Request(u, { cache: "reload" })).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;

  var url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(url.protocol !== "http:" && url.protocol !== "https:") return;

  if(url.origin === self.location.origin){
    // アプリ本体: 新しい版があればそちらを使い、オフラインならキャッシュ
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(VERSION).then(function(c){ try{ c.put(req, copy); }catch(err){} });
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          if(hit) return hit;
          // オフラインで入口そのものが無いときは、その言語の入口を返す
          var home = url.pathname.indexOf("/es/") !== -1 ? "./es/index.html" : "./index.html";
          return caches.match(home);
        });
      })
    );
    return;
  }

  if(RUNTIME_HOSTS.indexOf(url.hostname) === -1) return;

  // エンジン・辞書・フォント: 一度取れたらキャッシュを使い続ける
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        if(res && (res.ok || res.type === "opaque")){
          var copy = res.clone();
          caches.open(VERSION).then(function(c){ try{ c.put(req, copy); }catch(err){} });
        }
        return res;
      });
    })
  );
});
