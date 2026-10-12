# Kixot

Static HTML, CSS and JavaScript. No build step or server-side code.

- `index.html`: existing hero, portfolio and Dojo/VOD previews.
- `dojo.html`: existing range, quick start, plan builder, sensitivity tools and local progress.
- `vod.html`: VOD reviewer placeholder for prompt 3.
- `css/`, `js/`, `assets/`: styles, behavior and existing site assets.
- `training.html` and `pages/training.html`: compatibility redirects to the Dojo.

Serve this folder with any static web server. Deploy the folder contents together so the entry points and assets keep their relative paths. Canonical pages are listed in `sitemap.xml`; compatibility redirects are excluded.

Sensitivity uses 0.07 degrees per raw mouse count per sens point for Valorant and 0.022 for the CS2 conversion. DPI affects eDPI and cm/360, not the drill's turning multiplier. At 800 DPI and 0.4 sens, the given formula produces 320 eDPI and 40.82142857 cm/360. The page displays this check. The drill requests unadjusted pointer-lock input where the browser supports it.

Progress uses `kixot_drill_progress_v1` with a versioned JSON schema. Completed runs record date, mode, difficulty, DPI, sens, score and accuracy. Imports validate the complete file and merge unique run IDs. Invalid storage is preserved; unavailable or full storage keeps new results in memory for export. Clear requires confirmation. Exports are JSON, with no account or network storage.

The shared target cursor reimplements the bracket animation in plain JavaScript, inspired by [React Bits Target Cursor](https://reactbits.dev/animations/target-cursor). Pointer coordinates have no transition. Hover brackets animate separately. Touch, coarse-pointer and reduced-motion users retain the native cursor. The cursor mounts inside the active fullscreen element and returns on exit.

Validation covers conversion round trips, exact drill yaw, quick start, the plan builder, three modes, pause/resume, fullscreen, touch controls, mobile pixel ratio, hidden-tab pause, progress persistence, import/export, corruption/quota failures and layouts at 360, 390, 768 and 1440 pixels.

Run the dependency-free math checks with `node --test tests/sensitivity.test.cjs`.

Backups: `713f52e` is the original site; `b780288` is the prompt 1 state before the full Dojo work.
