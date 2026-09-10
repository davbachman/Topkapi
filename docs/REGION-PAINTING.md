# Repeated region painting

Choose **Paint a region** (B), choose a color, and click an enclosed region. All
matching copies in that layer receive the same color, including translated,
rotated, and mirrored copies. Periodic patterns keep regions of different sizes
separate. Concentric inflation patterns also share paint between genuinely
similar scaled copies; different outlines stay separate. Layers have independent
palettes.

Newly revealed copies stay colored when panning or zooming. Moving, rotating,
or scaling a layer preserves its paint, as do native project saving, reloading,
Undo/Redo, and freezing the visible construction. SVG and EPS use the same paint
lookup as the canvas; raster exports render that SVG. Changing a motif can
change its region shapes and require repainting. **Clear painted regions** clears
the layer's palette.

## Identity and persistence

`Face.id` remains the unique spatial identity needed for face adjacency and the
saved inside/outside classifications of original finite examples. `Face.paintId`
is a separate shared shape identity calculated after removing the layer's pose.
It compares complete polygon outlines, rather than just area or side count.
Redundant collinear vertices are removed before canonicalizing edge lengths and
signed turns over cyclic and reversed traversals. Inflation normalizes lengths
by perimeter. Keys are quantized to avoid changes from floating-point noise and
stored in the existing `Layer.regionColors` map.

Earlier projects with individual face-color entries retain those colors. New
copy-wide paint takes precedence when a region is repainted, without deleting
the earlier entries or changing topology IDs. No viewport-dependent palette
migration is required.

## Verification

Regression tests cover independent analytic repeat fixtures, regions crossing
cell boundaries, rotated and reflected copies, different shape and size
classes, distant viewports, skew lattices, layer transforms, native project
round-trips, Undo/Redo, original individual colors, freezing, concentric scaled
copies, layer isolation, and all seven SVG/EPS drawing styles. Browser checks
exercise the actual paint tool, repeated fills, Undo/Redo, zoom, and reload.
