# Taprats Studio

A native web workspace for constructing Islamic geometric patterns. Choose among 105 tilings, edit motifs and tile geometry, combine layers, explore variations, paint regions, and export vector artwork or DXF geometry.

This is the first editing milestone of a ground-up TypeScript rebuild. Its main route has no Java dependency. The preserved desktop migration remains at `/classic`.

## Run locally

Requires Node.js 22.13 or later:

```sh
npm ci
npm run dev
```

Open the URL printed by the server. The native workspace runs its calculations and stores autosaves in your browser. Download a `.taprats.json` project for a portable backup; it contains its own tilings and motifs. Clearing browser storage removes local autosaves.

## Use

- Browse tilings to add a layer. Select a tile shape in the inspector and edit its construction live.
- Draw a motif to edit line segments, snap to construction points, and apply symmetry. Infer from neighboring motifs continues adjacent linework.
- Edit tiling to arrange polygons, match edges, edit vertices, and set translation or concentric repetition.
- Shift-click layers for multiple selection. M moves all unlocked layers with group moves enabled; H or Space-drag pans; V selects a tile; B paints a region.
- Use ⌘/Ctrl-Z and ⇧⌘/Ctrl-Z for undo/redo; ⌘/Ctrl-S downloads the project.
- Set output dimensions through the project name. Export SVG, PNG, DXF centerlines, closed outlines or solid faces. Check output geometry for physical widths and connection diagnostics.

See [the native milestone and remaining stages](docs/NATIVE-REBUILD.md) for delivered capabilities and verification limits. Full native parity and the later research/fabrication features remain in progress. Legacy functionality and its earlier checks are documented in [the classic app guide](docs/CLASSIC-APP.md).

## Development checks

```sh
npm run test:native
npm run typecheck
npm run verify
npm run build
```

The native tests cover all 105 tilings and compare 216 radial constructions to the original application. The old Java test results do not establish native browser UI correctness.

Geometry and catalog work derives from Craig S. Kaplan's Taprats and Pierre Baillargeon's Alhambra. See [licensing and attribution](THIRD-PARTY-NOTICES.md).
