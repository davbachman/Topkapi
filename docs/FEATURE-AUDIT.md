# Taprats 1.1.12 functionality audit

Scope: `/Users/davidbachman/Documents/Taprats/taprats.jar`, dated February 16, 2014. Manifest main class is `csk.taprats.Program`. Findings derive from CFR decompilation of this exact JAR and a Java 8 runtime check, not an older online Taprats description. All decompiled evidence paths below are relative to `/tmp/taprats-audit/decompiled/csk/taprats`.

## Actual catalog and environment

- 271 class files, 75 `.tap` examples, 74 PNGs, 72 textual `.tiling` files, 2 catalog TXT files.
- Examples selector exposes **73** indexed examples from `examples/designs.txt`, alphabetically sorted; all 73 have accompanying `<name>.tap.png` thumbnails. Native Java successfully deserializes all 73. Two additional unindexed designs exist: `7.tap` (works) and `8 rings.tap` (fails in the original because tiling `8+8` is absent).
- Runtime `KnownTilings.countTilings()` is **92**. It combines 58 hardcoded definitions with 66 indexed JAR tilings, overwriting duplicate names; do not add these counts. Six unindexed tiling resources also exist: `4.7 Stars`, `7.6 v2`, `8-6-5 not`, `Girih Star 2`, `Girih Star 3`, `Girih Star 4`.
- Startup scans external `./tilings/*.tiling`, then loads indexed JAR tilings. Loading or saving a tiling registers it in the current session catalog. Evidence: `tile/KnownTilings.java:131,1823,1857`, `tile/Tiling.java:118,187`.
- English and French `ListResourceBundle` classes; default locale controls language. There is no language selection UI in this JAR. `i18n/L.java` also exposes `setLocale` programmatically.
- Standard Java 8 ImageIO reports PNG, JPEG/JPG, GIF, BMP and WBMP writer families. It enumerates aliases/capitalizations separately.
- Native Java available at `/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java`; `/usr/bin/java` cannot find a suitable runtime. The same `bin/jjs` can run Nashorn audit scripts with `-cp taprats.jar`. No JDK compiler required.

## Main design workflows

1. **New Design**, **New Tiling**, **Open**, **Select Example**, **Save**, **Save As**, **Export Image**, **Export EPS**, optionally **Export SVG** appear on the main desktop File menu. Native keyboard menu shortcuts use platform accelerator N/T/O/S/A/I/P/E. `Program.java:24` and `ui/MainWindow.java:442`.
2. Main design can have any number of stacked layers. Add opens the layer creation wizard; Remove removes selected layer; Up/Down reorder; drag/drop also reorders; Clone duplicates geometry/style and per-layer transform. Each layer has a **Drawn** visibility checkbox and Space toggles selection visibility. `ui/toolkit/LayersEditor.java:60`, `StyleTransferHandler.java:36`.
3. Selecting a layer exposes seven style choices and style-specific editing (below). There is **no existing-layer figure editor** in the original main UI: figure generation occurs during Add wizard; existing layer controls alter style and transform.
4. Pan, rotate, zoom use mutually exclusive toolbar modes (click selected mode again to clear), Shift+left/middle/right drag, and mouse wheel interactions. **Transform All Layers** is on by default; disable to manipulate only selected layer. Numeric fields edit center X/Y, rotation degrees, and geometric width (the field is labeled Zooming, but it stores view width). Numeric transform changes apply on Enter. `ui/MainWindow.java:87,542`, `ui/toolkit/TransformEditor.java:167`, `toolkit/Transformer.java`.
5. Geometry in a completed layer is finite: wizard preview's current viewport boundary is used to construct repeated motifs; pan/zoom/rotate preview to choose generated region. It is not an infinite procedural design after Finish. `ui/toolkit/NewLayerEditor.java:221`, `ui/tile/PreviewPanel.java:49`, `app/Prototype.java:69`.
6. Closing, New, Open, and selecting another example warn about unsaved design data. Open and build show progress/wait windows; Cancel during wizard yields no layer. There may be multiple independent custom tiling windows, and closing main program checks all of them. `ui/MainWindow.java:192`.

## Add-layer wizard and figure algorithms

- Four stages: select tiling; edit each distinct feature shape; preview; generate. Previous/Next/Finish and Cancel. Final style is Interlace. `ui/toolkit/NewLayerEditor.java:36,130,221`.
- Tiling selection is alphabetical with visual tiling card, description and author attribution. Shapes have individual clickable previews and larger live feature preview.
- **Apply** commits a feature's currently previewed algorithm/parameters. Changing feature selection without Apply discards those pending changes. Each distinct shape in a tiling gets its own figure; repeated placements share it. Leaving a shape with empty figure is possible. `ui/tile/DesignEditor.java:105,116,133`.
- Default figure is Rosette(n,0,3) for regular polygons with >4 vertices, otherwise empty ExplicitFigure. `app/DesignElement.java:24`.
- **Infer** is a button that derives current feature geometry from other already applied neighboring figures, so order of applying neighbor geometry matters.
- Radial feature choices: **Infer, Star, Rosette, Extended, Girih Tiles, Intersect**.
- Explicit feature choices: **Infer, Star, Rosette, Hourglass, Girih Tiles, Intersect**.
- Star: Side Hops (D, fractional) and Sides Intersections (S, integer), limits tied to polygon vertex count.
- Radial Rosette: Tip Angle (Q, -1 to 1) and Sides Intersections (S, integer); Extended connects an underlying radial Rosette and exposes the same controls.
- Explicit Rosette: Tip Angle Q, Sides Intersections S, **Flex Point R (0 to 1)**.
- Hourglass: Side Hops D plus Hourglass Top Side SH; only in explicit-feature branch.
- Girih Tiles: Star Sides (3 to 24) and Side Hops (1 to 12).
- Intersect: Star Sides (3 to 24), Side Hops (0 to 12), Sides Intersections (1 to 12), and **Progressive** checkbox selecting a separate inference algorithm.
- Slider text values use scaling: Q/R and many style fields display 100 times underlying value. Sliders and numeric fields update preview live; numeric text commits on Enter or focus loss and clamps to bounds. `toolkit/Slider.java:41,100`.
- Exact active choices are proven by `ui/figure/MasterFigureEditor.java:158`; additional old editor classes in JAR are unused and should not be mistaken for exposed functionality. There is no freehand map/line editor; freehand **polygons** belong to the custom tiling editor.

## Seven rendering styles

All share color (Swing color chooser) and transparency, with live preview and OK/Cancel/Reset color-dialog behavior. Transparency is 0–100 displayed, stored as alpha on the color.

| Style | Additional controls / behavior |
|---|---|
| Plain | Thin colored linework. |
| Thick | Width 0–100 displayed (underlying 0–1); Draw Outlines checkbox. |
| Filled | Draw inside regions and Draw outside regions independently; graph face classification. |
| Outlined | Width plus Draw Outlines, joined polygonal bands. |
| Interlaced | Width, Draw Outlines, Gap Width 0–100, Shadow Width 0–70; computes over/under crossings. |
| Embossed | Width, Draw Outlines, Azimuth Angle 0–360 degrees; shading based on light direction. |
| Sketched | Colored jittered strokes; random seed fixed to 279401 in each draw, thus reproducible rendering within runtime. |

Evidence: `ui/style/StyleEditor.java:35,81`, `ui/style/{ColoredEditor,ThickEditor,FilledEditor,InterlaceEditor,EmbossEditor}.java`, `style/Sketch.java:40`.

## Full custom tiling editor

- Separate resizable window with canvas, actions/mouse-mode toolbars, editable **Design Name**, multiline **Design description**, **Author**. New resets; Open imports `.tiling`; Select edits a catalog tiling; Save As writes `.tiling`; Save Code As exports Java initialization snippet. `ui/tile/DesignerWindow.java:53`, `TilingDescriptionEditor.java`.
- Enter one or more digit keys then Enter / Add Polygon to create regular n-gon (3 through 100). Button label dynamically names triangle/square/etc. Additional typed digits accumulate; exceeding 100 resets count to the last digit.
- Draw Polygons builds arbitrary polygons by selecting existing vertices counterclockwise and closes when first vertex is selected again; a click without usable selection cancels current accumulation.
- Copy Polygons and Move Polygons support drag/drop from center or edges; edge-to-edge matching snaps position/orientation (and segment matching can scale to match lengths). Direct C clones hovered polygon; D deletes hovered polygon. Default mouse bindings also support these operations without toolbar selection.
- Toggle Include Polygons in Tiling with T or mode click. Included master polygons and excluded construction copies differ visually. Remove Excluded Polygons (R), Exclude All (E), Fill Using Translation Vectors (F).
- Draw two translation vectors by dragging between polygon vertex/center points; Clear Translation Vectors (U); repeated copies display lattice arrangement; overlap indicators show problematic placements. Fill creates surrounding copies using vectors.
- Preview the Tiling (P) opens repeated-tiling coverage preview. Valid save/preview requires polygons, >=1 included polygon and valid translation vectors; validation errors explain missing element.
- Pan/rotate/zoom toolbar and Shift drag available inside editor. Keyboard N/O/Shift+O/S/Shift+S for New/Open/Select/Save/Save Code. Unsaved and incomplete tiling warnings on New/Open/Select/close.
- Evidence: `ui/tile/DesignerPanel.java:151,162,364,547,785,825,881,926,983,1088,1163,1208`; `DesignerWindow.java:262,283,303`.

## Native file and export compatibility

- `.tap`: Java ObjectOutputStream of `Vector<GeoLayer>` containing style subclasses, prototype figures and geometry boundary. Prototype serializes **tiling name only**, not a complete tiling object. Import of a custom-design `.tap` therefore requires its custom `.tiling` loaded/registered first. Missing name is a real load error. `ui/MainWindow.java:319`, `app/Prototype.java:102`.
- Saving `.tap` also creates `<design>.tap.png` preview (300x200) and `<design>.tap.tap_info` with distinct tiling names, each on own line. A web Save should surface these output files, preferably with optional bundle export, instead of silently losing them. `ui/MainWindow.java:331,351`.
- `.tiling`: human-readable grammar: `tiling "name" count`, two translation vectors, then `regular sides placementCount` or `polygon vertices placementCount` with explicit coordinates, 6-number affine transforms per placement, final quoted description and author. Parser supports `#`, `%`, `//`, `/* */` comments. Writer substitutes quotes/backslashes in metadata and registers tiling. `tile/Tiling.java:118,187`.
- Save Code As `.java` contains `beginTiling`, `setTranslations`, feature/point/placement calls, description/author and `endTiling` snippet, not a standalone class. `tile/KnownTilings.java:83`.
- Image export captures main canvas width/height, white background, rasterized visible layers using current transforms. Java ImageIO format chooser; original supports PNG/JPEG/GIF/BMP/WBMP aliases. `ui/MainWindow.java:304,407`, `toolkit/Util.java:94`.
- EPS exports vector drawing through `GeoDrawEPS`. SVG uses `plugins/SVGExporter` and **requires external Apache Batik**, absent in this JAR; keep operation working via a replacement/native export or explicitly demonstrate original limitation instead of assuming all exports are bundled. `ui/MainWindow.java:373,383,424`, `plugins/SVGExporter.java:27`.
- Recent directories retained in process memory per file category; extension selection appends/replaces suffix; overwrite confirmation.

## Important parity traps / original limitations

- Existing `csk.taprats.Applet` exposes only New Design, New Tiling and Select Example; **it omits Open/Save/all exports**. Wrapping this applet alone is NOT full desktop parity. Use Program/full MainWindow actions and adapt file transfer/downloads.
- Layer visibility `GeoLayer.hidden` is transient and clone constructor does not copy it, so original Save/Load and Clone reset hidden state. Whole-view transform is also not serialized with layer vector; only per-layer deltas persist. These are baseline quirks, not evidence of missing browser serialization.
- `.tap` import must resolve catalog names exactly. Custom tilings need to be imported before matching designs and retained across browser reloads to offer equivalent working-file access.
- Catalog duplicate names overwrite earlier definitions. The 92 loaded records, not all source definitions independently, are the correct baseline.
- At least one tiling file contains Windows-1252 punctuation; blindly requiring UTF-8 would damage descriptions. Native JAR streams use JVM default charset.
- SVG currently lacks its external implementation. The dormant applet and unused editor classes are not equivalent to the supported desktop workflows.

## Bounded parity validation matrix

1. Verify 92 tilings and 73 example entries, thumbnail selection, load each indexed design, compare per-layer style/type, figure graph vertex/edge counts and render against unmodified JAR. Use `/tmp/taprats-audit/baseline.js` and resulting PNG/metrics. Geometry counts avoid font/antialiasing runtime differences; inspect representative rendered crossings and band joins.
2. Create layer on mixed regular/explicit tiling (4.8^2 or 10); exercise radial Star/Rosette/Extended and explicit Star/Rosette/Hourglass; verify Apply and neighbor-dependent Infer. Exercise Girih, both Intersect algorithms, fractional and boundary slider values. Finish and cancel; preview pan/rotate/zoom changes generated boundary.
3. For one nontrivial graph, switch through all seven styles; edit every exposed control; verify inside-only/outside-only/neither/both face rendering; transparent overlap, gap/shadow, emboss direction. Confirm Clone, show/hide + Space, Remove, Up/Down + drag reorder, all/selected transforms and numeric fields.
4. Create regular polygons, edge-snap copy/move, custom polygon, translation vectors; include/exclude, fill, remove excluded, clear/recreate vectors, preview, save/reopen text tiling, export Java; verify metadata and custom tiling appears in Add catalog.
5. Import external `.tap` and `.tiling`; save `.tap` plus both sidecars; reopen saved files in both original Java and browser; inspect exact style/figure/transform state. Test custom tiling dependency ordering and clear missing-name error.
6. Download/open PNG/JPEG/GIF/BMP/WBMP where supported, EPS and SVG; confirm usable output and expected view dimensions/order/visibility. Browser virtual-filesystem writes must reach user-accessible downloads or persistent storage.
7. Verify all secondary dialogs close/return, multiple tiling windows, dirty warnings + Cancel, build/load errors and malformed inputs. Check English and French startup rendering. Test normal browser reload/offline behavior only to the stated deployment support.

Read-only audit scripts, decompiled code, and generated baselines are confined to `/tmp/taprats-audit`. No repository files were changed.
