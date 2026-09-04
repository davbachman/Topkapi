# Taprats native/browser parity harness

`tests/java/ParityHarness.java` calls the original, unmodified `taprats.jar`. It creates no
top-level windows. `layers` creates Swing panels only. `styles` exercises AWT
offscreen images, PNG/JPEG codecs, and temporary EPS files.

The checked-in harness is `public/qa/parity-harness.jar` (Java 8 compatible).
To rebuild with a JDK, compile `tests/java/ParityHarness.java` against
`public/taprats.jar` and `public/lib/*`, then package the class output with `jar`.
`parity-harness.jar` contains only harness classes; load it alongside the original
application JAR. Public entry points are `static String run()` (all suites) and
`static String runSuite(String name)`. `main` accepts the optional suite name.

Suites:

- `tilings`: every catalog entry's native tiling text save/reload and default
  prototype construction, plus prototype object save/reload and invalid input.
- `examples`: every bundled example's object deserialization, all per-feature
  geometry, layer styles/settings/transforms, and native object save/reload.
- `examples-render`: every bundled example's full saved-boundary generated map
  and original renderer's drawing commands.
- `figures`: radial stars and rosettes over nine side counts and multiple
  parameters; connected/scaled figures; cloning, object serialization, setters.
- `inference`: infer, star, Girih, intersect, progressive intersect, hourglass,
  and rosette variants, over regular and irregular features in four tilings.
- `styles`: all seven original styles, edited style parameters, hide/show,
  cloning and serialization; EPS output; PNG/JPEG render/export/reopen; SVG
  dependency availability.
- `layers`: layer insertion, reordering, replacement, cloning, active layer,
  coordinate transforms, removal and serialization.
- `svg`: optional separate suite for the added Batik libraries; seven styles
  through the same DOM creation, SVGGraphics2D drawing, and stream(Writer,true)
  path used by the original export menu. Excluded from `all` to preserve the
  original-distribution baseline. Requires added SVG libraries on the classpath.

Geometry is rounded to 1e-7 and canonicalized before CRC32 fingerprinting;
vertices, edges, and drawing operation counts are included. Commands include
shape coordinates, color, line width, cap, and join. Draw command order is
canonicalized; EPS bytes test the original command order for each style.
Raster export checks require nonblank output, correct dimensions, reopening,
and lossless PNG pixels. They deliberately do not compare renderer-specific
antialiasing or JPEG encoder bytes across platforms.

Errors are caught per check as `original-issue` records so the rest can proceed.
This label is definitive **only for the native baseline**. Browser records must
match the native record; any new exception or changed output is a parity failure.
`compare.py native-suite.json browser-suite.json` prints all changed records and
exits nonzero on any difference. Keep the runtime working directory free of an
external `tilings` folder to measure the bundled catalog consistently. Use a fresh browser
profile without imported custom tilings for the 92-entry catalog comparison.

The original distribution lacks Batik, so SVG's dependency check records that
absence. With Batik added, the existing `styles` suite's `export/svg-dependency`
record intentionally changes to `batik-present`; compare against a native run
with the same added libraries. This harness does not automate system dialogs, browser file transfer,
keyboard shortcuts, window layout, the designer mouse tools, or PDF/printing;
those require UI verification separately. Existing algorithm behavior is measured,
not asserted to be mathematically correct for every possible parameter value.

## Running from this checkout

Run `npm ci`, `npm run verify`, and `npm run dev` from `web/`. Open
`http://localhost:3000/?verify` and wait for Ready. In the browser console:

```js
const harness = await taprats.runJava(() => taprats.library.ParityHarness);
const result = await taprats.runJava(() => harness.runSuite('figures'));
console.log(JSON.parse(String(result)));
```

Repeat for the suites above; `examples-render` can take several minutes. For a
native Java 8 run from `web/`:

```sh
java -cp 'public/qa/parity-harness.jar:public/taprats.jar:public/lib/*' ParityHarness figures > native-figures.json
python3 tests/compare.py native-figures.json tests/browser-results/figures.json
```

The full renderer and SVG comparisons intentionally report the platform
differences described in `docs/RENDERING-DIFFERENCES.md`.
