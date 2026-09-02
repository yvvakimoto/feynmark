#!/usr/bin/env node
// Assemble the GitHub Pages site into _site/: the pages from site/, the
// standalone bundle from dist/, and a vendored copy of KaTeX. Vendoring pins
// the site to the same KaTeX as the peer dependency and keeps it working
// without network access.
import { access, cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const out = path.join(root, '_site');

async function need(rel, hint) {
  const abs = path.join(root, rel);
  try {
    await access(abs);
  } catch {
    throw new Error(`build-site: missing ${rel} — ${hint}`);
  }
  return abs;
}

const bundle = await need('dist/feynmark.min.js', 'run `npm run build` first');
const katex = await need('node_modules/katex/dist', 'run `npm install` first');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await cp(path.join(root, 'site'), out, { recursive: true });
await cp(bundle, path.join(out, 'feynmark.min.js'));
// Sourcemap: nice for debugging the published site, but not worth failing on.
await cp(`${bundle}.map`, path.join(out, 'feynmark.min.js.map')).catch(() => {});

const vendor = path.join(out, 'vendor', 'katex');
await mkdir(vendor, { recursive: true });
for (const file of ['katex.min.css', 'katex.min.js']) {
  await cp(path.join(katex, file), path.join(vendor, file));
}
await cp(path.join(katex, 'fonts'), path.join(vendor, 'fonts'), { recursive: true });

console.log('build-site: wrote _site/ (pages + feynmark.min.js + vendored katex)');
