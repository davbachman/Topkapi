# Native rebuild — September 7, 2026

The main workspace is React/TypeScript with a browser geometry worker and no Java dependency. The original desktop application's construction, layer, style, library, tiling-editor, language and output workflows now have native equivalents. `/classic` retains the previous Java migration as a reference. Old `.tap` files are deliberately outside the rebuild's compatibility requirements.

## Native capabilities

- 206 catalog entries: all 92 original Taprats definitions alongside the 105 Alhambra entries (including four concentric inflation tilings), plus nine curated rosette-transformed tilings with stored contacts. Definitions with the same name are retained separately. Searchable previews preserve author and description metadata; rosette cards identify their sources and orders and frame a complete central pattern.
- All 73 indexed original example designs, converted to self-contained native projects with 297 layers. Conversion preserves finite construction geometry, top-to-bottom ordering, coordinate orientation, layer transforms, style parameters and original inside/outside region selections. Examples remain editable; changing a motif resumes procedural repetition. Freeze/resume is also available for new constructions.
- Per-shape Star, Rosette, Extended Rosette, polygon Star/Rosette/Hourglass, Girih, Intersect, progressive Intersect, Hankin rays and neighbor-dependent inference. Radial and irregular parameter controls update live.
- Motif line drawing, point editing, erasure, construction-point/grid snapping, rotational/reflection symmetry, clipping and symmetry baking. Nine-choice variation gallery.
- Tiling construction: new/open/catalog/save; regular and free polygons; numeric and pointer vertex/placement editing; duplicate, move, rotate, reflect and edge matching with scaling; included master polygons and excluded construction copies; fill, exclude all, remove excluded; editable/drawable translation vectors; repetition preview and concentric controls; name, description and author. Apply also registers the tiling in the browser library. Standalone native JSON, textual `.tiling` and Java initialization-snippet exports are supported. Native JSON is required for concentric inflation.
- Layers with visibility, locking, reorder buttons and dragging, cloning, multiple selection, group-move participation, numeric/pointer transforms and copying position. Document edits and canvas gestures have undo/redo; a gesture is one undo step.
- Seven styles: linework, bands, outlined, interlaced, embossed, filled and sketched. Independent inner/outer fills, optional outlines, color, paper, opacity, band/outline widths, weave clearance, interlace shadows and emboss lighting.
- Interlace choices are tied to a doubled periodic cell, independent of viewport size, pan, layer rotation or export crop. Joined polygon bands and angled underpass cuts replace the early round background masks. Interlace, outlined and embossed geometry derive from the original band's offset/join construction.
- Paintable regions with stable identities under layer transforms; tiling/center guides; endpoint, junction and weave diagnostics; reference-image placement/scale/rotation/opacity; physical output dimensions.
- IndexedDB recovery, immediate saving status, pending-save page-close warning, validated portable `.topkapi.json` files and undoable project replacement. Earlier `.taprats.json` projects and browser autosaves still open. English/French controls, language persistence, and mobile panel controls with accessible undo/redo.
- SVG, EPS, PNG, JPEG, GIF, BMP, WBMP, editable project and three DXF exports (centerlines, closed outlines, triangulated faces). Raster output has a 2400-pixel longest side. EPS flattens transparency against the paper color. Exports regenerate geometry for the output crop and refuse truncated output.
- Output report: physical band widths against a chosen minimum, centerline length, connected graphs, interior open ends and weave conflicts.
- Optional WebMCP read/replace-project tools use the visible document and the same validation.

## Verification

`npm run test:native` runs 24 tests, including:

- 216 radial and 144 irregular constructions compared with coordinates from the unchanged original JAR at 1e-6 precision. An irregular polygon-arc rounding discrepancy found during this comparison was fixed.
- Generation and self-contained project reopening for every catalog entry.
- Full topology and finite SVG rendering of all 73 examples, comprising 297 layers and approximately 1.99 million graph edges. All 204,987 saved inside/outside classifications from 100 filled layers match the native faces. Representative original/native artwork comparisons caught and fixed layer order, vertical orientation and fill-class differences.
- Affine transforms, exact snapping, planar intersections and overlaps, face extraction, [painting of matching region copies](REGION-PAINTING.md), strand traversal, weave constraints, viewport-independent crossing choices and oblique polygonal underpasses without masks.
- Motif symmetry/clipping, neighbor inference, edge matching, physical clipping/measurements, DXF entities, triangulation, SVG escaping, tiling round trips, fill controls, invalid-input rejection and transactional history.

Type checking, scoped native lint, the six pinned JAR checks and the production build pass. Actual Chromium interaction and export checks are recorded in [NATIVE-BROWSER-QA.md](NATIVE-BROWSER-QA.md). Both development and production workers were exercised. Browser QA uncovered and fixed a development-worker URL issue, saving-status timing, inaccessible mobile panel controls and missing mobile undo access.

This establishes the native workflow coverage and tested cases above, not pixel-identical Java rasterization or exhaustive coverage of every possible parameter combination. Browser interaction testing used Chromium; Safari/Firefox and optional WebMCP execution were not validated in this environment.

## Deliberate differences and practical bounds

The rebuild uses portable self-contained JSON instead of Java serialization and its sidecar files. Live inspectors and undo replace the original multi-stage Apply wizard. Tiling construction runs in an in-page editor rather than multiple independent desktop windows. Standard browser upload/download dialogs replace filesystem-directory browsing. Project and geometry limits bound browser work: 24 layers, a 10 MB project input, and a capped generated viewport patch. Dense output is refused with an actionable message instead of silently exported incompletely. Imported finite examples retain their complete geometry.

Concentric inflation is not substitution. The output report measures centerline connectivity, not actual cut-piece counts. JPEG/GIF/WBMP have their usual color/quality limitations; use SVG/PNG for faithful colored artwork. EPS cannot retain arbitrary overlapping alpha compositing.

## Later development

These additions remain beyond native desktop workflow parity: strand coloring; named reusable motif/variation libraries; multiple recovery snapshots; richer construction teaching; reference-image perspective rectification; fabrication analysis of band boundaries and actual cut pieces; and true substitution/rule-based aperiodic tilings.

## Reproducibility

`scripts/import-catalog.py` reads the Alhambra revision in `THIRD-PARTY-NOTICES.md`. `scripts/import-native-library.jjs` converts the original catalog and example resources. `tests/native/reference-radial.jjs` and `reference-advanced.jjs` regenerate the original algorithm fixtures using Java 8 `jjs -cp public/taprats.jar`. Java is unnecessary for ordinary development, tests or native app use.
