import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('dist/pages');
const base = new URL('https://davbachman.github.io/Topkapi/');
for (const route of ['', 'classic/']) {
  const html = await readFile(resolve(output, route, 'index.html'), 'utf8');
  assert.ok(
    html.includes('Topkapi'),
    `Missing application HTML for ${route || '/'}`,
  );
  for (const tag of html.matchAll(/<(?:script|link|img)\b[^>]*>/g)) {
    const path = tag[0].match(/(?:src|href)="([^"]+)"/)?.[1];
    if (!path || path.startsWith('data:')) continue;
    const url = new URL(path, new URL(route, base));
    if (url.origin !== base.origin) continue;
    assert.ok(
      url.pathname.startsWith(base.pathname),
      `Asset escapes /Topkapi/: ${path}`,
    );
    await access(
      resolve(
        output,
        decodeURIComponent(url.pathname.slice(base.pathname.length)),
      ),
    );
  }
}
const examples = JSON.parse(
  await readFile('lib/project/examples.json', 'utf8'),
);
for (const { id } of examples)
  for (const ext of ['json', 'png'])
    await access(resolve(output, 'native-examples', `${id}.${ext}`));
for (const file of [
  'runtime.js',
  'webmcp.js',
  'taprats.jar',
  'browser-bridge.jar',
  'licenses/Alhambra-GPL-2.0.txt',
])
  await access(resolve(output, file));
console.log(
  `Verified both static pages, their linked assets, and all ${examples.length} example projects and thumbnails.`,
);
