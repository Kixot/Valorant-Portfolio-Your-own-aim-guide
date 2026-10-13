# Kixot

Plain HTML, CSS and JavaScript, with an optional private Node service for round analysis. No framework or build step.

- `index.html`: existing hero, portfolio and Dojo/VOD previews.
- `dojo.html`: mode chooser, quick start, plan builder, range sensitivity and local progress.
- `vod.html`: YouTube/local review, detected round boundaries, custom points, mistake tags and local saves.
- `css/`, `js/`, `assets/`: styles, behavior and existing site assets.
- `training.html` and `pages/training.html`: compatibility redirects to the Dojo.

Serve this folder with any static web server. Deploy the folder contents together so the entry points and assets keep their relative paths. Canonical pages are listed in `sitemap.xml`; compatibility redirects are excluded.

On Windows, double-click `Preview.cmd`. It opens the VOD page at a local web address, reusing this site's matching preview or starting one on a free port. It finds Node or the existing Codex bundled Node runtime; built-in PowerShell/.NET provides a static-only fallback. The listener is bound only to 127.0.0.1. Opening `vod.html` directly as `file://` cannot provide the HTTP referrer required by YouTube, so that mode shows launcher instructions instead of creating a broken iframe. Local files remain available in either mode and never upload.

Sensitivity uses 0.07 degrees per raw mouse count per sens point for Valorant. The range requests unadjusted pointer-lock input where the browser supports it. DPI and sensitivity are shown without converters or distance metrics; both persist locally. DPI records the actual mouse configuration and is not multiplied into already-raw movement counts. Unsupported raw input shows a warning. Quick 30 opens the selected range ready to adjust settings, then Start begins the countdown. The completed survey opens a guided range. Escape pauses a drill; progress is hidden until the drill ends. Homepage quick start opens the same range.

Progress uses `kixot_drill_progress_v1` with a versioned JSON schema. Completed runs record date, mode, difficulty, DPI, sens, score and accuracy. Imports validate the complete file and merge unique run IDs. Invalid storage is preserved; unavailable or full storage keeps new results in memory for export. Clear requires confirmation. Exports are JSON, with no account or network storage.

The shared cursor stays a plus and becomes a dot over interactive controls. Pointer coordinates have no transition. Sliders keep the plus; text fields, dropdowns and video controls retain native cursors. Touch, coarse-pointer and reduced-motion users retain the native cursor. It mounts inside the active fullscreen element and returns on exit. Coding-style fonts remain outside the original hero; the folder menu uses the Apple system font stack with platform fallbacks.

The black folder and branched menu are vanilla adaptations of React Bits, with the source license in `THIRD_PARTY_NOTICES.md`. The folder label reads Kixot in the Apple system font stack; the branches use Courier. The gap beneath the folder keeps the menu open while crossing into its branches.

VOD reviews are versioned browser saves, with JSON/text export, JSON import and plain-text sharing. Local playback uses object URLs. Analyze local video now defaults to an on-device HUD detector: no API key or upload is needed. It reads the visible Valorant timer and scores with lazy-loaded Tesseract.js, requiring observed buy-to-live timer resets and persistent score increments. It samples every two seconds and refines readable transitions to a 0.25-second window. Results are unconfirmed candidates: replays and delayed score updates require review. Standard HUD boxes can be adjusted for cropped footage. Missing WebM duration metadata is recovered without autoplay. Google AI remains an optional local-upload choice with confirmation, and is still used for public YouTube links. See [round-analysis setup](docs/round-analysis.md). The official YouTube playback API loads near the source controls and keeps a matching origin and an explicit referrer policy.

Vercel Analytics is installed with its vanilla JavaScript SDK, without React or a build step. There is no analytics popup. Enable Analytics in the Vercel project and redeploy to collect page views. Local previews do not send Vercel page views. Optional free GA4 success events remain unconfigured. See [analytics setup](docs/analytics.md).

Validation covers exact drill yaw, quick start, the plan builder, three modes, pause/resume, fullscreen, touch controls, mobile pixel ratio, hidden-tab pause, progress persistence, import/export, corruption/quota failures and layouts at 360, 390, 768 and 1440 pixels.

The on-device detector passed a real browser OCR check using a generated recording with irregular transitions and no network uploads. Real gameplay accuracy remains unverified. `tests/hud-browser.cjs` exercises this flow, and `tests/hud-analysis.test.cjs` covers unreadable HUDs, unfinished rounds and cancellation. Back to Dojo can leave a running drill after confirmation, without saving a partial result. Review edits reject times past the loaded video's duration.

Run the dependency-free math checks with `node --test tests/sensitivity.test.cjs`.

Backups: `713f52e` is the original site; `b780288` is the prompt 1 state before the full Dojo work.
