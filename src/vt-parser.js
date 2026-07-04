/* ============================================================================
   VT Search Builder — Tour Parser  (shared by the builder UI and node tests)
   ----------------------------------------------------------------------------
   Pure, DOM-free. Works in the browser and under node.
   Input : { scriptGeneral, scriptMain, locales }
       scriptGeneral : text of script_general.js (the tour data model)
       scriptMain    : text of script.js          (optional, fallback)
       locales       : { en: "<contents of locale/en.txt>", ... }  (>=1 locale)
   Output: see parseTour() return shape below.
   ========================================================================== */
(function (root) {
  'use strict';

  // ---- locale parsing ------------------------------------------------------
  // Lines look like:  panorama_XXX.label = Entrance
  //                   HotspotPanoramaOverlayArea_YYY.toolTip = View Painting
  function parseLocale(text) {
    var map = {}; // id -> { label, toolTip, subtitle }
    if (!text) return map;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.charAt(0) === '#') continue;
      var eq = line.indexOf('=');
      if (eq < 0) continue;
      var key = line.slice(0, eq).trim();
      var val = line.slice(eq + 1).trim();
      if (!key || !val) continue;
      var dot = key.lastIndexOf('.');
      if (dot < 0) continue;
      var id = key.slice(0, dot);
      var prop = key.slice(dot + 1);
      if (prop !== 'label' && prop !== 'toolTip' && prop !== 'subtitle') continue;
      (map[id] || (map[id] = {}))[prop] = decodeLocale(val);
    }
    return map;
  }

  function decodeLocale(s) {
    // locale values may carry escaped unicode / quotes; keep it simple + safe
    return s.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  }

  // ---- string-aware structural scan of the data file ----------------------
  // Walk every {...} object once. For each closed object, hand its source slice
  // to the collectors. This avoids fragile backtracking and nested-brace traps,
  // because object string literals are skipped while scanning.
  function scanObjects(text, onObject) {
    var stack = [];
    var inStr = false, esc = false;
    for (var i = 0, n = text.length; i < n; i++) {
      var ch = text.charCodeAt(i);
      if (inStr) {
        if (esc) { esc = false; }
        else if (ch === 92) { esc = true; }          // backslash
        else if (ch === 34) { inStr = false; }        // closing quote
        continue;
      }
      if (ch === 34) { inStr = true; }                // opening quote
      else if (ch === 123) { stack.push(i); }         // {
      else if (ch === 125) {                          // }
        var start = stack.pop();
        if (start !== undefined) onObject(text, start, i + 1);
      }
    }
  }

  function firstId(obj, prefix) {
    var re = new RegExp('"id":"(' + prefix + '_[0-9A-Fa-f_]+)"');
    var m = re.exec(obj);
    return m ? m[1] : null;
  }
  function grabThumb(obj) {
    var m = /"thumbnailUrl":"(media\/[^"]+)"/.exec(obj);
    return m ? m[1] : null;
  }
  // refs inside arrays look like  "this.overlay_XXX"  /  "this.HotspotPanoramaOverlayArea_YYY"
  function refsOfArray(obj, arrayKey, idPrefix) {
    var m = new RegExp('"' + arrayKey + '":\\[([^\\]]*)\\]').exec(obj);
    if (!m) return [];
    var out = [], re = new RegExp('this\\.(' + idPrefix + '_[0-9A-Fa-f_]+)', 'g'), r;
    while ((r = re.exec(m[1]))) out.push(r[1]);
    return out;
  }

  // ---- main ----------------------------------------------------------------
  function parseTour(input) {
    // A dual-skin (desktop + mobile) export can split its data across several
    // device script files. Scan EVERY script we were given, not just one.
    var sources = [];
    if (input.scripts && input.scripts.length) sources = sources.concat(input.scripts);
    if (input.scriptGeneral) sources.push(input.scriptGeneral);
    if (input.scriptMain) sources.push(input.scriptMain);
    var seenSrc = {}, uniq = [];
    sources.forEach(function (s) { if (s && !seenSrc[s]) { seenSrc[s] = 1; uniq.push(s); } });
    // Scan only files that actually hold tour DATA. The minified bootstrap
    // (script.js) is player CODE — its single-quoted strings contain stray
    // double-quotes that would desync the object scanner. Skip it.
    function hasData(s) {
      return /"class":"(Panorama|Photo|Video|Album|HotspotPanoramaOverlay)"/.test(s) ||
             /"id":"(panorama|photo|video|album)_/.test(s);
    }
    var dataSources = uniq.filter(hasData);
    if (!dataSources.length) dataSources = uniq;        // fallback: scan whatever we have
    var data = dataSources.join('\n');
    var locales = input.locales || {};
    var localeNames = Object.keys(locales);
    var primary = locales.en ? 'en' : (localeNames[0] || null);
    var loc = parseLocale(primary ? locales[primary] : '');

    // structural pass: collect overlay->areas and panorama->overlays + thumbs
    var overlayAreas = {};      // overlayId -> [areaId,...]
    var panoOverlays = {};      // panoId    -> [overlayId,...]
    var thumbById = {};         // mediaId   -> thumbnailUrl
    var adjAll = [];            // every AdjacentPanorama link {start,to,yaw}
    var panoRanges = [];        // every Panorama object {id,start,end} (for graph build)

    scanObjects(data, function (text, start, end) {
      var obj = text.slice(start, end);
      // cheap reject: every object we care about names its class
      var ci = obj.indexOf('"class":"');
      if (ci < 0) return;

      if (obj.indexOf('"class":"HotspotPanoramaOverlay"') >= 0 && obj.indexOf('"areas":') >= 0) {
        var ovId = firstId(obj, 'overlay');
        if (ovId) {
          var areas = refsOfArray(obj, 'areas', 'HotspotPanoramaOverlayArea');
          if (areas.length) overlayAreas[ovId] = areas;
        }
      }
      // scene-graph: each AdjacentPanorama carries a yaw + target panorama +
      // the doorway overlay (overlayID) used to "walk through" to the next scene.
      // scanObjects() fires for EVERY enclosing {...}, so the parent Panorama (and any
      // device/skin wrapper) also "contains" this class text — exclude those by requiring
      // the slice to NOT itself be/contain a Panorama, so we capture only the innermost
      // AdjacentPanorama objects (otherwise links get duplicated + mis-attributed).
      if (obj.indexOf('"class":"AdjacentPanorama"') >= 0 && obj.indexOf('"class":"Panorama"') < 0) {
        var ym = /"yaw":(-?[0-9.]+)/.exec(obj);
        var pm = /"pitch":(-?[0-9.]+)/.exec(obj);
        var tm = /"panorama":"this\.(panorama_[0-9A-Fa-f_]+)"/.exec(obj);
        var om = /"overlayID":"(overlay_[0-9A-Fa-f_]+)"/.exec(obj);
        if (tm) adjAll.push({ start: start, to: tm[1], yaw: ym ? parseFloat(ym[1]) : null, pitch: pm ? parseFloat(pm[1]) : null, overlayID: om ? om[1] : null });
      }
      // Only the innermost Panorama object (exactly ONE Panorama class in the slice).
      // A device/skin wrapper enclosing several panoramas also matches this text; taking
      // it would register a huge byte-range under the first panorama's id, overwriting the
      // real node's neighbors and swallowing other scenes' adjacencies.
      if (obj.indexOf('"class":"Panorama"') >= 0 && (obj.match(/"class":"Panorama"/g) || []).length === 1) {
        var pId = firstId(obj, 'panorama');
        if (pId) {
          panoRanges.push({ id: pId, start: start, end: end });
          if (obj.indexOf('"overlays":') >= 0) {
            var ovs = refsOfArray(obj, 'overlays', 'overlay');
            if (ovs.length) panoOverlays[pId] = ovs;
          }
          var t = grabThumb(obj);
          if (t && !thumbById[pId]) thumbById[pId] = t;
        }
      }
      // thumbnails for photos / videos / albums (object whose own id has a label)
      var idm = /"id":"((?:photo|video|album|panorama)_[0-9A-Fa-f_]+)"/.exec(obj);
      if (idm) {
        var th = grabThumb(obj);
        if (th && !thumbById[idm[1]]) thumbById[idm[1]] = th;
      }
    });

    // Build the scene graph: panoId -> { label, neighbors:[{to,yaw}] }.
    // An AdjacentPanorama belongs to the Panorama whose byte-range encloses it;
    // pick the SMALLEST enclosing range (panoramas never nest, but be safe).
    var graph = {};
    panoRanges.forEach(function (pr) { graph[pr.id] = { label: null, neighbors: [] }; });
    adjAll.forEach(function (a) {
      var best = null;
      panoRanges.forEach(function (pr) {
        if (a.start > pr.start && a.start < pr.end) {
          if (!best || (pr.end - pr.start) < (best.end - best.start)) best = pr;
        }
      });
      if (best && a.to) graph[best.id].neighbors.push({ to: a.to, yaw: a.yaw, pitch: a.pitch, overlayID: a.overlayID });
    });

    // ---- build searchable items from the locale label map -----------------
    var items = [];
    var TYPE = { panorama: 'scene', photo: 'photo', video: 'video', album: 'album' };

    Object.keys(loc).forEach(function (id) {
      var entry = loc[id];
      if (!entry.label) return;
      var pfx = id.split('_')[0].toLowerCase();
      var type = TYPE[pfx];
      if (!type) return;
      items.push({
        type: type,
        id: id,
        label: entry.label,          // original 3DVista name — used for navigation
        name: entry.label,           // display/search name (the builder may rename this)
        subtitle: entry.subtitle || null,
        thumb: thumbById[id] || null
      });
      if (type === 'scene' && graph[id]) graph[id].label = entry.label;
    });

    // ---- hotspots ---------------------------------------------------------
    Object.keys(panoOverlays).forEach(function (panoId) {
      var panoEntry = loc[panoId];
      var panoLabel = panoEntry && panoEntry.label ? panoEntry.label : null;
      panoOverlays[panoId].forEach(function (ovId) {
        var areas = overlayAreas[ovId];
        if (!areas) return;
        areas.forEach(function (areaId) {
          var le = loc[areaId];
          var tip = le && le.toolTip ? le.toolTip : null;
          if (!tip) return;
          items.push({
            type: 'hotspot',
            id: areaId,
            label: tip,                // original tooltip
            name: tip,                 // display/search name (renamable)
            panoId: panoId,
            panoLabel: panoLabel,
            overlayId: ovId,
            thumb: thumbById[panoId] || null
          });
        });
      });
    });

    // tour title: <title> isn't in these files, but the video/scene "Casa
    // Cascada" or index <title> is. Caller can override. Provide a best guess.
    var title = null;
    var tm = /"id":"video_[0-9A-Fa-f_]+"[\s\S]{0,400}?Casa[^"]*/.exec(data);

    // de-dup (same id can be reached twice) and stable sort by type then name
    var seen = {};
    items = items.filter(function (it) {
      var k = it.type + '|' + it.id + '|' + (it.panoId || '');
      if (seen[k]) return false; seen[k] = 1; return true;
    });
    var order = { scene: 0, hotspot: 1, photo: 2, video: 3, album: 4 };
    var rank = function (t) { return t in order ? order[t] : 9; };  // note: 0 is valid, don't use ||
    items.sort(function (a, b) {
      var d = rank(a.type) - rank(b.type);
      return d || a.name.localeCompare(b.name);
    });

    return {
      title: title,
      locale: primary,
      counts: countByType(items),
      items: items,
      graph: graph          // panoId -> { label, neighbors:[{to,yaw}] }
    };
  }

  function countByType(items) {
    var c = {};
    items.forEach(function (it) { c[it.type] = (c[it.type] || 0) + 1; });
    return c;
  }

  var api = { parseTour: parseTour, parseLocale: parseLocale, scanObjects: scanObjects };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VTParser = api;
})(typeof self !== 'undefined' ? self : this);
