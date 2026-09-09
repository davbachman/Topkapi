# Developing Topkapi

Use Node.js 24 and install the locked dependencies with `npm ci`.

`npm run dev` starts the local editor at the root URL printed by the server. The existing Sites development setup is retained. `npm run build` produces the Sites/Cloudflare build; `npm run start` serves it through Wrangler.

`npm run build:pages` produces a static export, then packages it in `dist/pages` for hosting under `/Topkapi/`. This build uses no server, database, or Sites authentication. The GitHub Pages workflow builds and tests `main`, uploads only `dist/pages`, and deploys it. Both the native editor and the preserved `/Topkapi/classic/` route have static HTML entry points. The classic route fetches CheerpJ from its upstream CDN.

The Pages packaging step accounts for Vinext's prefixed asset output directory and supplies a directory entry for the classic route. The build fails if either page, its linked assets, or any example project/thumbnail is missing.

## Checks

```sh
npm run typecheck
npm run test:native
npm run verify
npm run build:pages
```

The 47 native tests exercise all 200 catalog entries and 73 original examples, compare 360 constructions to the original algorithms, and check project recovery, weave stability, outline corners, and exports. `verify` checks the pinned Java artifacts for the classic route. See [browser verification](NATIVE-BROWSER-QA.md) and [the feature inventory](NATIVE-REBUILD.md) for details and remaining limits.

The main editor runs its calculations and stores autosaves in the browser. It does not require Java or an AI account. The application and derived engine are GPL-2.0-or-later; see [the attribution notices](../THIRD-PARTY-NOTICES.md).

The rosette pilot data is reproducible: `npm run generate:rosette` rebuilds it, and `npm run verify:rosette` checks it. See [Rosette pilots](ROSETTE-PILOTS.md) for contact geometry, benchmarks, and current limits.
