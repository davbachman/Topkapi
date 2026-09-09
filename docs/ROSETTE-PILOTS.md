# Rosette-transformed reference collection

These nine precomputed periodic tilings implement Craig S. Kaplan's rosette
transform. They reconstruct the regular-polygon construction and contact
correction in section 4 of [_Islamic Star Patterns from Polygons in Contact_
(2005)](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf).
The data is generated during development and shipped with Topkapi; the app does
not run a general tiling transform. The original three pilot IDs remain stable.

## Curated collection

| Name                    | Source ID       | Faces in one cell                     | Stored shapes | Selection rationale                                                     |
| ----------------------- | --------------- | ------------------------------------- | ------------- | ----------------------------------------------------------------------- |
| Rosette · 4.8²          | `4-8-2`         | 1 octagon, 4 pentagons                | 2             | Original pilot; off-midpoint contact counterexample from Figures 11–12. |
| Rosette · 4.6.12        | `4-6-12`        | 1 dodecagon, 2 hexagons, 12 pentagons | 4             | Original pilot; mixed six- and twelvefold rosettes.                     |
| Rosette · 6³            | `6`             | 3 hexagons                            | 1             | Original pilot; simple midpoint-only control.                           |
| Rosette · 3.12²         | `3-12-2`        | 1 dodecagon, 6 pentagons              | 2             | Twelvefold rosettes arranged on a triangular lattice.                   |
| Rosette · 3.4.6.4       | `3-4-6`         | 1 hexagon, 6 pentagons                | 2             | Sixfold rosettes separated by a pentagonal network.                     |
| Rosette · Square 12.4.3 | `square-12-4-3` | 1 dodecagon, 8 pentagons              | 3             | Twelvefold rosettes in a square arrangement.                            |
| Rosette · 3–4–6–12      | `3-4-6-12`      | 1 dodecagon, 3 hexagons, 18 pentagons | 5             | Denser mixed-order arrangement, distinct from 4.6.12.                   |
| Rosette · Snub Square   | `snub-square`   | 4 pentagons                           | 1             | A pentagonal network produced from squares and triangles.               |
| Rosette · 3³.4²         | `3-3-3-4-4`     | 2 pentagons                           | 1             | Alternating rows produce a directional pentagonal network.              |

The first eight sources are from the existing Taprats/Alhambra catalog. The final
source is an analytic reconstruction of a standard regular-polygon tiling, stored
in `lib/engine/rosette-sources.json`; it is not attributed to the legacy catalog.

The selection favors different rosette orders, arrangements, and contact
patterns. It deliberately omits a transformed square grid, which reproduces the
square grid, and duplicate original Taprats versions of the same source tilings.
Analytic trihexagonal (3.6.3.6) and snub hexagonal (3⁴.6) sources were also
checked; both transforms produce regular hexagonal grids equivalent, up to
scale and rotation, to the existing 6³ control and are omitted.
The legacy `snub-hex` catalog entry has unfilled gaps and fails the independent
source-cell area check; it is not included. It is distinct from the standard
snub hexagonal tiling with vertex configuration 3⁴.6.

Each starts with ray angle 45° and point separation 0%. Other angles and
separations remain available. As with Hankin construction generally, arbitrary
settings can change the pairing topology or leave unmatched rays; inclusion in
this collection does not guarantee that every setting is a valid ornamental
design. The two sources made only from triangles and squares do not have a
five-or-higher source rosette order, and their metadata records an empty order
list rather than inventing one.

## Rebuilding the data

From the `web` directory, run:

```sh
npm run generate:rosette
npm run verify:rosette
```

The first command writes `lib/engine/rosette-pilots.json`. The historical filename
is retained so existing imports and generation commands continue to work. The
second recomputes the result and checks byte-for-byte reproducibility. The
script uses source polygons in `lib/engine/catalog.json` and
`lib/engine/rosette-sources.json`, TypeScript from the project's dev dependencies,
and the engine's planar face extraction. Its temporary compiled modules are
written to the ignored `.cache/rosette-generator` directory.

For each placed regular source polygon with at least five sides, the generator
builds the concentric inner polygon rotated by half a vertex angle. Its radius
follows the formula in the paper's Figure 8 discussion. Each new vertex
connects to the corresponding old edge midpoint, with connector length exactly
half an inner side length. Triangles and squares use center-to-midpoint spokes.
These maps are assembled across a seven-by-seven patch before extracting whole
faces whose centers fall in one fundamental cell.

Collinear intermediate vertices are removed. Each resulting edge records the
fractional position where it intersects an original tile edge. Edges of an
inner regular polygon, which do not cross source boundaries, use 0.5. In the
4.8² case, the pentagon's unequal fractions are approximately 0.40054381631 and
0.59945618369. Those contacts implement the correction in Figure 12.

Prototype deduplication compares both the polygon coordinates and its directed
contact fractions under cyclic relabelling and rotation. Mirror shapes remain
separate. This preserves contact identity when a shape is placed elsewhere or
when geometrically identical shapes have different contact arrangements.

For the analytic elongated triangular source, one unit square and two
unit-side equilateral triangles repeat by vectors (1, 0) and (1/2, 1 + √3/2).
Its cell has area 1 + √3/2. The stored coordinates are double-precision
evaluations of this construction. It passes the same edge-pairing and coverage
checks as the legacy sources.

## Validation

Generation fails unless all of these checks pass:

- Every source polygon is regular after placement.
- Source faces cover the complete periodic cell, with paired oppositely directed
  edges, coincident shared midpoint contacts, and torus Euler characteristic zero.
- Every source and transformed face is a simple, counterclockwise polygon with
  positive area, no repeated vertices, zero-length edges, nonadjacent touching
  or overlapping edges, or dangling spikes.
- The regular-polygon half-side connector condition holds.
- Whole transformed faces cover exactly the source cell's area.
- Every periodic edge has two incident faces with opposite edge directions.
- Both sides of every periodic edge place the contact at the same physical point.
- The periodic cell has Euler characteristic zero after boundary identification.
- Prototype merging preserves the preceding geometric and contact checks.

The original pilot source-cell areas are 4 for 4.8², approximately 5.56921938165
for 4.6.12, and 3.46410161514 for 6³. Their respective cells contain 14, 42, and 9
edge orbits, with 8, 36, and 0 directed edges having non-midpoint contacts.

An additional mathematical benchmark clips the 45° motif to an original
4.8² octagon and checks invariance under a 45° rotation. Explicit contacts
recover eight equal rosette arms; replacing those contacts with midpoints
breaks that invariance. The 4.6.12 dodecagon provides a corresponding 30°
rotation benchmark. These comparisons test the correction's visible result,
not merely whether the contact fields were saved.

## Scope and credit

The generator supports complete periodic tilings of regular source polygons
only. It does not implement the paper's heuristic transformation of arbitrary
irregular polygons or expose a user-facing transform operation. Arbitrary
irregular sources, manual contact editing, and adapting every older motif family
remain separate future work.

The transformation and contact correction are from Craig S. Kaplan's 2005
paper, with the contact adjustment attributed there to Jay Bonner. Eight source
tilings come from the existing Taprats/Alhambra collection. The analytic
source fixture and reproducible collection reconstruction were developed by
David Bachman with GPT 6 Astra.

## App integration

Find the references under **Browse tilings → Collection → Rosette-transformed**.
Each entry includes source-name and source-order metadata, and a preview center
and radius chosen to show a complete highest-order source rosette. New layers
use the recommended 45° contact construction; existing regular
Taprats/Alhambra entries retain their original defaults.

`Tile.contacts` is an optional array of strictly interior fractions along the
directed polygon edges. Its length must equal the vertex count; absence means
midpoints. The layer-wide Hankin path, individual Hankin motifs, shared weave
reference, and previews use these contacts. Two-point separation uses the
smallest available symmetric split across all included placed contacts, including
inflation rings. The full tiling remains embedded in native projects and tiling
JSON. Older `.tiling` and Java-code exports are unavailable for contact-bearing
tilings because those formats cannot preserve the metadata.

In the tiling editor, contact markers follow vertex moves. Vertex insertion and
removal are unavailable for contact-bearing shapes. Contact-aware tilings use
the supported Hankin construction. Native tests cover shared periodic contacts,
interior closure, geometric symmetry, project serialization, undo/redo, and
artwork exports in all drawing styles. Browser checks cover collection selection,
previews, contact-aware controls, editing, zooming, and reload recovery.

The expanded collection passes all 50 native tests. Each of the nine entries is
checked for clean default connections and representative angle/separation
variations, native project and tiling round-trips, and all seven SVG/EPS drawing
styles. Source polygons with at least five sides retain their rotational
symmetry at 35°, 45°, and 55° with zero separation. Metadata-free pilot documents
still open; malformed source, order, and preview metadata is rejected.

Browser verification covered the collection at narrow and desktop widths,
scrolling and search, English and French labels, recommended settings, 25%
separation and 144% zoom, exact project recovery after reload, and a downloaded
SVG parsed as valid vector artwork. The production Pages build and its asset
checks passed. Sources needing irregular filler transforms remain outside this
release.
