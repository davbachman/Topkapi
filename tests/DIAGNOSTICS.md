# Exact-output diagnostics

`public/qa/diagnostic-harness.jar` is optional and contains only `DiagnosticHarness` and its
recorder. It requires the original application JAR and existing parity harness;
SVG calls also require the Batik dependency JARs. It does not modify the app or
the strict parity baselines.

Public browser calls:

```js
const D = await taprats.runJava(() => taprats.library.DiagnosticHarness);
const ochre = await taprats.runJava(() => D.dumpExampleLayer('Ochre Silicate', 1));
const honey = await taprats.runJava(() => D.dumpExampleLayer('Tangle Honey', 2));
const spiky = await taprats.runJava(() => D.dumpExampleLayer('Spiky xmas', 2));
// The returned strings are complete JSON documents. Save them verbatim.
const xml = await taprats.runJava(() => D.dumpSVG(0));
// SVG indexes: Plain, Sketch, Thick, Outline, Filled, Interlace, Emboss.
```

`DiagnosticHarness.main(outputDirectory)` saves all ten artifacts. Raw dumps are not checked in. Generate native and browser output directories
with names `ochre.json`, `honey.json`,
`spiky.json`, and `<Style>.svg`.

Each layer dump contains ordered original `GeoDraw` commands. These independently
reproduce the sorted baseline CRCs. It also contains the renderer's unrounded
`pts` values, read after the original drawing call. Emboss dumps include the
original light vector and palette, and the unrounded shade expression computed
with the identical arithmetic as `Emboss.drawTrap`. Interlace dumps include
shadow flags and unrounded shadow polygons, using the original private shadow
vector method. These let a comparison distinguish a geometric change from
floating-point differences near integer pixel or color-bin thresholds.

Compare matching directories with:

```sh
python3 tests/compare_diagnostics.py NATIVE_DIRECTORY BROWSER_DIRECTORY REPORT.json
```

The comparison retains every changed command and computes maximum pixel/channel
differences. It independently checks exact SVG text changes and every parsed XML
element/attribute, without fetching the SVG DTD or applying any normalization.

Run the native generator with Java 8 from `web/`:

```sh
java -cp 'public/qa/diagnostic-harness.jar:public/qa/parity-harness.jar:public/taprats.jar:public/lib/*' DiagnosticHarness NATIVE_DIRECTORY
```

Open `?verify` before using the browser calls above. Save the three JSON results
and seven SVG strings to a separate directory with the names the native generator
uses, then run the comparison command.
