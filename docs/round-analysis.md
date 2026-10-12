# Round analysis setup

The fixed-interval round pattern was removed. The new service sends a public YouTube video link to Google's Gemini video analysis and requests observed start/end pairs from the HUD and live gameplay. It does not download YouTube video into this project. Local playback stays in the browser; the separate Analyze local video action uploads the selected recording to Google after confirmation. AI timestamps must be checked; precise detection quality has not yet been measured on real match videos because Google returned temporary high-demand errors during real testing.

The user authorized a backend and AI on 2026-10-12, restricted to free-tier usage. The browser remains plain HTML/CSS/JS. The service uses Node's built-in HTTP, fetch and crypto APIs with no package installation or build step.

## Private key

1. In [Google AI Studio](https://aistudio.google.com/apikey), create a Gemini API key for a project **with billing disabled**. Do not connect a billing account or upgrade it to a paid tier.
2. Copy `.env.example` to `.env` in the site folder, if `.env` does not already exist.
3. Put the key after `GEMINI_API_KEY=` in `.env`. Keep `GEMINI_FREE_TIER_ONLY=true`. This flag is your confirmation that the project has billing disabled. The service cannot infer a project's billing status from an API key.
4. Double-click `Preview.cmd`. Use the web address that it opens. It finds installed Node or the existing Codex bundled Node runtime; an ordinary static preview remains available if Node is absent. Node 22+ is required for the analysis service.
5. Load a public YouTube match no longer than two hours. Analysis starts automatically when the video is ready and the service is configured. The Analyze rounds button retries or resumes a saved job. Check the start/end links and confirm or edit each round.

Never paste the key into frontend JavaScript or chat. `.env` is ignored by Git and blocked by the local preview. The API returns configuration status without revealing the key. After editing the private file, run Preview.cmd again; it opens a fresh service when the setup timestamp changes.

Browser saves belong to their original web address. If moving from file:// or another preview port, export reviews there and import the JSON on the new preview page.

## Free-tier limits

The model is fixed to `gemini-3.8-flash`, which Google currently lists with a free tier. Public YouTube input is currently a preview feature and its pricing and limits may change: [pricing](https://ai.google.dev/gemini-api/docs/pricing), [video input](https://ai.google.dev/gemini-api/docs/video-understanding).

There are no paid model fallbacks, automatic quota retries, search tools or billing upgrades. A provider 429 stops the operation. Each service process allows at most six starts and six hours of declared video duration per UTC day, plus three starts per client and a minute between new starts. Duplicate concurrent starts for the same video reuse the job; completed results are cached briefly. These in-memory limits reset on process restart and are not a global quota across scaled servers. A **billing-disabled Google project** is the actual protection against charges. Google's provider quotas remain authoritative.

## What detection means

Google does not provide a fixed completion estimate. The reviewer displays elapsed time and polls accepted jobs every 15 seconds, slowing to 30 seconds if Google temporarily reports high demand or a connection timeout. These checks reuse the existing job, without resubmitting the video. Quota errors still stop immediately. After 25 minutes of waiting, the user can check the saved job again. A job that Google has actually failed cannot be recovered through polling.

Start is the beginning of the live round, when buy phase ends and barriers drop. End is the earliest visible round resolution, such as the last elimination, spike detonation/defuse or winner banner. Replays, desk segments, pauses, ads and halftime are excluded. Multiple maps are numbered chronologically. Incomplete or unobservable rounds should be omitted, rather than filled in using a regular pattern.

The service uses Google's agentic video processing to inspect the timeline and refine proposed boundaries. It returns evidence and high/medium/low confidence. All detections begin unconfirmed, including high-confidence results. The UI provides Start, End, Edit, Delete and Confirm. Manual corrections and custom points stay in browser saves and exports.

The schema rejects malformed, duplicate, overlapping and out-of-range model results. This validates data consistency; it does **not** prove visual accuracy. No claim of frame-exact detection is made. Real match validation is still required after key configuration.

## Local recordings and unlisted videos

Choose a playable recording, then click Analyze local video and confirm sending it to Google. Playback alone sends no file. Recordings must be at most two hours and smaller than 2 GB. The browser streams the selected file through the local service to Google's resumable Files API, without writing a server copy. Processing, observed boundary detection and saved points use the same reviewer. Files preparing at Google can be checked again without uploading them twice during the same browser session.

Google's YouTube URL integration currently supports public videos only, excluding unlisted and private videos. Use an original recording for an unlisted VOD. The site does not bypass YouTube access restrictions or download YouTube media. See [YouTube limitations](https://ai.google.dev/gemini-api/docs/video-understanding) and [Files API](https://ai.google.dev/gemini-api/docs/files).

The local Node preview supports the streamed upload. Hosting platforms can impose smaller request-body and function-duration limits, so large uploads need a streaming Node host; the existing serverless wrapper is not a guarantee of 2 GB upload support. Uploads also have process-local limits: six uploads, 4 GB total and three per client per UTC day, with a minute between uploads. Google enforces its own free-tier quotas.

## Hosting

For local use, `server/preview.cjs` serves the site and `/api/analyze-rounds` together. The default private key is only on the server.

For an existing Node-compatible host with serverless functions, `api/analyze-rounds.js` exports the request handler. Set `GEMINI_API_KEY` and `GEMINI_FREE_TIER_ONLY=true` in that host's private environment settings, using a billing-disabled Google project. No hosted deployment was created by this change. Check the host's own free plan before enabling it. Plain static hosting cannot execute this endpoint.

If the endpoint is hosted on a separate HTTPS origin, put its full URL in the marked config line of `js/round-analysis-client.js` and include the site's origin in the API's `ANALYSIS_ALLOWED_ORIGINS` environment variable. CORS only permits configured site origins and local previews. Keep the secret and the server files out of a public static download.

## Privacy and stopping

Only the video ID and declared duration are sent to the site API; Google receives the canonical public YouTube URL and analysis instructions. Review names, Riot IDs, local file names, mistake notes and review text are not included in request parameters. The public video itself can contain visible or spoken names. Local recordings upload only after the Analyze local video action and confirmation. Original filenames and review notes are not sent; Google receives the video bytes with a generic display name. Google retains Files API uploads temporarily under its Files API terms. Free-tier Google inputs can be used to improve its products under Google's terms. Background jobs are stored with Google for retrieval. The site's poll token is signed and expires after 30 minutes; it contains no API key.

Stop waiting stops browser polling. A job already submitted to Google can continue there, and Analyze rounds can resume checking it during the same browser session. There is no paid fallback. GA4 does not receive analysis links or new analysis events.
