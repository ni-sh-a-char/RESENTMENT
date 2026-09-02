/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - offline.
 *
 * The desktop is a handful of static files. Network first, so a deploy
 * reaches a returning browser on its next load; cache as the fallback, so
 * the OS still opens with no network at all. Model calls are never cached,
 * and never will be.
 */
const CACHE = "resentment-os";
const FILES = ["./", "./index.html", "./os.css", "./icon.svg", "./manifest.webmanifest",
               "./js/main.js", "./js/core.js", "./js/providers.js", "./js/agent.js", "./js/kernel.js", "./js/shell.js", "./js/wm.js", "./js/apps.js", "./js/llm-worker.js"];

self.addEventListener("install", (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
	e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (e) => {
	const url = new URL(e.request.url);
	if (e.request.method !== "GET" || url.origin !== location.origin) return;
	e.respondWith(fetch(e.request).then((res) => {
		if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
		return res;
	}).catch(() => caches.match(e.request)));
});
