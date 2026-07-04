/* ============================================================================
   VT Search Builder — Tutorial deck generator
   ----------------------------------------------------------------------------
   Builds a professional, dark-themed slide deck where EACH SLIDE is a video
   scene and the SPEAKER NOTES are the narration script. Also emits a Markdown
   version of the full script (Tutorial-Script.md) for feeding to a video LLM.

   Run:  node tutorial/build_tutorial_pptx.js     (from the repo root)
   Uses the globally-installed pptxgenjs.
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
let pptxgen;
try { pptxgen = require('pptxgenjs'); }
catch (e) { pptxgen = require('C:/Users/Ahmad/AppData/Roaming/npm/node_modules/pptxgenjs'); }

const DIR = __dirname;
const REPO = path.join(DIR, '..');
const LOGO = path.join(REPO, 'rockbench_Logo.jpg');
const OUT = path.join(DIR, 'VT-Search-Builder-Tutorial.pptx');
const MD = path.join(DIR, 'Tutorial-Script.md');

// --- palette (matches the tool's dark UI: slate + blue, orange for hotspots) ---
const C = {
  bg: '0C1016', panel: '161D27', panel2: '11171f', accent: '2DA3FF', accent2: 'E8943A',
  text: 'EEF3F9', dim: '9FB2C6', sub: 'C7D2DE', green: '36D17A', purple: 'B483FF', rule: '243042'
};
const FH = 'Segoe UI', FB = 'Segoe UI';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';            // 13.33 x 7.5 in
pres.title = 'VT Search Builder — Tutorial';
pres.author = 'RockBench';

const W = 13.33, H = 7.5;
const mdParts = ['# VT Search Builder — Video Tutorial Script\n',
  '_This is the “directory” for the video: each section is a scene. **On screen** = what to show; **Narration** = the voiceover._\n'];
let page = 0;

function base(kicker, title) {
  page++;
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.1, fill: { color: C.accent } });
  if (kicker) s.addText(kicker.toUpperCase(), { x: 0.6, y: 0.42, w: 12, h: 0.3, fontSize: 12, color: C.accent, bold: true, charSpacing: 3, fontFace: FB });
  if (title) {
    s.addText(title, { x: 0.6, y: 0.7, w: 12.1, h: 0.95, fontSize: 29, color: C.text, bold: true, fontFace: FH });
    s.addShape(pres.ShapeType.line, { x: 0.63, y: 1.62, w: 1.7, h: 0, line: { color: C.accent, width: 3 } });
  }
  s.addText('VT Search Builder', { x: 0.6, y: 7.06, w: 6, h: 0.3, fontSize: 9, color: C.dim, fontFace: FB });
  s.addText(String(page), { x: 12.5, y: 7.06, w: 0.5, h: 0.3, fontSize: 9, color: C.dim, align: 'right', fontFace: FB });
  return s;
}

function panel(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.09, fill: { color: fill || C.panel }, line: { color: C.rule, width: 1 } });
}

// bullets: items = [{t, bold, color, sub}] or strings
function bullets(s, items, x, y, w, opts) {
  const o = opts || {};
  const runs = [];
  items.forEach(function (it, i) {
    const obj = (typeof it === 'string') ? { t: it } : it;
    runs.push({
      text: obj.t,
      options: {
        bullet: obj.sub ? { code: '25AA', indent: 18 } : { code: '2022', indent: 16 },
        indentLevel: obj.sub ? 1 : 0,
        color: obj.color || (obj.bold ? C.text : C.sub),
        bold: !!obj.bold, fontSize: o.fontSize || 15,
        paraSpaceAfter: (o.gap != null ? o.gap : 9), paraSpaceBefore: 0
      }
    });
  });
  s.addText(runs, { x, y, w, h: o.h || 4.6, fontFace: FB, valign: 'top', lineSpacingMultiple: 1.04 });
}

function chip(s, x, y, w, label, dot) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h: 0.42, rectRadius: 0.21, fill: { color: '15202E' }, line: { color: '2B3B4F', width: 1 } });
  if (dot) s.addShape(pres.ShapeType.ellipse, { x: x + 0.14, y: y + 0.16, w: 0.1, h: 0.1, fill: { color: dot } });
  s.addText(label, { x: x + (dot ? 0.3 : 0.16), y: y, w: w - 0.3, h: 0.42, fontSize: 12, color: C.sub, bold: true, valign: 'middle', fontFace: FB });
}

// ---- diagram: 3-step workflow ----
function drawWorkflow(s, y) {
  const bw = 3.7, gap = 0.55, x0 = (W - (bw * 3 + gap * 2)) / 2, bh = 2.5;
  const steps = [
    { n: '1', t: 'Load tour', d: 'Drop your 3DVista export folder', c: C.accent },
    { n: '2', t: 'Configure', d: 'Types · rename · keywords · style', c: C.accent },
    { n: '3', t: 'Export', d: 'One-click ready-to-publish .zip', c: C.green }
  ];
  steps.forEach(function (st, i) {
    const x = x0 + i * (bw + gap);
    panel(s, x, y, bw, bh, C.panel);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: y + 0.3, w: 0.7, h: 0.7, fill: { color: '123A5C' } });
    s.addText(st.n, { x: x + 0.3, y: y + 0.3, w: 0.7, h: 0.7, fontSize: 24, bold: true, color: st.c, align: 'center', valign: 'middle', fontFace: FH });
    s.addText(st.t, { x: x + 1.15, y: y + 0.34, w: bw - 1.3, h: 0.5, fontSize: 20, bold: true, color: C.text, fontFace: FH });
    s.addText(st.d, { x: x + 0.32, y: y + 1.2, w: bw - 0.6, h: 1.1, fontSize: 14, color: C.dim, fontFace: FB, valign: 'top' });
    if (i < 2) s.addShape(pres.ShapeType.line, { x: x + bw + 0.08, y: y + bh / 2, w: gap - 0.16, h: 0, line: { color: C.accent, width: 2.5, endArrowType: 'triangle' } });
  });
}

// ---- diagram: guided walk ----
function drawGuided(s, y) {
  const nodes = [
    { t: 'Pool', sub: 'start', c: C.accent, fill: '16202C' },
    { t: 'Master\nBedroom', sub: '', c: '3A4A5E', fill: '16202C' },
    { t: 'Great\nRoom', sub: '', c: '3A4A5E', fill: '16202C' },
    { t: 'Kitchen', sub: 'target ✓', c: C.accent, fill: '123A5C' }
  ];
  const r = 0.95, gapx = (W - 1.2 - nodes.length * r) / (nodes.length - 1);
  nodes.forEach(function (nd, i) {
    const x = 0.6 + i * (r + gapx);
    s.addShape(pres.ShapeType.ellipse, { x, y, w: r, h: r, fill: { color: nd.fill }, line: { color: nd.c, width: 3 } });
    s.addText(nd.t, { x: x - 0.25, y: y, w: r + 0.5, h: r, fontSize: 12, bold: true, color: C.text, align: 'center', valign: 'middle', fontFace: FB });
    if (nd.sub) s.addText(nd.sub, { x: x - 0.25, y: y + r + 0.02, w: r + 0.5, h: 0.3, fontSize: 11, color: C.dim, align: 'center', fontFace: FB });
    if (i < nodes.length - 1) {
      const ax = x + r + 0.1;
      s.addShape(pres.ShapeType.line, { x: ax, y: y + r / 2, w: gapx - 0.2, h: 0, line: { color: C.purple, width: 2.5, endArrowType: 'triangle' } });
    }
  });
  s.addText('turn the shortest way → centre the doorway → "click" to enter the next panorama',
    { x: 0.6, y: y + r + 0.45, w: W - 1.2, h: 0.4, fontSize: 13, italic: true, color: C.accent2, align: 'center', fontFace: FB });
}

// ---- diagram: search box mock ----
function drawSearchBox(s, x, y, w) {
  // bar
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h: 0.55, rectRadius: 0.1, fill: { color: '121821' }, line: { color: C.accent, width: 2 } });
  s.addShape(pres.ShapeType.ellipse, { x: x + 0.18, y: y + 0.17, w: 0.2, h: 0.2, fill: { color: C.bg }, line: { color: C.accent, width: 2 } });
  s.addText('kitch', { x: x + 0.55, y: y, w: w - 1, h: 0.55, fontSize: 16, bold: true, color: C.text, valign: 'middle', fontFace: FB });
  // rows
  const rows = [
    { t: 'Kitchen', s2: 'Panorama scene', b: 'SCENE', bc: '123A5C', tc: '7EC5FF', guide: true },
    { t: 'Go to Kitchen', s2: 'in Great Room', b: 'HOTSPOT', bc: '4A2F12', tc: 'F0A85A' },
    { t: 'Kohler Prolific', s2: 'in Kitchen', b: 'HOTSPOT', bc: '4A2F12', tc: 'F0A85A' }
  ];
  const ry = y + 0.7;
  s.addShape(pres.ShapeType.roundRect, { x, y: ry, w, h: 0.6 * rows.length + 0.2, rectRadius: 0.1, fill: { color: '0F141C' }, line: { color: C.rule, width: 1 } });
  rows.forEach(function (rw, i) {
    const yy = ry + 0.1 + i * 0.6;
    if (i === 0) s.addShape(pres.ShapeType.roundRect, { x: x + 0.08, y: yy, w: w - 0.16, h: 0.56, rectRadius: 0.06, fill: { color: '16202C' }, line: { type: 'none' } });
    s.addShape(pres.ShapeType.roundRect, { x: x + 0.18, y: yy + 0.12, w: 0.32, h: 0.32, rectRadius: 0.04, fill: { color: '27384A' }, line: { type: 'none' } });
    s.addText(rw.t, { x: x + 0.62, y: yy + 0.04, w: w - 2.2, h: 0.3, fontSize: 14, bold: true, color: C.text, fontFace: FB });
    s.addText(rw.s2, { x: x + 0.62, y: yy + 0.3, w: w - 2.2, h: 0.24, fontSize: 10.5, color: C.dim, fontFace: FB });
    const bx = x + w - (rw.guide ? 1.95 : 1.15);
    s.addShape(pres.ShapeType.roundRect, { x: bx, y: yy + 0.14, w: rw.b === 'SCENE' ? 0.85 : 1.0, h: 0.28, rectRadius: 0.14, fill: { color: rw.bc }, line: { type: 'none' } });
    s.addText(rw.b, { x: bx, y: yy + 0.14, w: rw.b === 'SCENE' ? 0.85 : 1.0, h: 0.28, fontSize: 9, bold: true, color: rw.tc, align: 'center', valign: 'middle', fontFace: FB });
    if (rw.guide) {
      s.addShape(pres.ShapeType.roundRect, { x: x + w - 0.95, y: yy + 0.12, w: 0.8, h: 0.32, rectRadius: 0.08, fill: { color: C.accent }, line: { type: 'none' } });
      s.addText('Guide', { x: x + w - 0.95, y: yy + 0.12, w: 0.8, h: 0.32, fontSize: 10, bold: true, color: '06121F', align: 'center', valign: 'middle', fontFace: FB });
    }
  });
}

// =========================== SLIDES ===========================

// add a markdown section
function md(scene, onscreen, narration) {
  mdParts.push('\n## ' + scene + '\n');
  if (onscreen) mdParts.push('**On screen:** ' + onscreen + '\n');
  mdParts.push('**Narration:** ' + narration + '\n');
}

// 1 — TITLE
(function () {
  page++;
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.bg } });
  // accent side bar
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: H, fill: { color: C.accent } });
  if (fs.existsSync(LOGO)) s.addImage({ path: LOGO, x: 0.9, y: 0.8, w: 1.0, h: 1.0, rounding: true });
  s.addText('ROCKBENCH PRESENTS', { x: 2.1, y: 1.0, w: 9, h: 0.4, fontSize: 14, color: C.accent, bold: true, charSpacing: 3, fontFace: FB });
  s.addText('VT Search Builder', { x: 0.85, y: 2.3, w: 11.6, h: 1.3, fontSize: 60, bold: true, color: C.text, fontFace: FH });
  s.addText('Add a real search box — and one-click guided navigation —\nto any 3DVista virtual tour.',
    { x: 0.9, y: 3.7, w: 11.4, h: 1.1, fontSize: 22, color: C.sub, fontFace: FB, lineSpacingMultiple: 1.1 });
  chip(s, 0.9, 5.1, 2.2, '100% offline', C.accent);
  chip(s, 3.3, 5.1, 2.7, 'No code · no upload', C.green);
  chip(s, 6.2, 5.1, 2.9, 'Typo-tolerant search', C.accent2);
  chip(s, 9.3, 5.1, 2.9, 'Guided navigation', C.purple);
  s.addText('A complete walkthrough  ·  youtube.com/@rockbench', { x: 0.9, y: 6.6, w: 11, h: 0.4, fontSize: 14, color: C.dim, fontFace: FB });
  s.addNotes('Welcome! In this tutorial you\'ll meet VT Search Builder — a free, offline tool that adds a powerful search box, and even guided scene-by-scene navigation, to any 3DVista virtual tour. No coding, no uploads, no accounts. By the end you\'ll know exactly why it exists, how it works, and how to use it on your own tours in about three clicks. Let\'s dive in.');
  md('Scene 1 — Title / Intro',
    'Logo, big title "VT Search Builder", subtitle, four feature chips (offline, no-code, typo-tolerant, guided navigation), channel handle.',
    'Welcome! In this tutorial you\'ll meet VT Search Builder — a free, offline tool that adds a powerful search box, and even guided scene-by-scene navigation, to any 3DVista virtual tour. No coding, no uploads, no accounts. By the end you\'ll know exactly why it exists, how it works, and how to use it on your own tours in about three clicks. Let\'s dive in.');
})();

// 2 — THE PROBLEM
(function () {
  const s = base('The problem', 'Beautiful tours — but no way to search them');
  panel(s, 0.6, 1.95, 6.0, 4.6);
  bullets(s, [
    { t: '3DVista makes gorgeous virtual tours…', bold: true },
    { t: '…but the exported tour has no search box at all.' },
    { t: 'Visitors must click around blindly to find a room or an object.' },
    { t: 'Large tours — dozens of scenes, hundreds of hotspots — get frustrating fast.' },
    { t: 'There\'s no built-in way to say “take me to the kitchen”.' }
  ], 0.9, 2.25, 5.4, { fontSize: 16, gap: 14 });

  panel(s, 6.9, 1.95, 5.8, 4.6, C.panel2);
  s.addText('What a visitor wants', { x: 7.2, y: 2.2, w: 5.2, h: 0.4, fontSize: 14, bold: true, color: C.accent, fontFace: FB });
  drawSearchBox(s, 7.25, 2.7, 5.1);
  s.addNotes('Here\'s the problem. 3DVista is fantastic at building immersive virtual tours — but once you export one, there is no search. If a visitor wants the kitchen, the fire extinguisher, or photo number twelve, their only option is to click around and hope they stumble onto it. On a big tour with dozens of scenes and hundreds of hotspots, that gets frustrating fast. What people actually want is simple: a search box where they type a word and get taken straight there. That\'s the gap this tool fills.');
  md('Scene 2 — The Problem',
    'Left: bullet list of the pain points. Right: a mock search box (the thing that\'s missing).',
    'Here\'s the problem. 3DVista is fantastic at building immersive virtual tours — but once you export one, there is no search. If a visitor wants the kitchen, the fire extinguisher, or photo number twelve, their only option is to click around and hope they stumble onto it. On a big tour with dozens of scenes and hundreds of hotspots, that gets frustrating fast. What people actually want is simple: a search box where they type a word and get taken straight there. That\'s the gap this tool fills.');
})();

// 3 — THE SOLUTION
(function () {
  const s = base('The solution', 'VT Search Builder, in one sentence');
  panel(s, 0.6, 1.95, 12.1, 1.5, C.panel);
  s.addText([
    { text: 'Drop in your exported tour folder — get back the ', options: { color: C.sub } },
    { text: 'same tour with a search box baked in', options: { color: C.accent, bold: true } },
    { text: '.', options: { color: C.sub } }
  ], { x: 1.0, y: 2.1, w: 11.4, h: 1.2, fontSize: 22, valign: 'middle', fontFace: FB, lineSpacingMultiple: 1.05 });

  const cards = [
    { t: 'In your browser', d: 'Just open one HTML file. Nothing is installed.' },
    { t: 'Nothing uploaded', d: 'Your tour never leaves your computer.' },
    { t: 'Online or offline', d: 'Plain JavaScript that drives the tour\'s own player.' },
    { t: 'Any 3DVista tour', d: 'Re-run it once per tour — works on all of them.' }
  ];
  const cw = 2.85, gx = 0.27, x0 = 0.6;
  cards.forEach(function (c, i) {
    const x = x0 + i * (cw + gx);
    panel(s, x, 3.8, cw, 2.7, C.panel);
    s.addShape(pres.ShapeType.rect, { x: x, y: 3.8, w: cw, h: 0.08, fill: { color: C.accent } });
    s.addText(c.t, { x: x + 0.22, y: 4.05, w: cw - 0.4, h: 0.7, fontSize: 17, bold: true, color: C.text, fontFace: FH });
    s.addText(c.d, { x: x + 0.22, y: 4.85, w: cw - 0.4, h: 1.4, fontSize: 13.5, color: C.dim, fontFace: FB, valign: 'top' });
  });
  s.addNotes('VT Search Builder solves it in one move: you drop in your exported tour folder, and it hands you back the exact same tour — with a search box already built in. Four things make it painless. One: it runs entirely in your browser, nothing to install. Two: nothing is uploaded; your tour never leaves your computer. Three: the result works the same whether the tour is online or opened straight off a USB stick, because it\'s plain JavaScript driving the tour\'s own player. And four: it works on any 3DVista website export — you just run it once per tour.');
  md('Scene 3 — The Solution',
    'Top banner one-liner. Four cards: In your browser / Nothing uploaded / Online or offline / Any 3DVista tour.',
    'VT Search Builder solves it in one move: you drop in your exported tour folder, and it hands you back the exact same tour — with a search box already built in. Four things make it painless. One: it runs entirely in your browser, nothing to install. Two: nothing is uploaded; your tour never leaves your computer. Three: the result works the same whether the tour is online or offline, because it\'s plain JavaScript driving the tour\'s own player. And four: it works on any 3DVista website export — you run it once per tour.');
})();

// 4 — WORKFLOW OVERVIEW
(function () {
  const s = base('The big picture', 'Three steps, no editing');
  drawWorkflow(s, 2.4);
  s.addText('You never touch any code. Unzip the result, upload the folder (or open it locally) — done.',
    { x: 0.6, y: 5.7, w: 12.1, h: 0.6, fontSize: 16, color: C.sub, align: 'center', fontFace: FB });
  s.addNotes('The whole workflow is just three steps. Step one: load your tour by dropping in the exported folder. Step two: configure — choose what\'s searchable, rename items, add keywords, and tweak the look. Step three: export — one click gives you a ready-to-publish zip. That\'s it. You never edit a single line of code. You unzip the result, upload the folder to your website — or just open it locally — and the search is already there. Let\'s walk through each step.');
  md('Scene 4 — Workflow Overview',
    'Animated 3-step diagram: Load → Configure → Export, with arrows.',
    'The whole workflow is just three steps. Step one: load your tour by dropping in the exported folder. Step two: configure — choose what\'s searchable, rename items, add keywords, and tweak the look. Step three: export — one click gives you a ready-to-publish zip. You never edit a line of code: unzip, upload, done. Let\'s walk through each step.');
})();

// 5 — STEP 1 LOAD
(function () {
  const s = base('Step 1 · Load', 'Drop in your exported tour folder');
  bullets(s, [
    { t: 'Open VT-Search-Builder.html (double-click — it\'s a single file).', bold: true },
    { t: 'Drag your exported tour folder onto the page…' },
    { t: '…or click “Choose tour folder…” (always works in every browser).' },
    { t: 'This is the folder with index.htm, script.js, media/ and locale/.' },
    { t: 'The tool instantly reads it — no upload, all local.' }
  ], 0.9, 2.1, 6.3, { fontSize: 16, gap: 13 });

  panel(s, 7.5, 2.1, 5.2, 3.4, C.panel);
  s.addText('📁  Choose your exported tour folder', { x: 7.7, y: 2.7, w: 4.8, h: 0.6, fontSize: 16, bold: true, color: C.text, align: 'center', fontFace: FB });
  s.addShape(pres.ShapeType.roundRect, { x: 8.5, y: 3.5, w: 3.2, h: 0.6, rectRadius: 0.1, fill: { color: C.accent } });
  s.addText('Choose tour folder…', { x: 8.5, y: 3.5, w: 3.2, h: 0.6, fontSize: 13, bold: true, color: '06121F', align: 'center', valign: 'middle', fontFace: FB });
  s.addText('Nothing is uploaded — everything runs locally in your browser.', { x: 7.7, y: 4.5, w: 4.8, h: 0.6, fontSize: 12, color: C.dim, align: 'center', fontFace: FB });
  s.addText('💡 Tip: folder drag-and-drop is most reliable in Firefox and on hosted pages — but the “Choose folder” button works everywhere.',
    { x: 0.6, y: 5.9, w: 12.1, h: 0.7, fontSize: 13, italic: true, color: C.accent2, fontFace: FB });
  s.addNotes('Step one — loading your tour. Open VT-Search-Builder dot HTML; it\'s a single file, so you just double-click it. Then drag your exported tour folder onto the page — or click "Choose tour folder". That folder is the website export, the one containing index dot htm, script dot js, the media folder and the locale folder. The moment you select it, the tool reads everything locally and shows you what it found. Quick tip: folder drag-and-drop is smoothest in Firefox and on hosted pages, but the "Choose folder" button always works, in every browser.');
  md('Scene 5 — Step 1: Load',
    'Left: steps. Right: the drop-zone / “Choose tour folder” button screenshot.',
    'Step one — loading your tour. Open VT-Search-Builder dot HTML; it\'s a single file, so just double-click it. Then drag your exported tour folder onto the page, or click "Choose tour folder". That folder is the website export — the one with index.htm, script.js, the media folder and the locale folder. The moment you select it, the tool reads everything locally and shows what it found. Tip: drag-and-drop is smoothest in Firefox, but the button always works.');
})();

// 6 — STEP 2 WHAT WAS FOUND
(function () {
  const s = base('Step 2 · What was found', 'It understands your whole tour');
  const stats = [['5', 'SCENES', C.accent], ['33', 'HOTSPOTS', C.accent2], ['1', 'PHOTO', C.green], ['5', 'ALBUMS', C.purple], ['44', 'TOTAL', C.text]];
  const sw = 2.2, gx = 0.27, x0 = 0.85;
  stats.forEach(function (st, i) {
    const x = x0 + i * (sw + gx);
    panel(s, x, 2.1, sw, 1.5, C.panel);
    s.addText(st[0], { x: x, y: 2.2, w: sw, h: 0.8, fontSize: 34, bold: true, color: st[2], align: 'center', fontFace: FH });
    s.addText(st[1], { x: x, y: 3.05, w: sw, h: 0.4, fontSize: 12, color: C.dim, align: 'center', charSpacing: 1, fontFace: FB });
  });
  bullets(s, [
    { t: 'Reads names from the tour\'s locale files — every language you have.', bold: true },
    { t: 'Scenes & photos/videos/albums use their names; hotspots use their tooltips.' },
    { t: 'Also pulls thumbnails and the scene-connection graph (used later for guided walks).' },
    { t: 'Shows a live preview of the search box as you configure.' }
  ], 0.9, 4.0, 11.8, { fontSize: 16, gap: 12 });
  s.addNotes('As soon as the tour loads, you get a summary of everything searchable — here, five scenes, thirty-three hotspots, a photo, and some albums. It reads the names straight from your tour\'s locale files, so every language you authored is supported. Scenes, photos and videos use their names; hotspots use their tooltips. Behind the scenes it also grabs thumbnails and maps out how your scenes connect — that scene graph is what powers the guided navigation we\'ll see in a minute. And it shows a live preview, so you can see the search box update as you make changes.');
  md('Scene 6 — Step 2: What Was Found',
    'Stat cards (Scenes/Hotspots/Photo/Albums/Total), then bullets about names, languages, thumbnails, scene graph.',
    'As soon as the tour loads, you get a summary of everything searchable — here, five scenes, thirty-three hotspots, a photo and some albums. It reads names straight from your locale files, so every language is supported. Scenes and media use their names; hotspots use their tooltips. It also grabs thumbnails and maps how your scenes connect — that graph powers the guided navigation we\'ll see shortly. And it shows a live preview as you configure.');
})();

// 7 — STEP 2 CHOOSE TYPES
(function () {
  const s = base('Step 2 · Searchable types', 'You decide what visitors can find');
  chip(s, 0.9, 2.1, 2.0, '☑ Scenes', C.accent);
  chip(s, 3.05, 2.1, 2.3, '☑ Hotspots', C.accent2);
  chip(s, 5.5, 2.1, 2.6, '☐ Photo · off', C.green);
  chip(s, 8.25, 2.1, 2.6, '☐ Albums · off', C.purple);
  panel(s, 0.6, 2.9, 12.1, 3.5, C.panel);
  bullets(s, [
    { t: 'Scenes and hotspots are ON by default — the player opens them reliably.', bold: true, color: C.green },
    { t: 'Photos, albums and videos are OFF by default.', bold: true, color: C.accent2 },
    { t: 'Why: a 3DVista export only lets an outside script switch the main media. Pop-up photo/album slides are opened by the buttons the author placed — a script can\'t trigger those.', sub: true },
    { t: 'You can tick them on if you\'ve confirmed they open in your tour…', },
    { t: '…and if a re-ticked item can\'t open, search shows a gentle “open it from the menu” note instead of failing silently.', sub: true }
  ], 0.95, 3.2, 11.4, { fontSize: 15, gap: 11 });
  s.addNotes('You\'re in control of what\'s searchable. Scenes and hotspots are on by default because the player opens them reliably. Photos, albums and videos are off by default — and there\'s a good reason. A 3DVista export only lets an outside script switch the main media; things like pop-up photo or album slides are opened by the buttons the author placed inside the tour, and no outside script can trigger those. So if you know a certain type opens in your tour, tick it on. And if a re-ticked item turns out not to open, the search shows a friendly "open it from the menu" note rather than just failing silently.');
  md('Scene 7 — Step 2: Choose Searchable Types',
    'Type toggles (Scenes/Hotspots on, Photo/Albums off) + explanation panel.',
    'You\'re in control of what\'s searchable. Scenes and hotspots are on by default because the player opens them reliably. Photos, albums and videos are off by default — because a 3DVista export only lets an outside script switch the main media; pop-up photo and album slides are opened only by the author\'s own buttons, which a script can\'t trigger. Tick a type on if you\'ve confirmed it opens in your tour. If a re-ticked item can\'t open, search shows a gentle "open it from the menu" note instead of failing silently.');
})();

// 8 — STEP 2 RENAME + KEYWORDS
(function () {
  const s = base('Step 2 · Names & keywords', 'Make everything findable (optional, but powerful)');
  panel(s, 0.6, 2.0, 5.9, 2.0, C.panel);
  s.addText('Display name', { x: 0.85, y: 2.15, w: 5.4, h: 0.4, fontSize: 15, bold: true, color: C.accent, fontFace: FB });
  s.addText([{ text: 'A friendlier label to show & search.\n', options: { color: C.sub } },
  { text: '“01”  →  “Kitchen counter”', options: { color: C.text, bold: true } }],
    { x: 0.85, y: 2.6, w: 5.4, h: 1.2, fontSize: 15, fontFace: FB, lineSpacingMultiple: 1.1 });
  panel(s, 6.7, 2.0, 6.0, 2.0, C.panel);
  s.addText('Extra search words', { x: 6.95, y: 2.15, w: 5.4, h: 0.4, fontSize: 15, bold: true, color: C.accent2, fontFace: FB });
  s.addText([{ text: 'Comma-separated terms a visitor might type.\n', options: { color: C.sub } },
  { text: '“Entrance”  →  front door, lobby, foyer, start', options: { color: C.text, bold: true } }],
    { x: 6.95, y: 2.6, w: 5.5, h: 1.2, fontSize: 15, fontFace: FB, lineSpacingMultiple: 1.1 });
  panel(s, 0.6, 4.3, 12.1, 2.1, C.panel2);
  bullets(s, [
    { t: 'The original name always stays searchable — you never lose anything.', bold: true, color: C.green },
    { t: 'Each item shows with a thumbnail, so you know exactly what you\'re renaming.' },
    { t: 'Navigation always uses the real underlying media, so nothing breaks.' },
    { t: 'All of it is baked into the file as plain text — still 100% offline.' }
  ], 0.95, 4.55, 11.4, { fontSize: 15, gap: 10 });
  s.addNotes('This is where the tool really shines. Every item gets two optional boxes. The first is a display name — turn a cryptic "zero-one" into "Kitchen counter". The second is extra search words — comma-separated terms a visitor might actually type; for a scene called "Entrance" you might add front door, lobby, foyer, start. Now any of those words lands them there. Three reassurances: the original name always stays searchable, so you never lose anything; each item shows a thumbnail so you know what you\'re editing; and navigation always uses the real underlying media, so nothing breaks. And all of this is baked in as plain text — still fully offline.');
  md('Scene 8 — Step 2: Names & Keywords',
    'Two panels: Display name (01 → Kitchen counter) and Extra search words (Entrance → front door, lobby…). Reassurance bullets below.',
    'This is where the tool shines. Every item gets two optional boxes. First, a display name — turn a cryptic "zero-one" into "Kitchen counter". Second, extra search words — comma-separated terms a visitor might type; for "Entrance" you might add front door, lobby, foyer, start, and any of those will land them there. The original name always stays searchable, each item shows a thumbnail so you know what you\'re editing, and navigation always uses the real media so nothing breaks — all baked in as plain text, still fully offline.');
})();

// 9 — SEARCH EXPERIENCE
(function () {
  const s = base('The search experience', 'Forgiving by design');
  drawSearchBox(s, 7.4, 2.05, 5.1);
  bullets(s, [
    { t: 'Case-insensitive — “KITCHEN” = “kitchen”.', bold: true },
    { t: 'Accent-insensitive — “cafe” finds “café”.' },
    { t: 'Typo-tolerant — “bedrom”, “kitchn”, “entrence” still hit.' },
    { t: 'Multi-word — “master bed” → “Master Bedroom”.' },
    { t: 'Browse-all — open the box empty to see everything grouped by type.' },
    { t: 'Results show the type (SCENE / HOTSPOT) and where each hotspot lives.' }
  ], 0.9, 2.1, 6.2, { fontSize: 15.5, gap: 12 });
  s.addText('Example: typing “kitch” matches the Kitchen scene and every hotspot inside it.',
    { x: 7.4, y: 6.0, w: 5.1, h: 0.6, fontSize: 12.5, italic: true, color: C.dim, align: 'center', fontFace: FB });
  s.addNotes('The search itself is built to be forgiving — because real visitors make typos. It\'s case-insensitive, it ignores accents so "cafe" finds "café", and it\'s genuinely typo-tolerant: "bedrom", "kitchn", even "entrence" still find the right thing. Multi-word queries work too — "master bed" finds "Master Bedroom". If someone doesn\'t know what to type, they can open the box empty and browse everything grouped by type. And every result is labelled — you can see whether it\'s a scene or a hotspot, and which scene a hotspot lives in. Here, typing just "kitch" surfaces the Kitchen scene and every hotspot inside it.');
  md('Scene 9 — The Search Experience',
    'Left: feature bullets. Right: search box showing the “kitch” query with results.',
    'The search is built to be forgiving, because real visitors make typos. It\'s case-insensitive, ignores accents so "cafe" finds "café", and is genuinely typo-tolerant — "bedrom", "kitchn", "entrence" all hit. Multi-word works: "master bed" finds "Master Bedroom". Don\'t know what to type? Open the box empty to browse everything by type. Every result is labelled by type and shows where a hotspot lives. Typing just "kitch" surfaces the Kitchen scene and every hotspot inside it.');
})();

// 10 — GUIDED NAV intro
(function () {
  const s = base('Guided navigation', 'Don\'t just jump — guide the visitor there');
  panel(s, 0.6, 2.0, 5.9, 4.4, C.panel);
  s.addText('Jump', { x: 0.85, y: 2.2, w: 5.4, h: 0.5, fontSize: 20, bold: true, color: C.accent, fontFace: FH });
  s.addText('Go straight to the scene — instant teleport.', { x: 0.85, y: 2.75, w: 5.4, h: 0.6, fontSize: 14, color: C.dim, fontFace: FB });
  s.addShape(pres.ShapeType.line, { x: 0.85, y: 3.5, w: 5.4, h: 0, line: { color: C.rule, width: 1 } });
  s.addText('Guide me', { x: 0.85, y: 3.7, w: 5.4, h: 0.5, fontSize: 20, bold: true, color: C.purple, fontFace: FH });
  bullets(s, [
    { t: 'The viewer walks the visitor there, scene by scene.' },
    { t: 'It turns toward each doorway and steps through.' },
    { t: 'A Stop button lets them bail out anytime.' }
  ], 0.95, 4.3, 5.3, { fontSize: 14.5, gap: 9 });

  panel(s, 6.7, 2.0, 6.0, 4.4, C.panel2);
  s.addText('Why it matters', { x: 6.95, y: 2.2, w: 5.5, h: 0.4, fontSize: 14, bold: true, color: C.accent, fontFace: FB });
  bullets(s, [
    { t: 'Visitors keep their sense of place — they see the route, not a teleport.', bold: true },
    { t: 'Great for orientation, wayfinding and storytelling.' },
    { t: 'Powered entirely by the tour\'s own scene connections.' },
    { t: 'Turn it off in Step 2 if you prefer plain jumps.' }
  ], 7.05, 2.7, 5.4, { fontSize: 14.5, gap: 11 });
  s.addNotes('Now for the feature most search add-ons can\'t do. When a result is a scene, the visitor gets two choices. "Jump" teleports them straight there — fast and simple. But "Guide me" is special: instead of teleporting, the viewer walks them there, scene by scene, turning toward each connecting doorway and stepping through it, until they arrive. There\'s a Stop button if they want to bail out. Why does this matter? Because visitors keep their sense of place — they see the actual route rather than blinking to a new spot. It\'s perfect for orientation, wayfinding and storytelling, and it\'s powered entirely by your tour\'s own scene connections. Prefer plain jumps? You can switch guiding off in Step 2.');
  md('Scene 10 — Guided Navigation: Jump vs Guide me',
    'Two panels: “Jump” (instant) vs “Guide me” (walks there). Right panel: why it matters.',
    'Now the feature most search add-ons can\'t do. When a result is a scene, the visitor gets two choices. "Jump" teleports them straight there. But "Guide me" walks them there, scene by scene, turning toward each connecting doorway and stepping through, until they arrive — with a Stop button anytime. Why it matters: visitors keep their sense of place, seeing the route instead of a teleport. It\'s ideal for orientation, wayfinding and storytelling, powered entirely by your tour\'s own scene connections. Prefer plain jumps? Switch guiding off in Step 2.');
})();

// 11 — GUIDED NAV under the hood
(function () {
  const s = base('Guided navigation · how it works', 'Shortest route, shortest turn');
  drawGuided(s, 2.2);
  bullets(s, [
    { t: 'Builds a graph of which doorway connects to which scene.' },
    { t: 'Finds the shortest route from where you are to the target.' },
    { t: 'For each hop, rotates the camera the shorter way (left or right) until the doorway is centred, then clicks it.' },
    { t: 'Restores your tour\'s original camera settings when the walk ends.' }
  ], 0.8, 4.7, 11.9, { fontSize: 14.5, gap: 8 });
  s.addNotes('Here\'s how the guided walk works under the hood, using a real example: from the Pool, to the Kitchen. First, the tool builds a graph of which doorway connects to which scene. Then it finds the shortest route — Pool, to Master Bedroom, to Great Room, to Kitchen. For each hop, it rotates the camera the shorter way — left or right, whichever is the smaller turn — until the connecting doorway is centred on screen, and then it clicks it to step through. It repeats that until the visitor arrives. And when the walk ends, it quietly restores your tour\'s original camera settings, so nothing about your tour is permanently changed.');
  md('Scene 11 — Guided Navigation Under the Hood',
    'Node diagram Pool → Master Bedroom → Great Room → Kitchen with “turn shortest way” note; bullets below.',
    'Here\'s how the guided walk works, with a real example: Pool to Kitchen. The tool builds a graph of which doorway connects to which scene, finds the shortest route — Pool, Master Bedroom, Great Room, Kitchen — and for each hop rotates the camera the shorter way, left or right, until the doorway is centred, then clicks it to step through. It repeats until arrival, and restores your tour\'s original camera settings when the walk ends, so nothing is permanently changed.');
})();

// 12 — STEP 3 EXPORT
(function () {
  const s = base('Step 3 · Export', 'Get your search-enabled tour');
  panel(s, 0.6, 2.0, 6.0, 4.4, C.panel);
  s.addText('Option A — One-click .zip', { x: 0.85, y: 2.2, w: 5.5, h: 0.5, fontSize: 18, bold: true, color: C.accent, fontFace: FH });
  s.addShape(pres.ShapeType.roundRect, { x: 0.85, y: 2.8, w: 4.6, h: 0.6, rectRadius: 0.1, fill: { color: C.accent } });
  s.addText('↓ Export published tour (.zip)', { x: 0.85, y: 2.8, w: 4.6, h: 0.6, fontSize: 13, bold: true, color: '06121F', align: 'center', valign: 'middle', fontFace: FB });
  bullets(s, [
    { t: 'Easiest — unzip, upload, done. No editing.', bold: true, color: C.green },
    { t: 'Your original tour folder is never touched.' },
    { t: 'Best for normal-sized tours (up to ~1 GB).' }
  ], 0.95, 3.7, 5.4, { fontSize: 14, gap: 9 });

  panel(s, 6.7, 2.0, 6.0, 4.4, C.panel2);
  s.addText('Option B — Just the two files', { x: 6.95, y: 2.2, w: 5.5, h: 0.5, fontSize: 18, bold: true, color: C.accent2, fontFace: FH });
  bullets(s, [
    { t: 'Get vtsearch.js + a patched index.htm.', bold: true },
    { t: 'Drop them into your existing tour folder yourself.' },
    { t: 'Best for very large tours (several GB) — nothing is rebuilt.' },
    { t: 'Re-running later just makes a newer vtsearch.js — safe to overwrite.' }
  ], 7.05, 2.85, 5.4, { fontSize: 14, gap: 9 });
  s.addText('Either way: nothing is uploaded — it all runs in your browser.', { x: 0.6, y: 6.6, w: 12.1, h: 0.4, fontSize: 13, italic: true, color: C.dim, align: 'center', fontFace: FB });
  s.addNotes('Step three — getting your finished tour. There are two ways out. Option A is the one-click zip: it rebuilds your whole tour with the search baked in, and you just unzip, upload, and you\'re done — no editing, and your original folder is never touched. That\'s the right choice for normal-sized tours, up to roughly a gigabyte. Option B is for very large tours: instead of rebuilding everything, it hands you just two small files — vtsearch dot js and a patched index dot htm — that you drop into your existing folder yourself. Either way, nothing is uploaded; it all happens in your browser.');
  md('Scene 12 — Step 3: Export',
    'Two options: A) one-click .zip (recommended), B) just the two files for huge tours.',
    'Step three — getting your finished tour. Option A is the one-click zip: it rebuilds your tour with search baked in; unzip, upload, done, and your original folder is never touched — ideal for tours up to about a gigabyte. Option B, for very large tours, hands you just two small files — vtsearch.js and a patched index.htm — to drop into your existing folder yourself. Either way, nothing is uploaded; it all runs in your browser.');
})();

// 13 — UNDER THE HOOD / privacy
(function () {
  const s = base('Under the hood', 'Two small pieces — and your privacy');
  panel(s, 0.6, 2.0, 6.0, 3.0, C.panel);
  s.addText('The parser', { x: 0.85, y: 2.2, w: 5.5, h: 0.5, fontSize: 18, bold: true, color: C.accent, fontFace: FH });
  bullets(s, [
    { t: 'Reads your tour data and locale files.' },
    { t: 'Extracts scenes, hotspots, thumbnails…' },
    { t: '…and the scene-connection graph for guided walks.' }
  ], 0.95, 2.8, 5.4, { fontSize: 14, gap: 9 });
  panel(s, 6.7, 2.0, 6.0, 3.0, C.panel);
  s.addText('The widget', { x: 6.95, y: 2.2, w: 5.5, h: 0.5, fontSize: 18, bold: true, color: C.accent2, fontFace: FH });
  bullets(s, [
    { t: 'A tiny script injected into your tour.' },
    { t: 'Draws the search box and runs the fuzzy match.' },
    { t: 'Drives the tour\'s own player for navigation & guiding.' }
  ], 7.05, 2.8, 5.4, { fontSize: 14, gap: 9 });
  panel(s, 0.6, 5.2, 12.1, 1.4, C.panel2);
  s.addText([
    { text: '🔒  100% offline & private.  ', options: { color: C.green, bold: true } },
    { text: 'No AI or internet at search time. Your tour and your visitors\' searches never leave the browser. The search works the same with no connection at all.', options: { color: C.sub } }
  ], { x: 0.95, y: 5.4, w: 11.4, h: 1.0, fontSize: 15, valign: 'middle', fontFace: FB, lineSpacingMultiple: 1.05 });
  s.addNotes('Very briefly, what\'s actually doing the work. There are two small pieces. The parser reads your tour data and locale files and pulls out the scenes, hotspots, thumbnails, and that scene-connection graph. The widget is a tiny script injected into your tour — it draws the search box, runs the forgiving match, and drives the tour\'s own player to navigate and to perform the guided walks. And one thing worth repeating: it\'s a hundred percent offline and private. There\'s no AI or internet at search time. Your tour, and whatever your visitors type, never leaves the browser — the search works exactly the same with no connection at all.');
  md('Scene 13 — Under the Hood & Privacy',
    'Two panels: “The parser” and “The widget”; a privacy banner across the bottom.',
    'Briefly, what does the work. The parser reads your tour data and locale files and extracts scenes, hotspots, thumbnails, and the scene-connection graph. The widget is a tiny script injected into your tour — it draws the search box, runs the forgiving match, and drives the tour\'s own player to navigate and to guide. And it bears repeating: it\'s a hundred percent offline and private — no AI or internet at search time. Your tour, and whatever visitors type, never leaves the browser.');
})();

// 14 — COMPATIBILITY
(function () {
  const s = base('Good to know', 'Compatibility & limits');
  bullets(s, [
    { t: 'Works on tours exported via 3DVista → “Export to website / HTML”.', bold: true },
    { t: 'Modern Chromium, Firefox, Safari and Edge.' },
    { t: 'Desktop + mobile (dual-skin) tours — the search appears and works on both.' },
    { t: 'Multiple languages — it reads every locale/*.txt.' },
    { t: 'Limitation: pop-up photos/albums can\'t be opened by a script (off by default).', color: C.accent2 },
    { t: 'Independent, unofficial tool — not affiliated with 3DVista.', color: C.dim }
  ], 0.9, 2.1, 11.8, { fontSize: 16, gap: 14 });
  s.addNotes('A few things worth knowing. It works on tours you exported with 3DVista\'s "export to website" or HTML option — the static folder, not the project file. It runs in all modern browsers, and it handles dual-skin tours, so the search appears and works on both the desktop and mobile versions. Multiple languages are supported because it reads every locale file. The one real limitation, which we mentioned, is that pop-up photos and albums can\'t be opened by an outside script, so those are off by default. And to be clear, this is an independent, unofficial tool — it\'s not affiliated with 3DVista; it simply works on the output their export feature produces.');
  md('Scene 14 — Compatibility & Limits',
    'Bulleted list of supported scenarios + the one limitation + the unofficial-tool note.',
    'A few things worth knowing. It works on tours exported with 3DVista\'s "export to website" option — the static folder, not the project file. It runs in all modern browsers and handles dual-skin tours, so search appears on both desktop and mobile. Multiple languages are supported. The one real limitation: pop-up photos and albums can\'t be opened by an outside script, so they\'re off by default. And it\'s an independent, unofficial tool — not affiliated with 3DVista; it just works on their exported output.');
})();

// 15 — RECAP + CTA
(function () {
  page++;
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: H, fill: { color: C.accent } });
  s.addText('RECAP', { x: 0.9, y: 0.7, w: 11, h: 0.4, fontSize: 13, bold: true, color: C.accent, charSpacing: 3, fontFace: FB });
  s.addText('Search — and guide — any 3DVista tour', { x: 0.85, y: 1.1, w: 11.6, h: 0.9, fontSize: 34, bold: true, color: C.text, fontFace: FH });
  bullets(s, [
    { t: 'Drop in your tour → configure → export. No code.', bold: true },
    { t: 'Forgiving search: typos, accents, multiple languages, browse-all.' },
    { t: 'Rename items and add keywords so everything is findable.' },
    { t: 'Guided navigation walks visitors there, the shortest way.' },
    { t: '100% offline & private — one self-contained file.' }
  ], 0.95, 2.2, 11.6, { fontSize: 17, gap: 13 });
  panel(s, 0.85, 5.5, 11.6, 1.3, C.panel);
  if (fs.existsSync(LOGO)) s.addImage({ path: LOGO, x: 1.05, y: 5.7, w: 0.9, h: 0.9, rounding: true });
  s.addText([
    { text: 'Made by RockBench  ·  ', options: { color: C.sub, bold: true } },
    { text: 'youtube.com/@rockbench', options: { color: C.accent, bold: true } },
    { text: '   — subscribe for more 3DVista & geo-engineering tutorials.', options: { color: C.dim } }
  ], { x: 2.2, y: 5.5, w: 10.0, h: 1.3, fontSize: 16, valign: 'middle', fontFace: FB });
  s.addNotes('Let\'s recap. With VT Search Builder you drop in your tour, configure it, and export — no code at any point. You get forgiving search that handles typos, accents and multiple languages, plus a browse-all mode. You can rename items and add keywords so everything is findable. Scene results can guide visitors there, the shortest way. And the whole thing is a single, self-contained file that runs a hundred percent offline. If this was helpful, the tool is free — and you\'ll find it, along with more 3DVista and geo-engineering tutorials, over on the RockBench channel. Thanks for watching — now go make your tours searchable.');
  md('Scene 15 — Recap & Call to Action',
    'Recap bullets + RockBench logo, channel handle, subscribe prompt.',
    'Let\'s recap. With VT Search Builder you drop in your tour, configure it, and export — no code at any point. You get forgiving search that handles typos, accents and multiple languages, plus browse-all. You can rename items and add keywords so everything is findable. Scene results can guide visitors there, the shortest way. And it\'s a single, self-contained file that runs a hundred percent offline. If this helped, the tool is free — find it, plus more 3DVista and geo-engineering tutorials, on the RockBench channel. Thanks for watching — now go make your tours searchable!');
})();

// ---- write outputs ----
pres.writeFile({ fileName: OUT }).then(function () {
  fs.writeFileSync(MD, mdParts.join('\n'));
  console.log('✓ Wrote ' + path.basename(OUT));
  console.log('✓ Wrote ' + path.basename(MD));
}).catch(function (e) { console.error('✗ ', e); process.exit(1); });
