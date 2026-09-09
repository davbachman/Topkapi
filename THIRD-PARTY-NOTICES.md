# Licensing and attribution

Topkapi was created by **David Bachman with GPT 6 Astra**, building on the work credited below. Copyright © 2026 David Bachman for his contributions; upstream work retains its original authorship and license notices.

The native geometry constructions and catalog in `lib/engine/` are derived from **Taprats**, originally by Craig S. Kaplan, and **Alhambra**, with additional work by Pierre Baillargeon.

Alhambra source: https://github.com/pierrebai/Alhambra — revision `284d7d2434775da412c0826e47a7b481110c417d`.

Two-point patterns are credited to **Jay Bonner**. Topkapi's implementation follows the polygons-in-contact algorithm described by **Craig S. Kaplan** in [Islamic Star Patterns from Polygons in Contact (2005)](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf), section 3: separated contact origins, greedy pairing by total length, and opposing collinear rays. This construction is implemented independently from the existing Taprats/Alhambra motif modes.

The 105 distinct catalog definitions were imported from its `tiling/tilings` directory. Individual tiling authors and descriptions remain embedded in the catalog and saved projects. Radial and irregular construction algorithms were adapted from the inspected Taprats/Alhambra implementations into TypeScript value-based geometry. The additional 92 original catalog definitions, 73 example projects and their thumbnail images were extracted from the supplied Taprats JAR. Example data retain their original layer geometry and face classifications. Native polygonal band joins, interlace cuts/shadows and emboss shading were adapted from the original style implementations. Native radial and irregular fixtures were generated from the unchanged supplied Taprats JAR (SHA-256 `0cc67879161621db76201adb8dc27262b49cd1ae5a10433195d517efa68d4148`).

The derived native engine and this rebuild's application source are distributed under the **GNU General Public License, version 2 or (at your option) any later version**. The complete license is in `public/licenses/Alhambra-GPL-2.0.txt`. The software is provided without warranty. Source is included in this repository; project/fixture data retain applicable upstream attribution.

The preserved classic route uses the original Taprats binary and CheerpJ runtime. Its runtime terms and dependency notices remain as described in `docs/CLASSIC-APP.md` and `public/licenses/`. Bundled Apache Batik, XML Graphics Commons, Commons IO and Commons Logging have their own license/notice files there. Other npm dependencies retain their respective package licenses; this notice does not relicense third-party dependencies.
