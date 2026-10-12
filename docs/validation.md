# Validation

Checked locally on 2026-10-12, using Chrome and the in-app browser. No deployment was made. Backup commit before this work: `d571929`.

## YouTube

- `https://www.youtube.com/watch?v=M7lc1UVf-VE`: ready and actual playback passed in Chrome and the in-app browser. This is the same ID shown in the user's error 153 screenshot.
- `https://www.youtube.com/watch?v=aqz-KE-bpKQ`: ready and actual playback passed in Chrome.
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ`: returned 150, embedding restricted by the owner. The reviewer showed the appropriate friendly message.
- The user's selected `wX7SJF9xoCM` match restored and reached Video ready in the in-app browser.

The latest three Chrome embeds sent `Referer: http://127.0.0.1:4188/`, with `origin` matching the new local service preview. Earlier in-app testing used port 4174 successfully. The iframe referrer policy is set before navigation; the document explicitly uses strict-origin-when-cross-origin. Error 153 means missing client identification or referrer according to [YouTube's API reference](https://developers.google.com/youtube/iframe_api_reference). Direct file:// opening now shows the launcher instructions. A browser or hosting policy can still suppress identification; availability and embedding policies can change.

Raw results: [youtube-results.json](youtube-results.json). Screenshots: [desktop](screenshots/vod-desktop.png), [390px](screenshots/vod-390.png).

## Reviewer and controls

The deterministic browser checks use a fake IFrame API, isolated browser storage and a short local MP4. They cover strict invalid-link rejection without changing the active video; custom points; edit/delete/seek; all eight mistake types and text counts; HTML-looking notes rendered as text; saved review switching; reload restore; valid JSON merge and invalid import rejection; JSON download; clipboard failure/manual fallback; deletion cancel and confirmation; denied storage; storage quota failures; and friendly errors 2, 5, 100, 101, 150, 153.

The local MP4 decoded and played, started paused, used a blob URL, made no upload request, and had its old URL revoked when switching back to YouTube. A local file must be reselected after a new page load; browsers do not grant persistent access to it.

The user rejected fixed-spacing estimates, and that generator was removed. The user then authorized a backend and AI, restricted to free-tier usage. The new server sends a public YouTube link to Google's video analysis and returns observed live start/end pairs with confidence and evidence. Offline provider tests cover signed job polling, deduplication, quota stop, invalid source/duration rejection, malformed/overlapping outputs and expired jobs. Browser fixtures cover irregular start/end seeks, manual correction, confirmation, deletion, restored results, safe evidence text and source privacy. **Actual model accuracy remains untested: a private Gemini key has not been configured.** See [round-analysis setup](round-analysis.md). Custom points remain separate. Local files never upload.

Cursor checks cover an exact pointer position, plus-to-dot hover, native input/dropdown/video controls, no target brackets, disabled sliders' hover handling, reduced-motion/touch native cursors and fullscreen mounting. The black folder label reads Kixot and uses the Apple system-font stack with platform fallbacks; its branches use Courier. There are no floating white pills. Moving down across the folder/menu gap keeps the menu open. Escape closes it. Collapsed branches become inert.

Every main page fits 360, 390, 768 and 1440px without document overflow. YouTube's frame has a minimum 200px height. Rendering pauses with a hidden tab; existing phone pixel-ratio caps remain.

## Dojo and analytics

A complete 30-second touch-mode drill passed, including ESC pause/resume. Mode choice remains locked through countdown, exercise and pause. No automatic mode timer remains. Progress is hidden during the exercise and restored after completion. Fullscreen keeps the plus/dot cursor visible in the active range.

DPI is restored next to in-game sensitivity. Both settings persist locally and are locked during a drill. DPI records the real mouse hardware setting; it is not multiplied again into already-raw movement counts. The original exact 0.07 yaw remains. Browsers without unadjusted input show a warning; their physical sensitivity match cannot be guaranteed by the browser's movement units.

The reported remaining YouTube failure occurred when opening vod.html directly as file://. That case now shows Preview.cmd instructions and sends no YouTube API/embed requests. The one-click Windows launcher serves the same files over loopback HTTP. Node adds the optional analysis endpoint; the built-in Windows static-only fallback needs no extra runtime. A direct-file browser check passed without JavaScript errors.

Analytics checks use a mocked tag with an isolated fake measurement ID. No real GA data was sent. Checks cover no tag before consent, no tag with the production empty ID after acceptance, a single page view, sanitized parameters, declined-event suppression, reacceptance without duplicates, blocked gtag, and one Dojo open/start/completion event each. The ID in production remains empty. Setup instructions: [analytics.md](analytics.md).

No site JavaScript page errors were captured. HTML/CSS/JS scans found no em dashes, H1 elements, box-shadow, text-shadow or drop-shadow declarations. All local HTML asset paths resolve. No framework or build step was added.

## Files

- Updated `index.html`, `dojo.html`, `vod.html`: shared navigation/analytics, Dojo preview copy, full reviewer.
- Updated `js/shared.js`, `js/home.js`, `js/training.js`: plus/dot cursor, active navigation, full-run mode guards and successful drill events.
- Updated `css/shared.css`: cursor and analytics popup.
- Added `js/vod-core.js`, `js/vod.js`, `css/vod.css`: parsing, review data, player adapters and reviewer layout.
- Added `js/analytics.js`, `js/navigation.js`, `css/navigation.css`: consent-gated analytics and vanilla folder/branched navigation.
- Added `server/round-analysis.cjs`, `server/preview.cjs`, `api/analyze-rounds.js`, `js/round-analysis-client.js`, `.env.example`, `Preview.cmd` and `tools/preview.ps1`: private Gemini jobs and a local web preview. Updated `.gitignore` to exclude secrets.
- Added tests and documentation, including screenshots and React Bits license attribution.

## Repeating checks

Run `node --test tests/sensitivity.test.cjs tests/vod.test.cjs tests/static.test.cjs tests/round-analysis.test.cjs` for the dependency-free checks. Browser checks require Playwright available outside the site and a running local preview. No package installation is required by the production service; it uses Node 22+ built-ins. Set `SITE_TEST_URL` for the preview URL, `CHROME_PATH` for your Chrome executable and `SITE_TEST_VIDEO` to a short local MP4, then run `node tests/site-browser.cjs`, `node tests/dojo-browser.cjs`, `node tests/analysis-browser.cjs`, `node tests/youtube-browser.cjs`. The local-file check used Mozilla's public CC0 flower.mp4 sample. AI service tests use offline fixtures, not real model responses. Network-dependent video outcomes may change.
