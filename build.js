#!/usr/bin/env node
/* ============================================================================
   VT Search Builder — build script
   ----------------------------------------------------------------------------
   Splices the source pieces in src/ into a single self-contained
   VT-Search-Builder.html and embeds the RockBench logo as a base64 data URI,
   so the finished tool is ONE file you can open by double-clicking.

   Usage:  node build.js
   (No dependencies — plain Node.js.)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

function read(p) { return fs.readFileSync(p, 'utf8'); }

// 1) sanity-check the widget parses before we embed it
try {
  // eslint-disable-next-line no-new-func
  new Function(read(path.join(SRC, 'vtsearch-widget.js')));
} catch (e) {
  console.error('✗ vtsearch-widget.js failed to parse:\n', e.message);
  process.exit(1);
}

// 2) embed the logo as a data URI (keeps the tool a single file)
const logoPath = path.join(ROOT, 'rockbench_Logo.jpg');
let logo = '';
if (fs.existsSync(logoPath)) {
  logo = 'data:image/jpeg;base64,' + fs.readFileSync(logoPath).toString('base64');
} else {
  console.warn('! rockbench_Logo.jpg not found — building without the embedded logo.');
}

// 3) splice parser + widget + logo into the shell
let html = read(path.join(SRC, 'builder-shell.html'));
html = html
  .replace('/*__PARSER__*/', () => read(path.join(SRC, 'vt-parser.js')))
  .replace('/*__WIDGET__*/', () => read(path.join(SRC, 'vtsearch-widget.js')))
  .split('__LOGO_DATA_URI__').join(logo);

if (html.includes('/*__PARSER__*/') || html.includes('/*__WIDGET__*/') || html.includes('__LOGO_DATA_URI__')) {
  console.error('✗ build placeholders were not all replaced — check src/builder-shell.html markers.');
  process.exit(1);
}

const out = path.join(ROOT, 'VT-Search-Builder.html');
fs.writeFileSync(out, html);
console.log('✓ Built ' + path.basename(out) + ' (' + (html.length / 1024).toFixed(1) + ' KB)');
