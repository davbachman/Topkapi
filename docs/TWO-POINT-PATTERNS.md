# Two-point patterns

Choose **Two-point (Hankin)** in the Construction menu. This applies one contact angle and separation to every tile in the active layer. Defaults are 45° and 25%. Explore variations compares nine combinations; Restore tile motifs returns to the stored per-shape motifs. Editing a construction on an imported finite example resumes procedural repetition, as with the other construction controls; Undo restores the original drawing.

The angle ranges from 5° to 85°. Separation ranges from 0% to 100% of the shortest included, placed tile edge. The physical distance is measured in tiling coordinates, independent of the viewport. Inflation tilings include all configured rings in this measurement. Layer scaling scales the complete pattern. Zero separation is the ordinary polygons-in-contact construction within this mode; it still uses this mode's ray-pairing algorithm.

`Layer.twoPoint` stores `{ angle, separation }`, with separation normalized to [0,1]. Absence leaves the previous construction unchanged. Save/import validation, autosave, undo, workers, variation previews, and the periodic weave cache retain these settings. Freezing captures the resulting geometry and resuming restores the two-point construction.

`lib/engine/hankin.ts` implements split ray origins at ±δ/2, minimum-total-length greedy pairing, and opposing-collinear connections. Rays from the same edge may cross but never terminate one another. Winding-aware directions preserve ray indices under reflected placements. Candidate paths must remain inside the tile. The existing Hankin motif's balanced-length heuristic remains unchanged, preserving existing native projects.

`lib/engine/placed.ts` constructs the new motifs after tile placement so differently scaled prototypes and affine placements agree on shared contacts. Both viewport generation and the reference weave use it. The layer setting is included in the geometry-worker trigger and weave cache identity.

## Attribution and validation

Two-point patterns are credited to Jay Bonner. The construction follows Craig S. Kaplan's [Islamic Star Patterns from Polygons in Contact (2005), section 3](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf). The rosette tiling transform is a separate future feature.

`tests/native/two-point.test.ts` checks analytically derived square and hexagon geometry, zero/full separation, reflection, scaled shared-edge contacts, excluded guides, inflation scaling, all 197 catalog defaults, closed strands, zoom/pan/pose/cache weave stability, save validation, undo/redo, restoring motifs, and all seven vector rendering styles. The existing native parity suite remains in place.

Chromium interaction checks on localhost verified selecting the new mode, live canvas changes, separation at 0/25/40/100%, variation selection/application, undo/redo, interlace appearance at 249% zoom, opening a `.topkapi.json` project with 37.5°/40% settings, recovering those settings after reload, restoring the original motifs, and French labels. No browser console errors were reported. The production Pages build and asset checks passed, as did TypeScript checking and all 35 native tests.

As with other inference constructions, arbitrary tile shapes and angle/separation combinations can produce open ends or junctions. The existing construction diagnostics remain available; a nonempty result is not a guarantee of a historically attested or fully interlaceable design.
