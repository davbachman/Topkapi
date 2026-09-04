# Taprats browser migration verification

The supplied 2014 Taprats 1.1.12 JAR is preserved byte for byte. Its full `Program` entry point runs under CheerpJ 4.3 / Java 8, including all desktop actions. Browser integration is separate Java/JavaScript code; no original class is patched or replaced.

## Original versus browser comparison

The same Java harness ran against the original desktop runtime and browser runtime, with the same SVG dependencies. Machine-readable native baselines and actual browser results are checked in under `tests/`.

| Suite | Records | Result |
| --- | ---: | --- |
| 92 tilings: construction, text round trips, malformed input | 186 | Exact match; includes one original metadata failure |
| 73 indexed designs: load/save/load and figure state | 73 | Exact match |
| Figure constructors, parameters, setters | 100 | Exact match |
| Inference algorithms | 72 | Exact match |
| Seven styles, settings, EPS and raster exports | 36 | Exact match |
| Layer operations and serialization | 1 | Exact match |
| All 73 complete example maps and drawing commands | 73 | All geometry matches; 70 drawing signatures exact; three bounded platform differences |
| Optional SVG export, all seven styles | 7 | All geometric XML identical; default font metadata differs |
| **Total** | **548** | **547 successful checks and one identical pre-existing issue** |

This establishes functional parity, not pixel-for-pixel identity across Java platforms. [Rendering differences](RENDERING-DIFFERENCES.md) quantifies every nonmatching signature: one-pixel rounding at 24 points across two large designs, adjacent emboss palette values in a third, and an unused root font declaration in SVG. No algorithm, geometry, layer, file-format, or tool omission was found.

The native `12.18` tiling text exporter fails because original metadata is null; the browser reproduces it. One unindexed bundled design already requires a missing tiling. The original WBMP option also fails silently with its color image type; native and browser both return false. PNG/JPEG/GIF/BMP write successfully in both runtimes. These baseline issues are retained and documented.

## Interactive original-UI checks

The browser GUI suite invokes the original widgets and actions on Swing's event dispatch thread. It verifies imported example loading; clone/equality/remove/up/down; Space show/hide; pan X/Y, rotation and width controls; selected-layer transform isolation; all seven style selectors and transparency; a mixed-feature wizard's available algorithms, Apply, Preview, Previous and Finish; regular polygon creation, inclusion/exclusion, removal, translation fill/clear, and tiling validity.

Full GUI results, including the final component snapshot and nonzero window dimensions, are in `tests/browser-results/gui.json`. Physical browser mouse and keyboard checks also exercise the native file picker and original canvas UI. Browser file integration and persistence results are recorded separately.

## Build and integration

- The production build and application lint pass. Untouched scaffold UI components are outside the application lint scope.
- `npm run verify` checks SHA-256 hashes of the original application and five pinned dependency JARs.
- The separate browser bridge rebuilds reproducibly from checked-in Java source.
- Browser file operations use a single Java call queue; overlapping runtime calls cannot race.
- Imported custom `.tiling` files register immediately and restore from persistent browser storage on startup.
- Duplicate imports get unique filenames; invalid tiling imports fail without leaving a broken file. A persisted import sequence keeps the latest custom-tiling revision active after reload, including imports in the same second.
- Saved designs, native sidecars, and export files can be downloaded to the computer.
- Both English and French menus were verified in the browser.
- Physical pointer panning changes the original view transform. At 390 px viewport width, the 900 px workspace scrolls.
- Accepting the original discard prompt closes all application windows. Reopen starts cleanly without a second warning.
- `tests/browser-results/integration.json` records persistence, language, layout, revision ordering, valid double-dot filenames, and close/reopen checks.

Browser-reserved shortcuts remain reserved by the browser; all corresponding original menu commands and toolbar controls remain available. The workspace scrolls on narrow screens. CheerpJ requires an internet connection on launch and is subject to its own runtime license.

## Reproducing checks

See `tests/README.md` and `tests/GUI-README.md`. Open the app with `?verify` to include test-only Java classes. Use `window.taprats.runJava(() => ...)` to serialize each library call. Test JARs and fixtures are loaded only in verification mode. Native baseline files intentionally remain strict; differences are diagnosed explicitly rather than silently excluded.

The optional WebMCP file tools are feature-detected. Mock contract checks passed, including deduplication and seven invalid-input rejections. The live experimental registry was unavailable in the test browser; live WebMCP discovery was therefore not verified and is not required for using Taprats.
