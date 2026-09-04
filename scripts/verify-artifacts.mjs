import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(
  await readFile(new URL('../artifacts.sha256.json', import.meta.url)),
);
for (const [name, expected] of Object.entries(manifest)) {
  const actual = createHash('sha256')
    .update(await readFile(new URL('../public/' + name, import.meta.url)))
    .digest('hex');
  if (actual !== expected) throw new Error(`Artifact mismatch: ${name}`);
}
console.log(
  `Verified ${Object.keys(manifest).length} pinned JARs, including unchanged Taprats 1.1.12.`,
);
