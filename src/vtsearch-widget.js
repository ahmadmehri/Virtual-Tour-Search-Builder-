/* ============================================================================
   VT Search — runtime widget for 3DVista virtual tours
   ----------------------------------------------------------------------------
   Self-contained, dependency-free, works online AND offline.
   Expects two globals to have been defined just before it loads:
       VT_SEARCH_DATA   = { title, items:[...] }    (the search index)
       VT_SEARCH_CONFIG = { position, accent, ... }  (optional overrides)
   The VT Search Builder concatenates [index][config][this file] into vtsearch.js
   ========================================================================== */
(function () {
  'use strict';

  var DATA = (typeof VT_SEARCH_DATA !== 'undefined' && VT_SEARCH_DATA) || { items: [] };
  var CFG = Object.assign({
    position: 'top-right',   // top-right | top-left | bottom-right | bottom-left
    accent: '#2da3ff',
    placeholder: 'Search the tour…',
    maxResults: 12,
    browseAll: true,         // show the whole list (grouped) when the box is empty
    hotspotTriggerDelayMs: 350, // wait after scene change before firing a hotspot
    guideAlignFrac: 0.14,    // guided walk: doorway counts as "centred" within this fraction of screen width from centre
    guideAlignDeg: 7,        // …or when the facing is within this many degrees of the doorway yaw
    guideTurnSpeed: 34,      // deg/sec the camera turns toward each doorway during a guided walk
    guideAlignTimeoutMs: 22000 // hard cap per hop before we enter anyway (a full ~180° turn fits well inside this)
  }, (typeof VT_SEARCH_CONFIG !== 'undefined' && VT_SEARCH_CONFIG) || {});

  var TYPE_META = {
    scene:   { label: 'Scene',   color: '#2da3ff', icon: 'M3 10l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
    hotspot: { label: 'Hotspot', color: '#ff9f43', icon: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z' },
    photo:   { label: 'Photo',   color: '#26de81', icon: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 11h12l-4-5-3 4-2-2z' },
    video:   { label: 'Video',   color: '#a55eea', icon: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm6 3v8l6-4z' },
    album:   { label: 'Album',   color: '#fd79a8', icon: 'M4 7h4l2-2h4a1 1 0 0 1 1 1v1h4a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z' }
  };

  // -------------------------------------------------------------------------
  // Wait until the DOM and the 3DVista tour runtime are both ready.
  // -------------------------------------------------------------------------
  function whenReady(cb) {
    function domReady(fn) {
      if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(fn, 0);
      else document.addEventListener('DOMContentLoaded', fn);
    }
    domReady(function () {
      var tries = 0;
      (function poll() {
        var ok = (typeof window.tour !== 'undefined' && window.tour) ||
                 (typeof window.setMediaByName === 'function') ||
                 (typeof window.TDV !== 'undefined');
        if (ok || tries++ > 200) cb();   // ~30s grace, then build anyway
        else setTimeout(poll, 150);
      })();
    });
  }

  // -------------------------------------------------------------------------
  // Navigation — drive the tour's own player API.
  // -------------------------------------------------------------------------
  function gotoMediaByName(name) {
    try {
      // tour.setMediaByName returns the media object when found, undefined otherwise
      if (window.tour && typeof window.tour.setMediaByName === 'function') {
        return window.tour.setMediaByName(name) != null;
      }
      if (typeof window.setMediaByName === 'function') { window.setMediaByName(name); return true; }
    } catch (e) { /* ignore */ }
    return false;
  }

  function triggerOverlay(overlayId) {
    var tries = 0;
    (function attempt() {
      try {
        var t = window.tour;
        var player = t && (t.player || (t._getRootPlayer && t._getRootPlayer()));
        var ov = player && player.getById && player.getById(overlayId);
        if (ov) {
          var areas = ov.get && ov.get('areas');
          if (areas && areas.forEach) { areas.forEach(function (a) { a.trigger('click'); }); return; }
          if (ov.trigger) { ov.trigger('click'); return; }
        }
      } catch (e) { /* not ready yet */ }
      if (tries++ < 40) setTimeout(attempt, 150);
    })();
  }

  // Returns true if we managed to take the visitor somewhere meaningful.
  // Navigation always uses the ORIGINAL media label, never a renamed display name.
  function navigate(item) {
    if (item.type === 'hotspot') {
      var changed = item.panoLabel ? gotoMediaByName(item.panoLabel) : false;
      setTimeout(function () { triggerOverlay(item.overlayId); }, changed ? CFG.hotspotTriggerDelayMs : 0);
      return changed;                                  // landed in the hotspot's scene
    }
    var navName = item.label || item.name;
    if (gotoMediaByName(navName)) return true;          // open the media directly when possible…
    if (item.panoLabel && gotoMediaByName(item.panoLabel)) return true;  // …else its scene
    return false;                                      // the player can't open this item
  }

  // -------------------------------------------------------------------------
  // Guided navigation — walk the scene graph from the current scene to a target,
  // rotating toward each doorway before stepping through it.
  // -------------------------------------------------------------------------
  var GRAPH = DATA.graph || null;

  function currentSceneId() {
    try {
      var p = window.tour && window.tour.player;
      var pano = p && p.getById && p.getById('MainViewerPanoramaPlayer');
      var v = pano && pano.get && pano.get('panorama');
      if (!v) return null;
      if (typeof v === 'string') return v;
      return (v.get && v.get('id')) || null;   // 3DVista may return the media object
    } catch (e) { return null; }
  }

  // Breadth-first path of scene ids from -> to (inclusive). null if none.
  function findPath(from, to) {
    if (!GRAPH || !GRAPH[from] || !GRAPH[to]) return null;
    if (from === to) return [from];
    var q = [from], prev = {}, seen = {}; seen[from] = 1;
    while (q.length) {
      var cur = q.shift(), nb = (GRAPH[cur].neighbors || []);
      for (var i = 0; i < nb.length; i++) {
        var nx = nb[i].to;
        if (!GRAPH[nx] || seen[nx]) continue;
        seen[nx] = 1; prev[nx] = cur;
        if (nx === to) { var path = [to], c = to; while (prev[c] !== undefined) { c = prev[c]; path.unshift(c); } return path; }
        q.push(nx);
      }
    }
    return null;
  }
  // The edge (doorway) from scene a to scene b: { to, yaw, overlayID }.
  function edgeBetween(a, b) {
    var nb = (GRAPH[a] && GRAPH[a].neighbors) || [];
    for (var i = 0; i < nb.length; i++) if (nb[i].to === b) return nb[i];
    return null;
  }
  function pano() { try { return window.tour.player.getById('MainViewerPanoramaPlayer'); } catch (e) { return null; } }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Shortest signed angle a→b in degrees (handles 360° wrap), e.g. 170 vs -170 = 20.
  function angDiff(a, b) { return ((a - b + 540) % 360) - 180; }

  // The panorama render canvas (the largest one) — for screen centre & width.
  function renderCanvas() {
    var best = null, ba = 0;
    document.querySelectorAll('canvas').forEach(function (c) { var r = c.getBoundingClientRect(); var a = r.width * r.height; if (a > ba) { ba = a; best = r; } });
    return best;
  }
  // Is the doorway hotspot currently near the CENTRE of the view? Uses the player's
  // live screen-projection (getScreenPosition), which tracks the real auto-rotating
  // camera — unlike get('yaw'), which goes stale. null/huge ⇒ behind the camera.
  function doorwayCentred(edge) {
    try {
      var pl = pano();
      if (!pl || !pl.getScreenPosition || !edge || edge.yaw == null) return false;
      var sp = pl.getScreenPosition(edge.yaw, edge.pitch != null ? edge.pitch : 0);
      if (!sp || !isFinite(sp.x)) return false;
      var cv = renderCanvas(); if (!cv) return false;
      var centerX = cv.left + cv.width / 2;
      return Math.abs(sp.x - centerX) <= cv.width * CFG.guideAlignFrac;
    } catch (e) { return false; }
  }

  // Signed horizontal offset of the doorway from screen centre (px) via the live
  // projection. >0 = right of centre, <0 = left, null = behind the camera / not visible.
  function doorSignedDist(edge) {
    try {
      var pl = pano();
      if (!pl || !pl.getScreenPosition || !edge || edge.yaw == null) return null;
      var sp = pl.getScreenPosition(edge.yaw, edge.pitch != null ? edge.pitch : 0);
      if (!sp || !isFinite(sp.x)) return null;
      var cv = renderCanvas(); if (!cv) return null;
      return sp.x - (cv.left + cv.width / 2);
    } catch (e) { return null; }
  }

  function panStop() { try { var p = pano(); if (p && p.stop) p.stop(); } catch (e) {} }

  // While guiding we aim the camera ourselves, so suspend the tour's own idle
  // auto-rotation (which only ever spins one way); restore it afterwards.
  var idleSaved = [];
  function suspendIdle() {
    try {
      var p = pano(); if (!p) return; var cam = p.get && p.get('camera'); if (!cam || !cam.set) return;
      var seen = false; for (var i = 0; i < idleSaved.length; i++) if (idleSaved[i].cam === cam) seen = true;
      if (!seen) { var v = null; try { v = cam.get('timeToIdle'); } catch (e) {} idleSaved.push({ cam: cam, val: v }); }
      try { cam.set('timeToIdle', 9999999); } catch (e) {}   // effectively disable idle auto-rotation
    } catch (e) {}
  }
  // Temporarily speed up the pan so turns aren't sluggish; restored after the walk.
  var speedSaved = [];
  function bumpSpeed() {
    try {
      var p = pano(); if (!p) return; var cam = p.get && p.get('camera'); if (!cam || !cam.set) return;
      var seen = false; for (var i = 0; i < speedSaved.length; i++) if (speedSaved[i].cam === cam) seen = true;
      var cur = null; try { cur = cam.get('automaticRotationSpeed'); } catch (e) {}
      if (!seen) speedSaved.push({ cam: cam, val: cur });
      try { cam.set('automaticRotationSpeed', Math.max(Math.abs(cur || 10), CFG.guideTurnSpeed)); } catch (e) {}
    } catch (e) {}
  }
  function restoreIdle() {
    idleSaved.forEach(function (s) { try { if (s.val != null && s.cam.set) s.cam.set('timeToIdle', s.val); } catch (e) {} });
    speedSaved.forEach(function (s) { try { if (s.val != null && s.cam.set) s.cam.set('automaticRotationSpeed', s.val); } catch (e) {} });
    idleSaved = []; speedSaved = []; panStop();
  }

  // The camera controller that backs moveLeft/moveRight (the object the player delegates
  // its pan + camera-move calls to — it exposes both `wl` and `moveTo`).
  function rotController() {
    var p = pano(); if (!p) return null;
    try { if (p.U && typeof p.U.wl === 'function') return p.U; } catch (e) {}
    try {
      var names = Object.getOwnPropertyNames(p);
      for (var i = 0; i < names.length; i++) { var o = p[names[i]]; if (o && typeof o === 'object' && typeof o.wl === 'function' && typeof o.moveTo === 'function') return o; }
    } catch (e) {}
    return null;
  }
  // The pan speed `nR` is read ONCE from each scene's automaticRotationSpeed when its
  // camera loads, so scenes the author left without auto-rotation get nR=0 → moveLeft/
  // moveRight do nothing. Force a live nonzero speed so a guided turn works on EVERY scene,
  // regardless of how that scene was authored. (nR is re-read fresh on the next scene load,
  // so this never persists past the walk.)
  function forceRotSpeed(v) { var c = rotController(); if (c) { try { c.nR = v; } catch (e) {} } }

  // The camera's TRUE current facing yaw. get('yaw') is stale, so derive it from the live
  // projection: the panorama yaw whose on-screen point sits nearest the centre of view.
  function facingYaw() {
    try {
      var pl = pano(); if (!pl || !pl.getScreenPosition) return null;
      var cv = renderCanvas(); var cx = cv ? (cv.left + cv.width / 2) : 250;
      var bestY = null, bestD = Infinity;
      for (var y = -179; y <= 180; y += 4) {
        var s = null; try { s = pl.getScreenPosition(y, 0); } catch (e) {}
        if (s && isFinite(s.x)) { var d = Math.abs(s.x - cx); if (d < bestD) { bestD = d; bestY = y; } }
      }
      return bestY;
    } catch (e) { return null; }
  }

  // TURN toward the doorway, then "click" it to walk through. moveLeft()/moveRight() are
  // the player's real rotation controls (they spin the camera; the engine ignores the
  // SIGN of automaticRotationSpeed). To pick the SHORT way we compute the signed angle
  // between the live facing and the doorway yaw, turn that way, and SELF-CORRECT if the
  // angle starts growing (covers either left/right mapping). Stop + trigger when centred.
  function alignThenEnter(edge, label, gen) {
    return new Promise(function (resolve) {
      var fired = false;
      function fire() { if (fired) return; fired = true; panStop(); if (edge && edge.overlayID) triggerOverlay(edge.overlayID); else if (label) gotoMediaByName(label); resolve(); }
      if (!edge || edge.yaw == null) { fire(); return; }
      suspendIdle(); bumpSpeed();
      var pl = pano(), dir = null, lastAbs = null, lastSwitch = 0, t0 = +new Date();
      var prevFacing = null, movedAt = +new Date();
      // give this scene a live nonzero pan speed (its authored auto-rotation may be 0)
      function issue(d) { dir = d; forceRotSpeed(CFG.guideTurnSpeed); try { panStop(); if (d === 'R') { if (pl.moveRight) pl.moveRight(); } else { if (pl.moveLeft) pl.moveLeft(); } } catch (e) {} }
      function turn(d) { if (d !== dir) issue(d); }
      var f0 = facingYaw(), a0 = (f0 != null) ? angDiff(edge.yaw, f0) : 0;
      issue(a0 >= 0 ? 'R' : 'L');                          // first guess; corrected below if it's the long way
      var iv = setInterval(function () {
        if (!alive(gen)) { clearInterval(iv); panStop(); resolve(); return; }
        var dt = +new Date() - t0;
        var f = facingYaw(); var ang = (f != null) ? angDiff(edge.yaw, f) : null;   // signed offset, door − facing
        var cv = renderCanvas(); var tolPx = cv ? cv.width * CFG.guideAlignFrac : 70;
        var dd = doorSignedDist(edge);                                              // px offset when door is on-screen
        var centred = (dd != null && Math.abs(dd) <= tolPx) || (ang != null && Math.abs(ang) <= CFG.guideAlignDeg);
        if (centred && dt > 250) { clearInterval(iv); fire(); return; }             // facing the door → walk through
        // motion watchdog: the pan command can be swallowed by the scene-arrival
        // animation on hops after the first, leaving the camera static. If the facing
        // isn't actually changing, re-issue the pan so the walk never stalls mid-hop.
        if (f != null) {
          if (prevFacing == null || Math.abs(angDiff(f, prevFacing)) > 0.4) movedAt = +new Date();
          prevFacing = f;
          if (+new Date() - movedAt > 850) { issue(dir || 'R'); movedAt = +new Date(); }
        }
        if (ang != null) {
          if (lastAbs != null && Math.abs(ang) > lastAbs + 1.5 && dt - lastSwitch > 450) { turn(dir === 'R' ? 'L' : 'R'); lastSwitch = dt; }  // growing → wrong way
          lastAbs = Math.abs(ang);
        }
        if (dt > CFG.guideAlignTimeoutMs) { clearInterval(iv); fire(); }            // safety net
      }, 120);
    });
  }

  var guiding = false, guideGen = 0;
  function stopGuiding() { guiding = false; guideGen++; restoreIdle(); hideGuideBanner(); }
  // a walk is still "alive" only while it owns the current generation
  function alive(gen) { return guiding && gen === guideGen; }

  // Wait until we've arrived at targetId; if the hotspot didn't take us there in
  // time, fall back to a direct media switch (so a guided walk never gets stuck).
  function arriveOrFallback(targetId, label, gen) {
    return new Promise(function (resolve) {
      var t0 = +new Date(), fellBack = false;
      var iv = setInterval(function () {
        if (!alive(gen)) { clearInterval(iv); resolve(); return; }
        if (currentSceneId() === targetId) { clearInterval(iv); resolve(); return; }   // arrived via hotspot
        var dt = +new Date() - t0;
        if (!fellBack && dt > 2200) { fellBack = true; if (label) gotoMediaByName(label); }  // safety net (give the native transition time first)
        if (dt > 4000) { clearInterval(iv); resolve(); }
      }, 150);
    });
  }

  // Walk to a target scene id. Returns true if a guided walk started.
  function guideToScene(targetId, targetName) {
    var from = currentSceneId();
    var path = from ? findPath(from, targetId) : null;
    if (!path || path.length < 2) { return false; }       // no route → caller should just jump
    guideGen++; var gen = guideGen; guiding = true;        // claim this walk's generation
    showGuideBanner(targetName, 1, path.length - 1);
    (function stepThrough(i) {
      if (!alive(gen)) return;                              // stopped or superseded by a newer walk
      if (i >= path.length) { stopGuiding(); return; }      // arrived → hide banner
      var fromId = path[i - 1], toId = path[i];
      var edge = edgeBetween(fromId, toId);
      var label = (GRAPH[toId] && GRAPH[toId].label) || null;
      updateGuideBanner(targetName, i, path.length - 1);
      // For each hop: brief dwell so the scene renders & we can read the facing, then
      // aim the spin the SHORT way toward the doorway and click it when it centres.
      wait(i === 1 ? 350 : 800).then(function () {
        if (!alive(gen)) return;
        return alignThenEnter(edge, label, gen);          // wait until centred, then walk through
      }).then(function () {
        if (!alive(gen)) return;
        return arriveOrFallback(toId, label, gen);
      }).then(function () { stepThrough(i + 1); });
    })(1);
    return true;
  }

  // small banner with a Stop control during a guided walk
  var banner = null;
  function showGuideBanner(name, step, total) {
    if (!banner) {
      banner = document.createElement('div'); banner.id = 'vtsearch-guide';
      banner.innerHTML = '<span class="vts-g-txt"></span><button class="vts-g-stop">Stop</button>';
      document.body.appendChild(banner);
      banner.querySelector('.vts-g-stop').addEventListener('click', stopGuiding);
    }
    banner.style.display = 'flex';
    updateGuideBanner(name, step, total);
  }
  function updateGuideBanner(name, step, total) {
    if (banner) banner.querySelector('.vts-g-txt').textContent = 'Guiding you to “' + name + '” — step ' + step + ' / ' + total + '…';
  }
  function hideGuideBanner() { if (banner) banner.style.display = 'none'; }

  // -------------------------------------------------------------------------
  // Search — case- AND accent-insensitive, with similarity (typo) tolerance.
  // -------------------------------------------------------------------------
  // normalise: lowercase + strip accents (café -> cafe, Förde -> forde)
  function norm(s) {
    s = String(s == null ? '' : s).toLowerCase();
    if (s.normalize) s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return s;
  }
  function words(s) { return norm(s).split(/[^a-z0-9]+/).filter(Boolean); }

  // Levenshtein edit distance (small strings — cheap)
  function lev(a, b) {
    var m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    var prev = [], i, j; for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      var cur = [i];
      for (j = 1; j <= n; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[n];
  }
  function sim(a, b) { var L = Math.max(a.length, b.length); return L ? 1 - lev(a, b) / L : 0; }

  // How well one query term matches a single word (0 = no match).
  function termVsWord(t, word) {
    if (word === t) return 100;
    if (word.indexOf(t) === 0) return 82;          // prefix:  "livin" -> "living"
    if (word.indexOf(t) >= 0) return 64;           // contains
    var s = sim(t, word);
    if (s >= 0.72) return Math.round(50 * s);      // fuzzy:   "bedrom" -> "bedroom"
    if (t.length >= 4 && lev(t, word) <= 1) return 48; // single typo on longer words
    return 0;
  }

  // item score for a (possibly multi-word) query; -1 means "no match".
  // Matches the display name AND any aliases (e.g. the original 3DVista name).
  function score(q, item) {
    if (!q) return 0;
    var names = [item.name].concat(item.aliases || []);
    var best = -1;
    for (var k = 0; k < names.length; k++) {
      var nameN = norm(names[k]);
      if (nameN === q) best = Math.max(best, 1000);
      else if (nameN.indexOf(q) === 0) best = Math.max(best, 800);
      else if (nameN.indexOf(q) >= 0) best = Math.max(best, 650);
    }
    if (best >= 0) return best;
    // token search: every query term must match SOME word of name(s)/type/context
    var hay = [];
    names.forEach(function (nm) { hay = hay.concat(words(nm)); });
    hay = hay.concat(words((TYPE_META[item.type] || {}).label || '')).concat(words(item.panoLabel || ''));
    var terms = q.split(/\s+/).filter(Boolean), total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i], bw = 0;
      for (var w = 0; w < hay.length; w++) { var v = termVsWord(t, hay[w]); if (v > bw) bw = v; }
      if (bw === 0) { names.forEach(function (nm) { var sN = sim(t, norm(nm)); if (sN >= 0.7) bw = Math.max(bw, Math.round(40 * sN)); }); }
      if (bw === 0) return -1;
      total += bw;
    }
    return total;
  }

  function search(query) {
    var q = norm(query).trim();
    if (!q) return [];
    var scored = [];
    for (var i = 0; i < DATA.items.length; i++) {
      var s = score(q, DATA.items[i]);
      if (s >= 0) scored.push([s, i, DATA.items[i]]);
    }
    scored.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    return scored.slice(0, CFG.maxResults).map(function (x) { return x[2]; });
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------
  function injectStyle() {
    var pos = CFG.position || 'top-right', vert = pos.indexOf('bottom') === 0 ? 'bottom' : 'top';
    var horz = pos.indexOf('center') >= 0 ? 'center' : (pos.indexOf('left') >= 0 ? 'left' : 'right');
    // when centered, pin to the horizontal middle and grow symmetrically
    var place = horz === 'center'
      ? vert + ':16px;left:50%;transform:translateX(-50%);'
      : vert + ':16px;' + horz + ':16px;';
    var resAlign = horz === 'center' ? 'margin-left:auto;margin-right:auto;'
                 : (horz === 'left' ? '' : 'margin-left:auto;');
    var css = '' +
    '#vtsearch{position:fixed;' + place + 'z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}' +
    '#vtsearch *{box-sizing:border-box;}' +
    '#vtsearch .vts-bar{display:flex;align-items:center;background:rgba(20,22,26,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);border-radius:24px;height:44px;overflow:hidden;transition:width .22s ease, box-shadow .2s;width:44px;box-shadow:0 4px 18px rgba(0,0,0,.35);}' +
    '#vtsearch.open .vts-bar{width:320px;box-shadow:0 8px 30px rgba(0,0,0,.5);}' +
    '@media (max-width:480px){#vtsearch.open .vts-bar{width:78vw;}}' +
    '#vtsearch .vts-btn{flex:0 0 44px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:none;border:0;padding:0;}' +
    '#vtsearch .vts-btn svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;}' +
    '#vtsearch .vts-input{flex:1;min-width:0;background:none;border:0;outline:none;color:#fff;font-size:15px;padding:0 6px 0 2px;opacity:0;transition:opacity .2s;}' +
    '#vtsearch.open .vts-input{opacity:1;}' +
    '#vtsearch .vts-clear{flex:0 0 30px;width:30px;height:44px;border:0;background:none;color:#9aa3ad;cursor:pointer;font-size:18px;display:none;}' +
    '#vtsearch.open .vts-clear.show{display:block;}' +
    '#vtsearch .vts-results{margin-top:8px;background:rgba(20,22,26,.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);border-radius:14px;max-height:min(60vh,460px);overflow:auto;display:none;box-shadow:0 12px 40px rgba(0,0,0,.55);' + resAlign + '}' +
    '#vtsearch.open .vts-results.show{display:block;}' +
    '#vtsearch .vts-row{display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.06);}' +
    '#vtsearch .vts-row:last-child{border-bottom:0;}' +
    '#vtsearch .vts-row.active,#vtsearch .vts-row:hover{background:rgba(255,255,255,.09);}' +
    '#vtsearch .vts-thumb{flex:0 0 46px;width:46px;height:34px;border-radius:6px;background:#2a2e35 center/cover no-repeat;display:flex;align-items:center;justify-content:center;}' +
    '#vtsearch .vts-thumb svg{width:18px;height:18px;}' +
    '#vtsearch .vts-meta{flex:1;min-width:0;}' +
    '#vtsearch .vts-name{color:#fff;font-size:14px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '#vtsearch .vts-sub{color:#9aa3ad;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}' +
    '#vtsearch .vts-badge{flex:0 0 auto;font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;padding:2px 7px;border-radius:10px;color:#0c0e11;}' +
    '#vtsearch .vts-empty{padding:14px;color:#9aa3ad;font-size:13px;text-align:center;}' +
    '#vtsearch .vts-head{padding:8px 12px 4px;font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#7f8893;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.06);}' +
    '#vtsearch .vts-guide{flex:0 0 auto;font-size:11px;font-weight:600;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fff;border-radius:9px;padding:3px 9px;cursor:pointer;margin-left:6px;white-space:nowrap;}' +
    '#vtsearch .vts-guide:hover{background:' + CFG.accent + ';color:#06121f;border-color:' + CFG.accent + ';}' +
    '#vtsearch ::-webkit-scrollbar{width:8px;}#vtsearch ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:4px;}' +
    '#vtsearch-guide{position:fixed;left:50%;transform:translateX(-50%);bottom:22px;z-index:100000;display:none;align-items:center;gap:12px;background:rgba(20,22,26,.94);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:24px;padding:10px 14px 10px 18px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-size:13.5px;box-shadow:0 10px 30px rgba(0,0,0,.5);}' +
    '#vtsearch-guide .vts-g-stop{background:' + CFG.accent + ';color:#06121f;border:0;border-radius:14px;padding:6px 14px;font-weight:600;cursor:pointer;font-size:13px;}';
    var el = document.createElement('style');
    el.id = 'vtsearch-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function svgIcon(path, stroke) {
    return '<svg viewBox="0 0 24 24" style="' + (stroke ? '' : 'fill:currentColor;stroke:none;') + '"><path d="' + path + '"/></svg>';
  }

  function build() {
    injectStyle();
    var root = document.createElement('div');
    root.id = 'vtsearch';
    root.innerHTML =
      '<div class="vts-bar">' +
        '<button class="vts-btn" aria-label="Search" title="Search the tour">' +
          '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>' +
        '</button>' +
        '<input class="vts-input" type="text" placeholder="' + escapeAttr(CFG.placeholder) + '" autocomplete="off" spellcheck="false"/>' +
        '<button class="vts-clear" aria-label="Clear">×</button>' +
      '</div>' +
      '<div class="vts-results" role="listbox"></div>';
    document.body.appendChild(root);

    // Dual-skin tours can rebuild the DOM when switching desktop<->mobile.
    // Re-attach our widget (and style) if a skin swap ever removes them.
    try {
      var reattach = new MutationObserver(function () {
        if (!document.getElementById('vtsearch-style')) injectStyle();
        if (!document.body.contains(root)) document.body.appendChild(root);
      });
      reattach.observe(document.body, { childList: true });
    } catch (e) { /* MutationObserver unavailable — ignore */ }

    var bar = root.querySelector('.vts-bar');
    var btn = root.querySelector('.vts-btn');
    var input = root.querySelector('.vts-input');
    var clear = root.querySelector('.vts-clear');
    var results = root.querySelector('.vts-results');
    var activeIdx = -1, current = [];

    function open() { root.classList.add('open'); render(input.value); setTimeout(function () { input.focus(); }, 60); }
    function close() { root.classList.remove('open'); results.classList.remove('show'); }
    function toggle() { root.classList.contains('open') ? close() : open(); }

    btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; render(''); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (current[activeIdx < 0 ? 0 : activeIdx]) choose(current[activeIdx < 0 ? 0 : activeIdx]); }
    });
    clear.addEventListener('click', function () { input.value = ''; render(''); input.focus(); });

    document.addEventListener('click', function (e) { if (!root.contains(e.target)) close(); });

    function move(d) {
      if (!current.length) return;
      activeIdx = (activeIdx + d + current.length) % current.length;
      paintActive();
    }
    function paintActive() {
      var rows = results.querySelectorAll('.vts-row');
      rows.forEach(function (r, i) { r.classList.toggle('active', i === activeIdx); });
      if (rows[activeIdx]) rows[activeIdx].scrollIntoView({ block: 'nearest' });
    }
    function choose(item) {
      if (navigate(item) === false) {
        // The tour's player can't open this item from a script (e.g. album slides).
        results.innerHTML = '<div class="vts-empty">Can’t open “' + escapeHtml(item.name) +
          '” directly — open it from the tour’s menu.</div>';
        results.classList.add('show');
        return;
      }
      close();
    }
    // "Guide me" on a scene row: walk there; if there's no route, just jump.
    function chooseGuide(item) {
      var started = (item.type === 'scene' && item.sceneId) ? guideToScene(item.sceneId, item.name) : false;
      if (!started) navigate(item);     // no path (or unknown current scene) → jump
      close();
    }

    function rowHtml(it) {
      var meta = TYPE_META[it.type] || { label: it.type, color: '#888', icon: '' };
      var sub = it.type === 'hotspot' && it.panoLabel ? ('in ' + it.panoLabel)
              : it.type === 'scene' ? 'Panorama scene'
              : meta.label;
      var thumb = it.thumb
        ? '<div class="vts-thumb" style="background-image:url(\'' + escapeAttr(it.thumb) + '\')"></div>'
        : '<div class="vts-thumb" style="color:' + meta.color + '">' + svgIcon(meta.icon, false) + '</div>';
      var guide = (CFG.guided && GRAPH && it.type === 'scene' && it.sceneId)
        ? '<button class="vts-guide" title="Walk there step by step">Guide me</button>' : '';
      return '<div class="vts-row" role="option">' + thumb +
        '<div class="vts-meta"><div class="vts-name">' + escapeHtml(it.name) + '</div>' +
        '<div class="vts-sub">' + escapeHtml(sub) + '</div></div>' +
        '<span class="vts-badge" style="background:' + meta.color + '">' + meta.label + '</span>' + guide + '</div>';
    }

    // Render the list; when `grouped` is true, insert a heading before each type.
    function paint(items, grouped) {
      var html = '', last = null;
      items.forEach(function (it) {
        if (grouped && it.type !== last) {
          var m = TYPE_META[it.type] || { label: it.type };
          html += '<div class="vts-head">' + escapeHtml(m.label) + 's</div>';
          last = it.type;
        }
        html += rowHtml(it);
      });
      results.innerHTML = html;
      results.classList.add('show');
      results.querySelectorAll('.vts-row').forEach(function (r, i) {
        r.addEventListener('click', function () { choose(current[i]); });          // row = Jump
        r.addEventListener('mouseenter', function () { activeIdx = i; paintActive(); });
        var gb = r.querySelector('.vts-guide');
        if (gb) gb.addEventListener('click', function (e) { e.stopPropagation(); chooseGuide(current[i]); });
      });
    }

    function render(q) {
      clear.classList.toggle('show', !!q);
      activeIdx = -1;
      if (!q) {
        // Empty box: browse the whole list (if the publisher enabled it), else nothing.
        if (CFG.browseAll) { current = DATA.items.slice(); paint(current, true); }
        else { current = []; results.classList.remove('show'); results.innerHTML = ''; }
        return;
      }
      current = search(q);
      if (!current.length) {
        results.innerHTML = '<div class="vts-empty">No matches for “' + escapeHtml(q) + '”</div>';
        results.classList.add('show'); return;
      }
      paint(current, false);
    }
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

  if (!DATA.items || !DATA.items.length) {
    console.warn('[vtsearch] No search items found in VT_SEARCH_DATA.');
    return;
  }
  whenReady(build);
})();
