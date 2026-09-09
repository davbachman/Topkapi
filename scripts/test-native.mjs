import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const root = resolve('.'),
  output = resolve('.cache/native-tests');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'package.json'), '{"type":"module"}');
async function compile(dir) {
  for (const f of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const file = resolve(root, dir, f.name),
      name = relative(root, file);
    if (f.isDirectory()) {
      await compile(name);
      continue;
    }
    if (!/\.(ts|json)$/.test(file)) continue;
    const target = resolve(output, name.replace(/\.(ts|json)$/, '.js'));
    await mkdir(dirname(target), { recursive: true });
    const source = await readFile(file, 'utf8');
    const js = file.endsWith('.json')
      ? 'export default ' + source + ';'
      : ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText;
    await writeFile(
      target,
      js.replace(
        /(from\s+|import\s*|import\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,
        (_, prefix, q, path) =>
          prefix + q + path.replace(/\.json$/, '') + '.js' + q,
      ),
    );
  }
}
await compile('lib/engine');
await compile('lib/project');
await compile('tests/native');
const result = spawnSync(
  process.execPath,
  [
    '--test',
    resolve(output, 'tests/native/engine.test.js'),
    resolve(output, 'tests/native/two-point.test.js'),
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
