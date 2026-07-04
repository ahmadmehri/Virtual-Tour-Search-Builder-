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

  // JS/JSON string bodies (e.g. inside a "data":{"label":"..."} block) use real
  // JSON escaping, unlike the ad hoc locale .txt values decodeLocale() handles.
  function unescapeJsonString(s) {
    try { return JSON.parse('"' + s + '"'); }
    catch (e) { return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
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

  // Same string-aware brace-walk as scanObjects, but returns one balanced {...}
  // slice starting at a known '{' index. Used to safely bound a "data":{...}
  // block even if an author-typed label ever contains a literal '}'.
  function sliceBalanced(text, openIdx) {
    var depth = 0, inStr = false, esc = false;
    for (var i = openIdx, n = text.length; i < n; i++) {
      var ch = text.charCodeAt(i);
      if (inStr) {
        if (esc) { esc = false; }
        else if (ch === 92) { esc = true; }
        else if (ch === 34) { inStr = false; }
        continue;
      }
      if (ch === 34) { inStr = true; }
      else if (ch === 123) { depth++; }
      else if (ch === 125) { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
    }
    return null;
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
  // 3DVista gives every editor component an internal name, independent of any
  // public locale text: most media/hotspot classes use "data":{"label":"..."},
  // some UI components use "data":{"name":"..."} instead — check both. Takes the
  // FIRST "data":{...} in the slice, which is always the object's own (nested
  // children's "data" blocks, if any, serialize later in the same slice).
  function grabDataLabel(obj) {
    var di = obj.indexOf('"data":{');
    if (di < 0) return null;
    var seg = sliceBalanced(obj, di + 7); // +7 = index of the '{' itself
    if (!seg) return null;
    var m = /"label":"((?:\\.|[^"\\])*)"/.exec(seg) || /"name":"((?:\\.|[^"\\])*)"/.exec(seg);
    return m ? unescapeJsonString(m[1]) : null;
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
    var overlayDataLabel = {};  // overlayId -> 3DVista editor's own pin name (fallback hotspot name)
    var structLabelById = {};   // mediaId   -> 3DVista editor's own name (fallback scene/photo/video/album name)
    var mediaSeen = {};         // mediaId   -> 1, for every panorama/photo/video/album id found structurally

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
          if (!overlayDataLabel[ovId]) {
            var ovLbl = grabDataLabel(obj);
            if (ovLbl) overlayDataLabel[ovId] = ovLbl;
          }
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
          mediaSeen[pId] = 1;
          if (!structLabelById[pId]) {
            var pLbl = grabDataLabel(obj);
            if (pLbl) structLabelById[pId] = pLbl;
          }
        }
      }
      // thumbnails + structural names for photos / videos / albums / panoramas
      // (object whose own id carries these) — recorded regardless of whether
      // locale text exists for it, so it can still become a searchable item.
      var idm = /"id":"((?:photo|video|album|panorama)_[0-9A-Fa-f_]+)"/.exec(obj);
      if (idm) {
        mediaSeen[idm[1]] = 1;
        var th = grabThumb(obj);
        if (th && !thumbById[idm[1]]) thumbById[idm[1]] = th;
        if (!structLabelById[idm[1]]) {
          var dLbl = grabDataLabel(obj);
          if (dLbl) structLabelById[idm[1]] = dLbl;
        }
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
      // A dual-skin export ships the SAME tour data twice (script_general.js +
      // script_mobile.js), so each doorway is seen once per skin. Keep one edge per
      // target so the scene graph isn't doubled.
      if (best && a.to) {
        var nbs = graph[best.id].neighbors;
        if (!nbs.some(function (n) { return n.to === a.to; }))
          nbs.push({ to: a.to, yaw: a.yaw, pitch: a.pitch, overlayID: a.overlayID });
      }
    });

    // ---- build searchable items from every element found, locale or not ----
    // Priority for the display/search name: a public locale label/tooltip first
    // (human-authored, and the only thing navigation can reliably use), then the
    // 3DVista editor's own internal name (always present, but not author-facing),
    // then a generic placeholder as a last-resort safety net. Whichever name(s)
    // weren't chosen are kept in altNames so they stay searchable too.
    var items = [];
    var TYPE = { panorama: 'scene', photo: 'photo', video: 'video', album: 'album' };
    var TYPE_DISPLAY = { scene: 'Scene', hotspot: 'Hotspot', photo: 'Photo', video: 'Video', album: 'Album' };
    var placeholderCounters = {};
    function nextPlaceholder(type) {
      placeholderCounters[type] = (placeholderCounters[type] || 0) + 1;
      return (TYPE_DISPLAY[type] || type) + ' ' + placeholderCounters[type];
    }
    function altNamesOf(chosen, candidates) {
      var out = [];
      candidates.forEach(function (n) { if (n && n !== chosen && out.indexOf(n) < 0) out.push(n); });
      return out.length ? out : undefined;
    }

    var mediaIds = {};
    Object.keys(loc).forEach(function (id) { mediaIds[id] = 1; });
    Object.keys(mediaSeen).forEach(function (id) { mediaIds[id] = 1; });
    panoRanges.forEach(function (pr) { mediaIds[pr.id] = 1; });

    Object.keys(mediaIds).forEach(function (id) {
      var pfx = id.split('_')[0].toLowerCase();
      var type = TYPE[pfx];
      if (!type) return;
      var entry = loc[id] || {};
      var localeLabel = entry.label || null;
      var structLabel = structLabelById[id] || null;
      var chosen, nameSource;
      if (localeLabel) { chosen = localeLabel; nameSource = 'locale'; }
      else if (structLabel) { chosen = structLabel; nameSource = 'structural'; }
      else { chosen = nextPlaceholder(type); nameSource = 'generated'; }
      items.push({
        type: type,
        id: id,
        label: localeLabel || chosen,  // navigation target — real locale label if one exists;
                                        // only a fallback name when none exists at all (may not
                                        // be navigable — the widget already degrades gracefully)
        name: chosen,                  // display/search name (the builder may rename this)
        nameSource: nameSource,        // 'locale' | 'structural' | 'generated' — Step 2 UI only
        altNames: altNamesOf(chosen, [localeLabel, structLabel]),
        subtitle: entry.subtitle || null,
        thumb: thumbById[id] || null
      });
      if (type === 'scene' && graph[id] && localeLabel) graph[id].label = localeLabel;
    });

    // ---- hotspots ---------------------------------------------------------
    Object.keys(panoOverlays).forEach(function (panoId) {
      var panoEntry = loc[panoId];
      var panoLabel = panoEntry && panoEntry.label ? panoEntry.label : null;
      panoOverlays[panoId].forEach(function (ovId) {
        var areas = overlayAreas[ovId];
        if (!areas) return;
        var overlayLabel = overlayDataLabel[ovId] || null;
        areas.forEach(function (areaId) {
          var le = loc[areaId];
          var tip = le && le.toolTip ? le.toolTip : null;
          var chosen, nameSource;
          if (tip) { chosen = tip; nameSource = 'locale'; }
          else if (overlayLabel) { chosen = overlayLabel; nameSource = 'structural'; }
          else { chosen = nextPlaceholder('hotspot'); nameSource = 'generated'; }
          items.push({
            type: 'hotspot',
            id: areaId,
            label: chosen,             // presentational — hotspot navigation never reads item.label
            name: chosen,              // display/search name (renamable)
            nameSource: nameSource,    // 'locale' | 'structural' | 'generated' — Step 2 UI only
            altNames: altNamesOf(chosen, [tip, overlayLabel]),
            panoId: panoId,
            panoLabel: panoLabel,      // structural — drives hotspot scene-jump, unchanged
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
