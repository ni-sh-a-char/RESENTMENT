/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - offline.
 *
 * The desktop is a handful of static files; cache them on install and
 * serve them first, so the OS opens with no network. Model calls are not
 * cached, and never will be. Bump VERSION to ship a new build.
 */
const VERSION = "resentment-os-2.0.0";
const FILES = ["./", "./index.html", "./os.css", "./icon.svg", "./manifest.webmanifest",
               "./js/main.js", "./js/core.js", "./js/providers.js", "./js/agent.js", "./js/kernel.js", "./js/shell.js", "./js/wm.js", "./js/apps.js"];

self.addEventListener("install", (e) => {
	e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
	e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
	const url = new URL(e.request.url);
	if (e.request.method !== "GET" || url.origin !== location.origin) return;
	e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
		if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
		return res;
	})));
});
