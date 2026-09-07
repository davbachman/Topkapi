# Native rebuild — September 7, 2026

This is the first native editing milestone of the ground-up rebuild. The main route runs React and TypeScript without loading Java. The previous application remains at `/classic` for reference and for older workflows; its previous verification results apply to that route only. This milestone is not a claim of complete native parity with every legacy function or completion of every proposed future feature.

## Delivered

- Independent geometry, motif, topology, rendering and project modules. Geometry runs in a cancellable browser worker; view changes regenerate the visible patch.
- 105 distinct Alhambra catalog tilings, including four concentric inflation tilings. Searchable previews, per-shape motifs, live star/rosette/extended controls, polygon star/rosette/hourglass, Girih, Intersect and progressive Intersect, adjustable Hankin rays, and neighbor-based inference.
- Direct line drawing and point editing, erasure, exact vertex/midpoint snapping, grid snapping, rotational/reflection symmetry, clipping to the tile, and baking symmetry into editable lines.
- Seed-patch editor: regular polygons, editable vertices, numeric vertex positions, duplicate/remove placements, rotation/reflection, exact edge matching with scaling, translation vectors, concentric ring controls, description and author. Apply stores a private tiling copy within the layer.
- Nine-way parameter gallery for radial and Hankin studies.
- Layers with visibility, locking, reordering, cloning, group-move participation, selection transforms, and copying position. Style, transform, motif, project replacement and canvas gestures have undo/redo; a slider or drag gesture is one undo step.
- Seven render modes; colors, outline width/color, corner joins, opacity, band width, weave clearance and emboss light direction. Paintable bounded regions keep their identities across layer transforms.
- Tile and symmetry-center guides, endpoint/junction/weave diagnostics, device-local recovery, validated self-contained JSON projects, reference-image placement/rotation/scale/opacity, and physical output dimensions.
- SVG, PNG (2400 px on its longest side), and DXF centerline/closed-outline/triangulated-face exports. Export geometry is regenerated for the full output aspect ratio. DXF coordinates are cropped and converted to the chosen physical units; overlapping centerline segments are split and deduplicated. Incomplete geometry is refused at export, with a message to zoom in or simplify.
- Output report: band width against a user-specified minimum, centerline length, connected graphs, interior open ends, and weave conflicts. This reports centerline connectivity, not physical cut-piece counts.
- Optional WebMCP read/replace-project tools sharing the visible document and validation. Unsupported browsers continue normally.

## Verification performed

`npm run test:native` runs 18 tests, including:

- 216 star, rosette and extended-rosette parameter cases compared with line coordinates produced by the unchanged Taprats JAR. Values are compared at 1e-6; reference inputs stay in the valid parameter range.
- Generation and JSON reopening of all 105 catalog tilings, including all four inflation patterns.
- Affine inverses, intersection splitting, overlap deduplication, bounded-face area/Euler checks, stable face IDs, strand traversal and alternating oblique weave constraints.
- Custom symmetry/clipping; neighbor inference; nonempty finite output for irregular motif families; edge matching; cropped physical measurements and DXF entities; concave face triangulation; SVG escaping; invalid-project rejection; pure history transactions and redo branching.

`npm run typecheck`, scoped native lint, `npm run verify` (six unchanged pinned JARs), and the production build passed for this milestone. The native worker is emitted as a separate client asset.

The native browser interaction flow, IndexedDB recovery, PNG download, worker performance during pointer interaction, visual rendering, and responsive layout have **not** had a browser QA pass in this resumed stage. A local HTTP render is checked, but that does not establish those behaviors. The prior browser QA files describe the preserved Java version. Native WebMCP registration/execution has no supported live validation context in this run and is unverified; it is optional and does not block ordinary editing.

## Remaining stages

1. Browser interaction and visual QA for the new native interface; broaden algorithm comparisons to irregular/inferred constructions and add representative geometric regression cases based on any discrepancies.
2. Remaining native legacy coverage: selectable inner/outer face classes, interlace shadows, additional raster/EPS export formats, the legacy example-design library, French localization, and advanced construction-copy/include/exclude workflows. `.tap` compatibility and Java-code export are deliberately not rebuild requirements.
3. Richer construction teaching tools, strand coloring, named reusable motif/variation libraries, multiple recovery snapshots, and reference-image perspective rectification.
4. Fabrication analysis of actual band boundaries and cut pieces, beyond centerline diagnostics.
5. True substitution/rule-based aperiodic tilings. Concentric inflation is not substitution and is labeled accordingly.

## Reproducibility

The catalog importer is `scripts/import-catalog.py` and reads the Alhambra source revision recorded in `THIRD-PARTY-NOTICES.md`. `tests/native/reference-radial.jjs` regenerates the checked-in radial fixtures using Java 8 `jjs -cp public/taprats.jar`; Java is unnecessary for normal tests, development or the native app.
