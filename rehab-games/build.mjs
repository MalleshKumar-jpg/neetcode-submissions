import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const GAMES = [
  { entry: 'glowworm',   file: 'glowworm-hollow.html', title: 'Glowworm Hollow' },
  { entry: 'firstsnow',  file: 'first-snow.html',      title: 'First Snow' },
  { entry: 'tideline',   file: 'tide-line.html',       title: 'Tide Line' },
  { entry: 'emberdrift', file: 'ember-drift.html',     title: 'Ember Drift' },
  { entry: 'pottershand', file: 'potters-hand.html',  title: "Potter's Hand" },
  { entry: 'seedpods',   file: 'seed-pods.html',      title: 'Seed Pods' },
  { entry: 'bellows',    file: 'bellows.html',        title: 'Bellows' },
  { entry: 'balloontether', file: 'balloon-tether.html', title: 'Balloon Tether' },
  ...(process.env.DEBUG_HAND ? [{ entry: 'debug-hand', file: 'debug-hand.html', title: 'Hand debug' }] : []),
];

const root = path.dirname(new URL(import.meta.url).pathname);
const nodeModules = process.env.NM_DIR;
if (!nodeModules) throw new Error('set NM_DIR to the directory containing node_modules/three');

await mkdir(path.join(root, 'dist'), { recursive: true });

for (const g of GAMES) {
  const result = await build({
    entryPoints: [path.join(root, 'src/entries', `${g.entry}.js`)],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: ['es2020'],
    legalComments: 'none',
    absWorkingDir: nodeModules,
    nodePaths: [path.join(nodeModules, 'node_modules')],
  });
  const js = result.outputFiles[0].text;

  // Fully self-contained: no CDN, no webfont, no network of any kind. These
  // run on an air-gapped clinical machine straight off a USB stick.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${g.title}</title>
</head>
<body>
<script>${js}</script>
</body>
</html>
`;
  const out = path.join(root, 'dist', g.file);
  await writeFile(out, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`${g.file.padEnd(24)} ${kb} KB`);
}
