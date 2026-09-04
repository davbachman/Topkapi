# Browser parity differences: measured findings

The ten strict output-hash differences are accounted for by floating-point
rounding and an unused SVG font default. They do not identify missing functions
or changed pattern topology. The original application bytecode and strict
baseline results remain unchanged. Pixel-for-pixel identity is **not** claimed.

| Output | Exact measured difference | Cause |
|---|---|---|
| All seven SVG styles | Only `font-family:'Dialog'` becomes `font-family:'SansSerif'`, adding three characters. Every other byte matches. | Platform default font. None of these SVGs contains a text element, so the changed property does not affect their shapes. |
| Ochre Silicate, Emboss layer 1 | 349 of 22,656 polygons select an adjacent shade in the existing palette. Maximum RGB channel difference: 8/255. Every integer polygon coordinate, palette entry and light-vector value is identical. | Shade values lie on opposite sides of integer palette boundaries by at most 9.60 × 10⁻¹⁴. Example: 7.999999999999973 versus 8.000000000000043 selects palette entries 7 versus 8. The other affected boundaries are 4, 12 and 16. |
| Tangle Honey, Interlace layer 2 | 12 of 8,954 commands each change one x coordinate by exactly one pixel: six body vertices and six corresponding shadow vertices. Colors and all other command components match. | A source x coordinate differs by one double ULP: −2.9999999999999996 versus −3.0. The test transform produces 6.000000000000014 versus 5.999999999999986; the original integer cast produces 6 versus 5. |
| Spiky xmas, Interlace layer 2 | The same 12 coordinate differences as Tangle Honey. | Same geometry and rounding boundary, with a different unchanged base color. |

Across the complete unrounded source-point arrays, the maximum coordinate
differences are 1.43 × 10⁻¹⁴ for Ochre and 3.56 × 10⁻¹⁵ for Honey/Spiky.
Those differences are substantially below the existing geometry fingerprint's
1 × 10⁻⁷ precision. Interlace shadow flags also match exactly. These diagnostics
independently reproduce the original native command hashes before comparison.

No application-bytecode fix is recommended for functional parity. Changing the
original shade quantization or integer casting would change its rendering
algorithm. Preserve the strict comparison results and document these specifically
measured platform differences. If exact image bytes later become a separate
requirement, that would require a common numerical/raster pipeline on both
platforms; the current unmodified application does not provide that guarantee.

Evidence and reproduction:

- `tests/browser-results/rendering-differences.json`: checked-in compact findings.
- `tests/baselines/` and `tests/browser-results/`: strict suite records.
- `tests/java/DiagnosticHarness.java` and `public/qa/diagnostic-harness.jar`: regenerate complete command/SVG dumps. Large raw dumps are not checked in.
- `tests/DIAGNOSTICS.md` and `tests/compare_diagnostics.py`: reproduce the quantitative comparison without normalizing or modifying the baselines.
