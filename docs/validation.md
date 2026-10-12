# Validation

Checked locally on 2026-10-12, using Chrome and the in-app browser. No deployment was made. Backup commit before this work: `d571929`.

## YouTube

- `https://www.youtube.com/watch?v=M7lc1UVf-VE`: ready and actual playback passed in Chrome and the in-app browser. This is the same ID shown in the user's error 153 screenshot.
- `https://www.youtube.com/watch?v=aqz-KE-bpKQ`: ready and actual playback passed in Chrome.
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ`: returned 150, embedding restricted by the owner. The reviewer showed the appropriate friendly message.
- The user's selected `wX7SJF9xoCM` match restored and reached Video ready in the in-app browser.

All three Chrome embeds sent `Referer: http://127.0.0.1:4174/`, with `origin` matching the page. The iframe referrer policy is set before navigation; the document explicitly uses strict-origin-when-cross-origin. Error 153 means missing client identification or referrer according to [YouTube's API reference](https://developers.google.com/youtube/iframe_api_reference). A browser or hosting policy can still suppress it; the friendly message explains the browser/local-file alternative. Availability and embedding policies can change.

Raw results: [youtube-results.json](youtube-results.json). Screenshots: [desktop](screenshots/vod-desktop.png), [390px](screenshots/vod-390.png).

## Reviewer and controls

The deterministic browser checks use a fake IFrame API, isolated browser storage and a short local MP4. They cover strict invalid-link rejection without changing the active video; generated estimates and click-to-seek; custom points; edit/delete/seek; all eight mistake types and text counts; HTML-looking notes rendered as text; saved review switching; reload restore; valid JSON merge and invalid import rejection; JSON download; clipboard failure/manual fallback; deletion cancel and confirmation; denied storage; storage quota failures; and friendly errors 2, 5, 100, 101, 150, 153.

The local MP4 decoded and played, started paused, used a blob URL, made no upload request, and had its old URL revoked when switching back to YouTube. A local file must be reselected after a new page load; browsers do not grant persistent access to it.

Round starts are **time-based estimates**, automatically generated from duration, beginning at zero with 130-second spacing by default. First timestamp and spacing can be adjusted. These are not accurate gameplay detection; YouTube's IFrame API does not expose gameplay frames to this site. Intro screens, pauses, overtime and short rounds make estimates diverge. Custom points remain separate, editable, deletable and clickable. No AI, backend or video upload was added.

Cursor checks cover an exact pointer position, plus-to-dot hover, native input/dropdown/video controls, no target brackets, disabled sliders' hover handling, reduced-motion/touch native cursors and fullscreen mounting. The black folder label reads Kixot, uses the Apple system-font stack with platform fallbacks, and has no floating white pills. Moving down across the folder/menu gap keeps the menu open. Escape closes it. Collapsed branches become inert.

Every main page fits 360, 390, 768 and 1440px without document overflow. YouTube's frame has a minimum 200px height. Rendering pauses with a hidden tab; existing phone pixel-ratio caps remain.

## Dojo and analytics

A complete 30-second touch-mode drill passed, including ESC pause/resume. Mode choice remains locked through countdown, exercise and pause. No automatic mode timer remains. Progress is hidden during the exercise and restored after completion. Fullscreen keeps the plus/dot cursor visible in the active range.

Analytics checks use a mocked tag with an isolated fake measurement ID. No real GA data was sent. Checks cover no tag before consent, no tag with the production empty ID after acceptance, a single page view, sanitized parameters, declined-event suppression, reacceptance without duplicates, blocked gtag, and one Dojo open/start/completion event each. The ID in production remains empty. Setup instructions: [analytics.md](analytics.md).

No site JavaScript page errors were captured. HTML/CSS/JS scans found no em dashes, H1 elements, box-shadow, text-shadow or drop-shadow declarations. All local HTML asset paths resolve. No framework or build step was added.

## Files

- Updated `index.html`, `dojo.html`, `vod.html`: shared navigation/analytics, Dojo preview copy, full reviewer.
- Updated `js/shared.js`, `js/home.js`, `js/training.js`: plus/dot cursor, active navigation, full-run mode guards and successful drill events.
- Updated `css/shared.css`: cursor and analytics popup.
- Added `js/vod-core.js`, `js/vod.js`, `css/vod.css`: parsing, review data, player adapters and reviewer layout.
- Added `js/analytics.js`, `js/navigation.js`, `css/navigation.css`: consent-gated analytics and vanilla folder/branched navigation.
- Added tests and documentation, including screenshots and React Bits license attribution.

## Repeating checks

Run `node --test tests/sensitivity.test.cjs tests/vod.test.cjs tests/static.test.cjs` for the dependency-free checks. Browser checks require Playwright available outside the site and a running static preview server. No production dependency is needed. Set `SITE_TEST_URL` for a different preview URL, `CHROME_PATH` for your Chrome executable and `SITE_TEST_VIDEO` to a short local MP4, then run `node tests/site-browser.cjs`, `node tests/dojo-browser.cjs`, `node tests/youtube-browser.cjs`. The local-file check used Mozilla's public CC0 flower.mp4 sample. Network-dependent video outcomes may change.
