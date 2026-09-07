# Taprats Web

The complete Taprats 1.1.12 desktop application, running locally in a modern browser through CheerpJ 4.3. The supplied `taprats.jar` is preserved byte for byte. This directory contains the web application.

## Run

Requires Node.js 22.13 or later:

```sh
npm ci
npm run dev
```

Open the local URL printed by the server. No Java installation, browser extension, account, or backend data service is needed to use the web app. Internet access is required to load CheerpJ's browser runtime. The community runtime is for personal and non-business use; other use requires a [CheerpJ license](https://cheerpj.com/docs/licensing).

## Use

- **File → Select Example** opens the original library of 73 designs.
- **Add** creates a layer: select one of 92 tilings, edit each feature, apply changes, preview, and finish.
- The original seven styles, layer tools, all figure algorithms, view transforms, and complete custom tiling designer remain available.
- **Files → Import files** brings `.tap` designs and `.tiling` definitions into `/files/workspace`. Imported custom tilings register automatically and restore on your next visit.
- Save and export under `/files/workspace`, then use **Files** to download the outputs. Native `.tap` saves retain their `.png` and `.tap_info` sidecars. Files persist in the browser's IndexedDB; download backups before clearing browser data.
- Original image and EPS exports are preserved. Apache Batik is bundled to enable the original optional SVG exporter.
- The Help dialog provides English/French startup links. Save before changing language or reloading.

## Preservation and verification

`java/taprats/web/BrowserBridge.java` provides window sizing and browser file integration. It does not replace any original class or change geometry, figure, layer, rendering, or serialization logic. The bridge JAR is checked in so Java is needed only to rebuild the adapter (`npm run build:java`).

The original binary SHA-256 is `0cc67879161621db76201adb8dc27262b49cd1ae5a10433195d517efa68d4148`.

See `docs/FEATURE-AUDIT.md`, `tests/README.md`, and `docs/VERIFICATION.md` for the feature inventory, reproducible native/browser comparisons, and verified results. `npm run verify` checks all pinned application/dependency binaries. `npm run build` creates the production application.

The Java desktop UI retains its original sizing and interaction conventions. On narrow screens the workspace scrolls; a mouse or trackpad is recommended. This is a browser migration of the complete application, not a redesign of its tools.

## Original limitations

The supplied distribution contains two unlisted examples; one (`8 rings.tap`) depends on a missing tiling. The built-in `12.18` tiling has missing metadata and its original text exporter fails. Original `.tap` files refer to a tiling by name, so custom tilings must accompany their designs. The original format does not persist layer visibility or the global viewport transform. The original WBMP export silently fails because it passes a color image to a monochrome writer; PNG, JPEG, GIF, and BMP exports work. These are documented baseline behaviors, not newly omitted features.
