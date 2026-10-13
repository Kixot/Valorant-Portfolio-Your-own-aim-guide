# Website audit, 2026-10-13

All 26 dependency-free checks passed. Site JavaScript passed syntax checks, all local HTML asset/page paths exist, and the source scan found no em dashes, H1 elements or shadow effects. The original hero source and styles were preserved.

Browser checks passed for homepage section links, Quick 30 navigation, survey mode preselection, keyboard menu operation, header spacing and no overflow at 360, 390, 768 and 1440 pixels. No script errors, missing local assets or failed requests occurred in that navigation audit. See `site-audit.json` and `screenshots/audit-home-*.png`.

The reviewer passed point/tag creation, seeking, edits, deletion, safe text rendering, reload restoration, video switching, export/import, manual sharing fallback, blocked storage and storage-quota handling. New edits beyond the loaded video's duration are rejected. Pointer-clicked buttons release focus so Space does not repeat an action; keyboard focus remains usable. Cursor checks covered tag fields, hover positioning, touch, reduced motion and fullscreen.

A full 30-second drill passed, including live DPI/sensitivity edits, mode locking, Escape pause/resume, completion recording, hidden progress during drills and success-only analytics. Back to Dojo now supports leaving an unfinished drill with confirmation and does not save a partial result. Returning to Quick 30 starts from a clean range.

Real Tesseract browser OCR scanned a generated WebM containing irregular timer/score transitions. It detected one start/end pair within 0.5 seconds of the generated signals, sought to those timestamps and made no POST/upload requests. It recovered missing WebM duration without autoplay. Cancellation, a blocked reader download and mobile crop settings passed. The last 12-second synthetic recording took 3.2 seconds to analyze including reader initialization. This is not a speed or accuracy guarantee for real gameplay. The page estimates remaining scan time after sampling begins. Replays, HUD crops and delayed scoreboard updates require reviewing the low-confidence candidates.

Real YouTube playback passed for `M7lc1UVf-VE` and `aqz-KE-bpKQ`. `dQw4w9WgXcQ` returned code 150 because embedding is disabled. Matching HTTP origins and referrers were observed; no error 153 appeared. These playback tests disabled analysis to avoid spending cloud quota. YouTube cloud analysis is still subject to Google's availability and quota; the independent on-device detector is for local recordings. Real full-match detection accuracy remains unverified.

Main production changes: `js/hud-analysis.js`, `js/hud-settings.js`, `js/vod.js`, `js/vod-core.js`, `js/shared.js`, `js/training.js`, `vod.html` and `css/vod.css`. Test recordings are generated, with no private user media used.
