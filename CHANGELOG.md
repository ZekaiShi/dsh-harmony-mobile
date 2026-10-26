# Changelog

## 0.9.1 — navigation and activity fixes

- Let the system fit content around its bars, match bar colours to the page, and explicitly preserve the Navigation/NavDestination safe area on foreground return.
- Use the same compact native three-choice export menu in chat, Desktop and image records.
- Default consecutive reasoning/tool/Agent calls to one disclosure, including unknown tools; keep normal answers directly visible.
- Match both legacy nested and first-class tool results across steps, parse JSON-string tool arguments, retain completion/error states and stop history refresh from moving the page while reading details.

## 0.9.0 — development preview

- Use one theme canvas behind native navigation and transparent system bars; remove full-header material strips while retaining native circular button materials.
- Add reply/transcript copy and local Markdown, segmented PNG and paginated raster PDF exports. PDF creation does not depend on optional PDFKit runtime support.
- Normalize chat/Responses/Claude/Gemini usage snapshots with cache/reasoning detail; keep estimates distinct from service reports and account for title requests/regeneration.
- Name new conversations once after the first complete reply, with an opt-out, bounded title input and preservation of manual/migrated titles.
- Add a separately installable DSH sender plugin using the official human-command registry and existing Desktop bridge. No new server, model request or credential store.
- Add isolated QA bundle tooling and synthetic export/usage/title/bridge validation; do not modify production user history in automated tests.

## 0.8.6 — imported baseline

- Native HarmonyOS chat, image studio and DSH Desktop pairing client.
- Bounded stream/Markdown handling and public-HTTP pairing restrictions.
- Clean-source import excludes signing, runtime caches, reports and user data.

This repository starts from an existing implementation. Import history is not presented as the original development history.
