# Licensing and attribution

The native geometry constructions and catalog in `lib/engine/` are derived from **Taprats**, originally by Craig S. Kaplan, and **Alhambra**, with additional work by Pierre Baillargeon.

Alhambra source: https://github.com/pierrebai/Alhambra — revision `284d7d2434775da412c0826e47a7b481110c417d`.

The 105 distinct catalog definitions were imported from its `tiling/tilings` directory. Individual tiling authors and descriptions remain embedded in the catalog and saved projects. Radial and irregular construction algorithms were adapted from the inspected Taprats/Alhambra implementations into TypeScript value-based geometry. Native radial fixtures were generated from the unchanged supplied Taprats JAR (SHA-256 `0cc67879161621db76201adb8dc27262b49cd1ae5a10433195d517efa68d4148`).

The derived native engine and this rebuild's application source are distributed under the **GNU General Public License, version 2 or (at your option) any later version**. The complete license is in `public/licenses/Alhambra-GPL-2.0.txt`. The software is provided without warranty. Source is included in this repository; project/fixture data retain applicable upstream attribution.

The preserved classic route uses the original Taprats binary and CheerpJ runtime. Its runtime terms and dependency notices remain as described in `docs/CLASSIC-APP.md` and `public/licenses/`. Bundled Apache Batik, XML Graphics Commons, Commons IO and Commons Logging have their own license/notice files there. Other npm dependencies retain their respective package licenses; this notice does not relicense third-party dependencies.
