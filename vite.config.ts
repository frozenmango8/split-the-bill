import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vitest/config";

// Project site: https://frozenmango8.github.io/split-the-bill/
const BASE = "/split-the-bill/";

export default defineConfig({
  base: BASE,
  plugins: [offline()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

function offline(): Plugin {
  return {
    name: "offline",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = new Set(["index.html", ...Object.keys(bundle).filter((name) => !name.endsWith(".map"))]);
      // The directory URL and index.html are the same document. Cache both,
      // because a reload asks for whichever one the address bar has.
      const assets = [BASE, ...[...files].map((file) => BASE + file)];
      const id = createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 8);
      this.emitFile({ type: "asset", fileName: "sw.js", source: serviceWorker(id, assets) });
    },
  };
}

function serviceWorker(id: string, assets: string[]): string {
  return `const CACHE = ${JSON.stringify(`bill-${id}`)};
const ASSETS = ${JSON.stringify(assets)};
const INDEX = ${JSON.stringify(BASE)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(INDEX)) || offlineResponse()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        }),
    ),
  );
});

function offlineResponse() {
  return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
}
`;
}
