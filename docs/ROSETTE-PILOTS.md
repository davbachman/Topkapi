# Rosette-transformed pilot tilings

These three precomputed periodic tilings are the first reference collection for
Craig S. Kaplan's rosette transform. They reconstruct the regular-polygon
construction and contact correction in section 4 of [_Islamic Star Patterns from
Polygons in Contact_ (2005)](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf).
The data is generated during development and shipped with Topkapi; the app does
not run a general tiling transform.

## Reference collection

| Name             | Source catalog ID | Faces in one cell                         | Distinct stored shapes | Purpose                                                     |
| ---------------- | ----------------- | ----------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| Rosette · 4.8²   | `4-8-2`           | 1 octagon and 4 pentagons                 | 2                      | The off-midpoint contact case illustrated in Figures 11–12. |
| Rosette · 4.6.12 | `4-6-12`          | 1 dodecagon, 2 hexagons, and 12 pentagons | 4                      | Mixed rosette orders and several unequal contact positions. |
| Rosette · 6³     | `6`               | 3 regular hexagons                        | 1                      | A simple control whose contacts remain at midpoints.        |

Each starts with ray angle 45° and point separation 0%. These settings produce
continuous periodic patterns and recover the expected rotational symmetry
inside the original regular polygons. Other angles and separations remain
available. As with Hankin construction generally, arbitrary settings can change
the pairing topology or leave unmatched rays; the pilots do not establish that
every setting is a valid ornamental design.

## Rebuilding the data

From the `web` directory, run:

```sh
node scripts/generate-rosette-pilots.mjs
node scripts/generate-rosette-pilots.mjs --check
```

The first command writes `lib/engine/rosette-pilots.json`. The second recomputes
the result and checks byte-for-byte reproducibility. The script uses the existing
source polygons in `lib/engine/catalog.json`, TypeScript from the project's dev
dependencies, and the engine's planar face extraction. Its temporary compiled
modules are written to the ignored `.cache/rosette-generator` directory.

For each placed regular source polygon with at least five sides, the generator
builds the concentric inner polygon rotated by half a vertex angle. Its radius
follows the formula in the paper's Figure 8 discussion. Each new vertex
connects to the corresponding old edge midpoint, with connector length exactly
half an inner side length. Squares use center-to-midpoint spokes. These maps
are assembled across a seven-by-seven patch before extracting whole faces whose
centers fall in one fundamental cell.

Collinear intermediate vertices are removed. Each resulting edge records the
fractional position where it intersects an original tile edge. Edges of an
inner regular polygon, which do not cross source boundaries, use 0.5. In the
4.8² case, the pentagon's unequal fractions are approximately 0.40054381631 and
0.59945618369. Those contacts implement the correction in Figure 12.

Prototype deduplication compares both the polygon coordinates and its directed
contact fractions under cyclic relabelling and rotation. Mirror shapes remain
separate. This preserves contact identity when a shape is placed elsewhere or
when geometrically identical shapes have different contact arrangements.

## Validation

Generation fails unless all of these checks pass:

- Source polygons are regular after placement, and the half-side connector
  condition holds.
- Whole transformed faces cover exactly the source cell's area.
- Every periodic edge has two incident faces with opposite edge directions.
- Both sides of every periodic edge place the contact at the same physical point.
- The periodic cell has Euler characteristic zero after boundary identification.
- Prototype merging preserves the preceding geometric and contact checks.

The source cell areas are 4 for 4.8², approximately 5.56921938165 for 4.6.12,
and 3.46410161514 for 6³. The respective cells contain 14, 42, and 9 edge orbits.
There are 8, 36, and 0 directed edges with non-midpoint contacts.

An additional mathematical benchmark clips the 45° motif to an original
4.8² octagon and checks invariance under a 45° rotation. Explicit contacts
recover eight equal rosette arms; replacing those contacts with midpoints
breaks that invariance. The 4.6.12 dodecagon provides a corresponding 30°
rotation benchmark. These comparisons test the correction's visible result,
not merely whether the contact fields were saved.

## Scope and credit

This pilot supports regular source tilings only. It does not implement the
paper's heuristic transformation of arbitrary irregular polygons, select a
large finished collection, or expose a user-facing transform operation.

The transformation and contact correction are from Craig S. Kaplan's 2005
paper, with the contact adjustment attributed there to Jay Bonner. Source
tilings come from the existing Taprats/Alhambra collection. The reproducible
pilot reconstruction was developed by David Bachman with GPT 6 Astra.

## App integration and browser verification

Find the three references under **Browse tilings → Collection →
Rosette-transformed**. Their catalog previews show a repeated patch centered on
a complete rosette. New layers use the recommended 45° contact construction;
existing regular Taprats/Alhambra entries retain their original defaults.

`Tile.contacts` is an optional array of strictly interior fractions along the
directed polygon edges. Its length must equal the vertex count; absence means
midpoints. The layer-wide Hankin path, individual Hankin motifs, shared weave
reference, and previews use these contacts. Two-point separation uses the
smallest available symmetric split across all included placed contacts, including
inflation rings. The full tiling remains embedded in native projects and tiling
JSON. Older `.tiling` and Java-code exports are unavailable for contact-bearing
tilings because those formats cannot preserve the metadata.

In the tiling editor, contact markers follow vertex moves. Vertex insertion and
removal are unavailable for contact-bearing shapes in this milestone. Contact-aware
tilings use the supported Hankin construction; adapting every older motif family
or adding a manual contact-position editor remains outside this milestone.

Chromium testing on localhost verified the collection filter and repeated
previews, all three reference drawings, the stored-contact controls, changing
point separation to 25%, zooming, and recovering the entire mixed-order project
unchanged after reload. Moving a pentagon vertex moved the contact markers;
construction Undo restored their exact positions. The unsupported vertex and
legacy-export controls were disabled with explanations. No browser console
errors were reported. All 47 native tests, TypeScript checking, scoped lint,
reproducible-data verification, and the production Pages build passed.
