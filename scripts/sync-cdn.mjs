#!/usr/bin/env node
// jsDelivr's /gh/ endpoint serves files straight out of the repository at a
// tag, so the standalone bundle has to be committed — unlike dist/, which is
// build output and stays ignored. This script keeps cdn/ in step with dist/.
//
//   node scripts/sync-cdn.mjs           copy dist/ -> cdn/
//   node scripts/sync-cdn.mjs --check   fail if cdn/ is stale (used by CI)
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FILES = ['feynmark.min.js', 'feynmark.min.js.map'];

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const src = path.join(root, 'dist');
const dest = path.join(root, 'cdn');
const check = process.argv.includes('--check');

try {
  await access(path.join(src, FILES[0]));
} catch {
  throw new Error('sync-cdn: dist/ is missing — run `npm run build` first');
}

await mkdir(dest, { recursive: true });

const stale = [];
for (const file of FILES) {
  const built = await readFile(path.join(src, file));
  const committed = await readFile(path.join(dest, file)).catch(() => undefined);
  if (committed && built.equals(committed)) continue;
  if (check) stale.push(file);
  else await writeFile(path.join(dest, file), built);
}

if (check && stale.length > 0) {
  console.error(
    `sync-cdn: cdn/ is out of date (${stale.join(', ')}).\n` +
      'Run `npm run build && npm run sync:cdn` and commit the result — jsDelivr\n' +
      'serves cdn/ from the repository, so a stale copy ships to every user.',
  );
  process.exit(1);
}

console.log(check ? 'sync-cdn: cdn/ matches dist/' : `sync-cdn: updated cdn/ (${FILES.join(', ')})`);
