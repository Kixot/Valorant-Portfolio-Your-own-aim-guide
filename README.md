# Kixot

Static HTML, CSS and JavaScript. No build step or server-side code.

- `index.html`: existing hero, portfolio and Dojo/VOD previews.
- `dojo.html`: mode chooser, quick start, plan builder, range sensitivity and local progress.
- `vod.html`: YouTube/local review, estimated round links, custom points, mistake tags and local saves.
- `css/`, `js/`, `assets/`: styles, behavior and existing site assets.
- `training.html` and `pages/training.html`: compatibility redirects to the Dojo.

Serve this folder with any static web server. Deploy the folder contents together so the entry points and assets keep their relative paths. Canonical pages are listed in `sitemap.xml`; compatibility redirects are excluded.

Sensitivity uses 0.07 degrees per raw mouse count per sens point for Valorant. The range requests unadjusted pointer-lock input where the browser supports it. Only sensitivity is shown, without converters or distance metrics. Quick 30 opens the selected range ready to adjust sensitivity, then Start begins the countdown. The completed survey opens a guided range. Escape pauses a drill; progress is hidden until the drill ends. Homepage quick start opens the same range.

Progress uses `kixot_drill_progress_v1` with a versioned JSON schema. Completed runs record date, mode, difficulty, DPI, sens, score and accuracy. Imports validate the complete file and merge unique run IDs. Invalid storage is preserved; unavailable or full storage keeps new results in memory for export. Clear requires confirmation. Exports are JSON, with no account or network storage.

The shared cursor stays a plus and becomes a dot over interactive controls. Pointer coordinates have no transition. Sliders keep the plus; text fields, dropdowns and video controls retain native cursors. Touch, coarse-pointer and reduced-motion users retain the native cursor. It mounts inside the active fullscreen element and returns on exit. Coding-style fonts remain outside the original hero; the folder menu uses the Apple system font stack with platform fallbacks.

The black folder and branched menu are vanilla adaptations of React Bits, with the source license in `THIRD_PARTY_NOTICES.md`. The folder label reads Kixot and the gap beneath it keeps the menu open while crossing into its branches.

VOD reviews are versioned browser saves, with JSON/text export, JSON import and plain-text sharing. Local files use object URLs and never upload. Round links are automatically generated time estimates, not gameplay detection; custom points remain available. The official YouTube API loads near the source controls and keeps a matching origin and an explicit referrer policy.

Analytics is default off and unconfigured. Add your measurement ID only at the marked line in `js/analytics.js`. The popup can be reopened from the footer. Follow [the GA4 setup instructions](docs/analytics.md) and [validation report](docs/validation.md).

Validation covers exact drill yaw, quick start, the plan builder, three modes, pause/resume, fullscreen, touch controls, mobile pixel ratio, hidden-tab pause, progress persistence, import/export, corruption/quota failures and layouts at 360, 390, 768 and 1440 pixels.

Run the dependency-free math checks with `node --test tests/sensitivity.test.cjs`.

Backups: `713f52e` is the original site; `b780288` is the prompt 1 state before the full Dojo work.
