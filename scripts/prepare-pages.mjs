import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('dist/client');
const output = resolve('dist/pages');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Vinext puts assetPrefix in both asset URLs and output filenames. Pages adds
// /Topkapi/ itself, so the artifact must place those assets at its own root.
for (const name of await readdir(source))
  if (name !== 'Topkapi')
    await cp(resolve(source, name), resolve(output, name), { recursive: true });
await cp(resolve(source, 'Topkapi'), output, { recursive: true });
// Vinext's prerenderer skips routes that respond with a trailing-slash redirect.
// Export without that redirect and give Pages a directory entry for deep links.
await mkdir(resolve(output, 'classic'), { recursive: true });
await cp(
  resolve(source, 'classic.html'),
  resolve(output, 'classic/index.html'),
);
