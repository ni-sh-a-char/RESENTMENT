/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS — website behaviour.
 *
 * Everything here is an enhancement. The site reads correctly with this file
 * blocked: the transcript is already in the markup, the theme has a default,
 * the hue has a default, every link is a real link.
 */
(function () {
  "use strict";
  var root = document.documentElement;

  /* ------------------------------------------------------------- theme */
  var toggle = document.getElementById("theme");
  if (toggle) toggle.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("resentment-os-theme", next); } catch (e) {}
  });

  /* ----------------------------------------------------- docs menu, copy */
  var menu = document.getElementById("menu"), sidebar = document.querySelector(".sidebar");
  if (menu && sidebar) {
    menu.addEventListener("click", function () { sidebar.classList.toggle("open"); });
    sidebar.addEventListener("click", function (e) { if (e.target.tagName === "A") sidebar.classList.remove("open"); });
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".copy");
    if (!btn) return;
    var code = btn.parentNode.querySelector("code");
    if (!code) return;
    var done = function () { btn.textContent = "copied"; btn.classList.add("done"); setTimeout(function () { btn.textContent = "copy"; btn.classList.remove("done"); }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(code.innerText).then(done, function () {});
  });

  /* --------------------------------------------------- table of contents */
  var tocLinks = [].slice.call(document.querySelectorAll(".toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {}, seen = [];
    tocLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var i = seen.indexOf(en.target.id);
        if (en.isIntersecting && i < 0) seen.push(en.target.id);
        if (!en.isIntersecting && i >= 0) seen.splice(i, 1);
      });
      tocLinks.forEach(function (a) { a.style.color = ""; a.style.borderLeftColor = ""; });
      var a = seen.length && byId[seen[0]];
      if (a) { a.style.color = "var(--accent)"; a.style.borderLeftColor = "var(--accent)"; }
    }, { rootMargin: "-80px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) obs.observe(el); });
  }

  /* ---------------------------------------------------------- the clock */
  /* The kernel keys its authority from the angles between the clock hands;
     the desktop keys its accent from them; so does this page. The headline
     names the moment a fifteen-minute lease granted now would end. */
  var until = document.getElementById("until"), ringLeft = document.getElementById("ring-left");
  var tick = function () {
    var n = new Date();
    var m = n.getMinutes() + n.getSeconds() / 60, h = (n.getHours() % 12) + m / 60;
    var sep = Math.abs(h * 30 - m * 6) % 360; if (sep > 180) sep = 360 - sep;
    root.style.setProperty("--hue", Math.round(20 + sep * 1.8));
    root.style.setProperty("--hue-2", Math.round(200 + sep));
    if (until) {
      var u = new Date(n.getTime() + 15 * 60000);
      until.textContent = String(u.getHours()).padStart(2, "0") + ":" + String(u.getMinutes()).padStart(2, "0");
    }
    if (ringLeft) {
      var s = 24 - (Math.floor(n.getTime() / 1000) % 24);
      ringLeft.textContent = "expires in " + s + "s";
    }
  };
  tick(); setInterval(tick, 1000);

  /* ---------------------------------------------------------- wallpaper */
  var c = document.getElementById("wall");
  if (c) {
    var ctx = c.getContext("2d");
    var draw = function () {
      var host = c.parentNode, w = c.width = host.clientWidth, hgt = c.height = host.clientHeight;
      var cs = getComputedStyle(root), hue = cs.getPropertyValue("--hue") || 38, hue2 = cs.getPropertyValue("--hue-2") || 180;
      var light = root.getAttribute("data-theme") === "light";
      ctx.clearRect(0, 0, w, hgt);
      var g = ctx.createRadialGradient(w * 0.78, hgt * 0.2, 0, w * 0.78, hgt * 0.2, Math.max(w, hgt) * 0.9);
      g.addColorStop(0, light ? "hsl(" + hue + " 70% 92%)" : "hsl(" + hue + " 45% 11%)");
      g.addColorStop(1, light ? "rgba(251,251,253,0)" : "rgba(7,8,11,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
      var n = new Date(), s = n.getSeconds() + n.getMilliseconds() / 1000, m = n.getMinutes() + s / 60, hr = (n.getHours() % 12) + m / 60;
      var cx = w * 0.82, cy = hgt * 0.15, R = Math.min(w, hgt) * 0.5;
      ctx.lineCap = "round";
      var arc = function (frac, r, color, width) { ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke(); };
      var a = light ? 0.25 : 0.32;
      arc(1, R, light ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.035)", 1);
      arc(1, R * 0.8, light ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.035)", 1);
      arc(hr / 12, R * 0.6, "hsl(" + hue + " 70% 60% / " + a + ")", 8);
      arc(m / 60, R * 0.8, "hsl(" + hue2 + " 60% 60% / " + a * 0.8 + ")", 5);
      arc(s / 60, R, "hsl(" + hue + " 60% 70% / " + a * 0.5 + ")", 2);
    };
    draw(); setInterval(draw, 1000); addEventListener("resize", draw);
    if (toggle) toggle.addEventListener("click", function () { setTimeout(draw, 30); });
  }

  /* ---------------------------------------------------------- the hash */
  var hash = document.getElementById("hash");
  if (hash) setInterval(function () {
    var s = hash.textContent.split("");
    var i = Math.floor(Math.random() * s.length);
    s[i] = "0123456789abcdef"[Math.floor(Math.random() * 16)];
    hash.textContent = s.join("");
  }, 400);

  /* -------------------------------------------------------- the terminal */
  /* Retyped rather than faded in, because the point is that these lines
     arrive in order, from a machine, over a serial line. The static text is
     already in the markup for anyone with reduced motion or no script. */
  var term = document.getElementById("term");
  if (!term || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var script = [
    ["t", "[    0.021841] ", "kaalka   temporal keying active, epoch 29798350"],
    ["t", "[    0.028901] ", "cap      capability system ready: 24 types, sealed"],
    ["t", "[    0.082106] ", "smp      4 of 4 processors started"],
    ["ok", "[    0.118176] ", "selftest all 7 self-tests passed"],
    ["ok", "[    0.119217] ", "boot     boot complete in 119 ms, 505.4 MiB free"],
    ["gap"], ["banner"],
    ["cmd", ".run /boot/bin/facts.she"],
    ["k", "not allowed to system."],
    ["cm", "  This script was not granted permission to read the runtime graph."],
    ["cmd", ".allow all"],
    ["ok2", "granted every permission"],
    ["cmd", ".run /boot/bin/facts.she"],
    ["in", "arch=x86_64"], ["in", "cpus=4"],
    ["dig", "digest=7d4a1f0e83c25b9a6f1e0d4c8b3a7e2f5d9c1b8a4e7f0c3d6a9b2e5f8c1d4a7b"],
    ["in", "angles=142.5,87.0,55.5"]
  ];
  var esc = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
  var out = "", li = 0, ci = 0, cursor = '<span class="cursor"></span>';
  var render = function () { term.innerHTML = out + cursor; };
  var step = function () {
    if (li >= script.length) { render(); return; }
    var row = script[li], kind = row[0];
    if (kind === "gap") { out += "\n"; li++; return setTimeout(step, 90); }
    if (kind === "banner") { out += '<span class="k">  RESENTMENT 2.0.0 (kaalachakra)  x86_64  4 cpu</span>\n'; li++; return setTimeout(step, 260); }
    if (kind === "cmd") {
      var text = row[1];
      if (ci === 0) out += '<span class="p">resentment&gt; </span>';
      if (ci < text.length) { out += esc(text[ci]); ci++; render(); return setTimeout(step, 28); }
      out += "\n"; ci = 0; li++; return setTimeout(step, 240);
    }
    if (kind === "t" || kind === "ok") {
      out += '<span class="t">' + esc(row[1]) + '</span><span class="' + (kind === "ok" ? "ok" : "in") + '">' + esc(row[2]) + "</span>\n";
      li++; render(); return setTimeout(step, 70);
    }
    if (kind === "dig") { out += "digest=" + '<span class="d">' + esc(row[1].slice(7)) + "</span>\n"; li++; render(); return setTimeout(step, 140); }
    var cls = { k: "k", cm: "cm", ok2: "ok", in: "in" }[kind] || "in";
    out += '<span class="' + cls + '">' + esc(row[1]) + "</span>\n";
    li++; render(); return setTimeout(step, 140);
  };
  var started = false;
  var start = function () { if (started) return; started = true; term.innerHTML = ""; out = ""; setTimeout(step, 300); };
  if ("IntersectionObserver" in window) new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { start(); o.disconnect(); } }, { threshold: .25 }).observe(term);
  else start();
})();
