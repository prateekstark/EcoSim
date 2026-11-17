#!/usr/bin/env node
// Builds dist/ecosim.html: the dashboard, engine and worker inlined into one self-contained file.
// A tiny ES-module linker: each module becomes an IIFE returning its exports (no cycles allowed).
//   node cli/bundle.js [--artifact out.html]   (--artifact writes a copy without doctype/html/charset)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const varName = (abs) => '__m_' + relative(ROOT, abs).replace(/[^a-zA-Z0-9]/g, '_');

function link(entry) {
  const mods = new Map();
  const order = [];
  function visit(abs, stack = []) {
    if (stack.includes(abs)) throw new Error(`Import cycle: ${[...stack, abs].map((p) => relative(ROOT, p)).join(' -> ')}`);
    if (mods.has(abs)) return;
    let src = readFileSync(abs, 'utf8');
    const deps = [], exports = [], reexports = [];
    const dep = (spec) => { const d = resolve(dirname(abs), spec); deps.push(d); return varName(d); };
    src = src.replace(/^import\s+(.+?)\s+from\s+['"](.+?)['"];?[ \t]*$/gm, (m, what, spec) => {
      const v = dep(spec);
      what = what.trim();
      if (what.startsWith('* as ')) return `const ${what.slice(5).trim()} = ${v};`;
      if (what.startsWith('{')) return `const ${what.replace(/\s+as\s+/g, ': ')} = ${v};`;
      throw new Error(`Unsupported import in ${abs}: ${m}`);
    });
    src = src.replace(/^export\s+\*\s+from\s+['"](.+?)['"];?[ \t]*$/gm, (m, spec) => { reexports.push(`...${dep(spec)}`); return ''; });
    src = src.replace(/^export\s+\{([^}]+)\}\s+from\s+['"](.+?)['"];?[ \t]*$/gm, (m, names, spec) => {
      const v = dep(spec);
      for (const n of names.split(',')) { const [a, b] = n.trim().split(/\s+as\s+/); reexports.push(`${b || a}: ${v}.${a}`); }
      return '';
    });
    src = src.replace(/^export\s+\{([^}]+)\};?[ \t]*$/gm, (m, names) => {
      for (const n of names.split(',')) { const [a, b] = n.trim().split(/\s+as\s+/); exports.push(`${b || a}: ${a}`); }
      return '';
    });
    src = src.replace(/^export\s+(async\s+function\*?|function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (m, kw, name) => {
      exports.push(name);
      return `${kw} ${name}`;
    });
    if (/^\s*(import|export)\s/m.test(src)) throw new Error(`Unhandled import/export left in ${abs}`);
    for (const d of deps) visit(d, [...stack, abs]);
    mods.set(abs, { v: varName(abs), src, exports, reexports });
    order.push(abs);
  }
  visit(resolve(ROOT, entry));
  return order.map((abs) => {
    const m = mods.get(abs);
    return `// ${relative(ROOT, abs)}\nconst ${m.v} = (() => {\n${m.src}\nreturn { ${[...m.reexports, ...m.exports].join(', ')} };\n})();`;
  }).join('\n\n');
}

const safe = (code) => code.replace(/<\/script/gi, '<\\/script');
const workerCode = link('web/worker.js');
const appCode = link('web/app.js');
const html = readFileSync(resolve(ROOT, 'web/index.html'), 'utf8');
const tag = '<script type="module" src="app.js"></script>';
if (!html.includes(tag)) throw new Error('Entry script tag not found in web/index.html');
const page = html.replace(tag, () => `<script type="text/plain" id="worker-src">\n${safe(workerCode)}\n</script>\n<script>\n"use strict";\n${safe(appCode)}\n</script>`);

mkdirSync(resolve(ROOT, 'dist'), { recursive: true });
const out = resolve(ROOT, 'dist/ecosim.html');
writeFileSync(out, page);
console.log(`Wrote ${relative(ROOT, out)} (${(page.length / 1024).toFixed(0)} KB)`);

const i = process.argv.indexOf('--artifact');
if (i > 0 && process.argv[i + 1]) {
  const stripped = page.replace(/^<!doctype html>\s*<html[^>]*>\s*<meta charset="utf-8">\s*/i, '');
  writeFileSync(process.argv[i + 1], stripped);
  console.log(`Wrote ${process.argv[i + 1]}`);
}
