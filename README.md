# Kixot

Plain HTML, CSS and JavaScript, with an optional private Node service for round analysis. No framework or build step.

- `index.html`: existing hero, portfolio and Dojo/VOD previews.
- `dojo.html`: mode chooser, quick start, plan builder, range sensitivity and local progress.
- `vod.html`: YouTube/local review, detected round boundaries, custom points, mistake tags and local saves.
- `css/`, `js/`, `assets/`: styles, behavior and existing site assets.
- `training.html` and `pages/training.html`: compatibility redirects to the Dojo.

Serve the pages with any static web server. YouTube round analysis additionally needs the private Node API. Canonical pages are listed in `sitemap.xml`; compatibility redirects are excluded.

Search appearance uses crawlable PNG/ICO favicons, an Apple touch icon, social preview tags and JSON-LD for the creator and tools. On phones, opening the folder menu makes space above the page content. See [mobile and search validation](docs/search-mobile.md) for checks and Search Console steps after redeploying.

For Vercel, select the Other framework preset. `vercel.json` leaves the build command empty and gives the analysis function up to 60 seconds per request. `.vercelignore` uploads the website and required API modules while excluding local secrets, test artifacts, documentation and preview tooling. Protected routes block direct access to server source and development files. No build step or new framework was added. The hosted deployment has not been exercised by the local checks.

Set `GEMINI_API_KEY`, `GEMINI_FREE_TIER_ONLY=true` and `ANALYSIS_ALLOWED_ORIGINS=https://www.kixotgg.com,https://kixotgg.com` in the host's private environment settings. Use a billing-disabled Google project. Never upload `.env` or put its key in frontend files. The existing local `.env` is preserved. After deploying, check `/api/analyze-rounds` for configuration status, play a public YouTube video and verify a completed drill in GA4 Realtime. Check the platform's free usage limits.

Local recordings use on-device analysis on Vercel. Google video uploads are disabled there because Vercel limits request bodies to 4.5 MB. Google upload remains available on the local or a suitable streaming Node host. Public YouTube analysis remains subject to Google's quota and availability. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

On Windows, double-click `Preview.cmd`. It opens the VOD page at a local web address, reusing this site's matching preview or starting one on a free port. It finds Node or the existing Codex bundled Node runtime; built-in PowerShell/.NET provides a static-only fallback. The listener is bound only to 127.0.0.1. Opening `vod.html` directly as `file://` cannot provide the HTTP referrer required by YouTube, so that mode shows launcher instructions instead of creating a broken iframe. Local playback and on-device analysis stay on the visitor's device. Google upload requires an explicit choice and confirmation on supported hosts.

Sensitivity uses 0.07 degrees per raw mouse count per sens point for Valorant. The range requests unadjusted pointer-lock input where the browser supports it. DPI and sensitivity are shown without converters or distance metrics; both persist locally. DPI records the actual mouse configuration and is not multiplied into already-raw movement counts. Unsupported raw input shows a warning. Quick 30 opens the selected range ready to adjust settings, then Start begins the countdown. The completed survey opens a guided range. Escape pauses a drill; progress is hidden until the drill ends. Homepage quick start opens the same range.

Progress uses `kixot_drill_progress_v1` with a versioned JSON schema. Completed runs record date, mode, difficulty, DPI, sens, score and accuracy. Imports validate the complete file and merge unique run IDs. Invalid storage is preserved; unavailable or full storage keeps new results in memory for export. Clear requires confirmation. Exports are JSON, with no account or network storage.

The shared cursor stays a plus and becomes a dot over interactive controls. Pointer coordinates have no transition. Sliders keep the plus; text fields, dropdowns and video controls retain native cursors. Touch, coarse-pointer and reduced-motion users retain the native cursor. It mounts inside the active fullscreen element and returns on exit. Coding-style fonts remain outside the original hero; the folder menu uses the Apple system font stack with platform fallbacks.

The black folder and branched menu are vanilla adaptations of React Bits, with the source license in `THIRD_PARTY_NOTICES.md`. The folder label reads Kixot in the Apple system font stack; the branches use Courier. The gap beneath the folder keeps the menu open while crossing into its branches.

VOD reviews are versioned browser saves, with JSON/text export, JSON import and plain-text sharing. Local playback uses object URLs. Analyze local video now defaults to an on-device HUD detector: no API key or upload is needed. It reads the visible Valorant timer and scores with lazy-loaded Tesseract.js, requiring observed buy-to-live timer resets and persistent score increments. It samples every two seconds and refines readable transitions to a 0.25-second window. Results are unconfirmed candidates: replays and delayed score updates require review. Standard HUD boxes can be adjusted for cropped footage. Missing WebM duration metadata is recovered without autoplay. Google AI remains an optional local-upload choice with confirmation, and is still used for public YouTube links. See [round-analysis setup](docs/round-analysis.md). The official YouTube playback API loads near the source controls and keeps a matching origin and an explicit referrer policy.

Vercel Analytics uses its bundled vanilla JavaScript SDK, without React or a build step. There is no analytics popup. Enable Analytics in the Vercel project and redeploy to collect page views. Local previews do not send Vercel page views. GA4 uses the owner's supplied `G-YKWM2XBXYY` ID. Browser tests intercept analytics so synthetic visits do not reach Google. The owner reports Search Console is already verified. Live collection still needs confirmation after publication. See [analytics setup](docs/analytics.md).

Validation covers exact drill yaw, quick start, the plan builder, three modes, pause/resume, fullscreen, touch controls, mobile pixel ratio, hidden-tab pause, progress persistence, import/export, corruption/quota failures and layouts at 360, 390, 768 and 1440 pixels.

The on-device detector passed a real browser OCR check using a generated recording with irregular transitions and no network uploads. Real gameplay accuracy remains unverified. `tests/hud-browser.cjs` exercises this flow, and `tests/hud-analysis.test.cjs` covers unreadable HUDs, unfinished rounds and cancellation. Back to Dojo can leave a running drill after confirmation, without saving a partial result. Review edits reject times past the loaded video's duration.

Run all dependency-free checks with `node --test tests/*.test.cjs`. Browser tests require separately available Playwright and Chrome, without adding them to the website. Generated screenshots and reports go to ignored `.task-test-output/`, which can be removed after testing. Current results are in [the deployment audit](docs/site-audit.md).

Backups: `713f52e` is the original site; `b780288` is the prompt 1 state before the full Dojo work.
