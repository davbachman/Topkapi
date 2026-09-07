# Native browser checks — September 7, 2026

Tested Chromium against the Vite development server at `http://localhost:3000/` and the built Wrangler application at `http://localhost:3001/`. Project-replacement checks create fresh browser contexts and close only those contexts, preserving the user's open project and storage.

## Repeatable interaction checks

`tests/browser/native-smoke.js` and `native-interactions.js` each contain an async function accepting a Playwright page. Evaluate the function in a Playwright runner and pass a connected page. They create isolated contexts from that browser. Adjust their `root` constant and localhost URL for another checkout. Run `npm run build` then `npm run start -- --port 3001` first. Restart Wrangler after rebuilding its output so it does not retain an old asset manifest. Results must contain the expected success fields and no `error` or runtime errors.

The smoke function verifies worker construction, rename/autosave/reload recovery, new-project undo, drawn motif application/undo, all seven rendering modes, cloning/undo, pan and zoom transactions, new tiling construction copies, valid project opening, malformed-input rejection and SVG download.

The interaction function verifies layer hiding/locking/unlocking, numeric transforms, cloning/reordering/removal, neighbor inference, all nine variation previews, vector-handle dragging/undo, text tiling download/reopening, reference-image loading/removal and all three DXF modes plus WBMP downloads.

## Additional browser and visual checks performed

- Desktop switching of all render modes and style controls. Filled-region path counts for neither/outside/inside/both were 0/89/216/305 for the default study. Polygonal weaving was inspected enlarged, including angled underpass edges, shadows and colored paper. The exact crossing invariant is additionally checked in the engine across zoom, distant pan and layer transforms.
- Original example thumbnail selection and native loading, including the two-layer SimpleStar project. Representative native vector output was compared with Java-rendered example images; imported layer order, y orientation and face selections were corrected from these comparisons.
- Clone/undo/redo and an eight-step pointer pan/undo were compared through saved project JSON. Free-polygon drawing, construction undo/cancel, fill/exclude/remove and repetition preview were exercised. Tiling JSON, `.tiling` and Java-snippet downloads were inspected.
- French startup and language persistence were checked. At 390×844, the page has no horizontal overflow, the canvas remains usable, both side panels can open and close, and undo is reachable. Screenshots were taken after hydration to avoid browser-test style injection during hydration.
- Portable project download/reopen, malformed-file rejection, IndexedDB reload recovery and undo after replacing a project all passed. Recovery tests wait for the current write to complete; they do not mistake the prior saved status for completion.
- Actual SVG, EPS, PNG, JPEG, GIF, BMP and WBMP files were downloaded. Pillow independently opened PNG/JPEG/GIF/BMP at 2400×1800; BMP pixels matched the PNG. WBMP dimensions, header, monochrome bits and row packing were checked independently. Ghostscript rendered EPS successfully. DXF output contained finite cropped physical coordinates, valid EOF records, and LINE/LWPOLYLINE/3DFACE entities as appropriate.
- Final production smoke/interaction runs completed without JavaScript runtime errors. The production app loaded its native worker with no missing-asset responses.

Generated evidence is under ignored `output/playwright/`; it is local QA output, not shipped application data. The checked-in small valid/invalid project files are browser upload fixtures.

## Limits

No Safari/Firefox run was performed. The browser did not expose the optional WebMCP API, so tool registration/execution is unverified. No offline-installability claim is made. Native geometry and renderer comparisons do not establish identical platform font rendering, antialiasing or sketch random sequences with Java.
