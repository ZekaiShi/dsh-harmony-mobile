# Third-party notices

DSH Connect is an independent community companion. Dataelem / DeepSeek do not endorse this application by virtue of protocol compatibility.

Compatibility verification downloads files from `dataelement/dsh-desktop`, pinned at commit `67df6719fb1895139cd1ac595b2367b5642be67c`, under its MIT license. Original license is retained at `.research/upstream/LICENSE` after `npm run upstream:prepare`. Files are unchanged at the source layer; TypeScript is transpiled into ignored verification artifacts. They are not bundled into the native HAP.

Development-only tools: TypeScript (Apache-2.0), Playwright (Apache-2.0), qrcode (MIT), ws (MIT); see their packages for full licenses. Their transitive licenses remain applicable.

Huawei Scan Kit and HarmonyOS SDK are platform dependencies acquired through Huawei's official tooling and terms. They are not redistributed here.

Since 0.3.2, generic UI icons reference Huawei's official `sys.symbol` resources via SymbolGlyph / SymbolSpan. The operating system supplies the glyphs; no HarmonyOS Symbol font or full website asset pack is redistributed or relicensed under this project's MIT license. See `docs/ICONS.md` for the resource mapping and official documentation links.

The GitHub activity outline is adapted from Feather Icons (MIT), Copyright (c) 2013-2023 Cole Bemis. Its license is included in the native HAP and source at `entry/src/main/resources/rawfile/feather-MIT.txt`. GitHub remains a trademark of its owner; this icon identifies actual GitHub tool calls.
