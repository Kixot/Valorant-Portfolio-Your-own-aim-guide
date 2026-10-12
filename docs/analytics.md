# Analytics setup

Vercel Analytics 2.0.1 is installed. This plain HTML site uses the package's vanilla inject function from assets/vendor/vercel-analytics.js. The Next.js Analytics component requires Next.js and is not applicable here. No framework or build step was added.

Open your Vercel dashboard, select the project, click Analytics, and click Enable. Redeploy the changed site and visit the deployed pages. Page views appear in that Analytics dashboard. This repository was not deployed by this change, so collection is not yet verified live. Local previews do not send Vercel requests. No popup or footer Analytics button is shown.

The free Hobby plan covers page views within its quota; Vercel custom events require Pro or Enterprise and are not enabled here. For free drill success events, the existing optional GA4 integration remains available with the empty ID below. See [Vercel setup](https://vercel.com/docs/analytics/quickstart) and [plan limits](https://vercel.com/docs/analytics/limits-and-pricing).

The bundled SDK and its MIT license are committed so static hosting needs no npm install or bundler. npm install updates the dependency; copy its dist/index.mjs to assets/vendor/vercel-analytics.js when intentionally upgrading. URLs are stripped of query strings and fragments before page-view collection.

## Paste the ID

1. In GA4, select your property, then **Admin > Data collection and modification > Data streams**.
2. Select your web stream. Copy its **Measurement ID**, beginning with `G-`.
3. Paste it in `js/analytics.js`, line 4, between the quotes in `const GA_MEASUREMENT_ID = '';`.
4. In that stream's settings, switch **Enhanced measurement off**. This prevents extra automatic form, link, video, scroll and history events. The site sends its own page view once per document. Google notes that history-based page views can still fire with `send_page_view: false` if Enhanced measurement remains enabled: [Google's page-view guide](https://developers.google.com/analytics/devguides/collection/ga4/views?technology=websites).
5. Publish the updated file through your normal hosting workflow. Open the site, visit The Dojo and complete a drill.
6. In GA4, click **Reports > Realtime** and inspect the event counts for `page_view`, `dojo_opened`, `drill_started` and `drill_completed`. Check the correct property and stream. Normal reports take time to process. Tracking is confirmed only after these events appear.

## Returning users

Click **Reports > Life cycle > Retention**, then select the **Returning users** card/tab and your date range. If Life cycle is absent, an Editor can open **Reports > Library**, publish the Life cycle collection and add Retention. See [Google's Retention instructions](https://support.google.com/analytics/answer/11004084?hl=en).

Returning-user measurements cover browsers that retain their GA cookies. Cookie deletion, blockers reduce coverage. No login identity is collected.

## Dojo completion funnel

1. Click **Explore > Funnel exploration**.
2. Under **Tab settings > Steps**, click the edit pencil.
3. Add a step named **Opened Dojo**, with `event_name` exactly matching `dojo_opened`.
4. Add **Started drill**, with `event_name` exactly matching `drill_started`.
5. Add **Completed drill**, with `event_name` exactly matching `drill_completed`.
6. Use **indirectly followed by** between steps, so other valid events can occur between them. Apply the steps. Keep the funnel closed to require entry at Opened Dojo; select your date range.

This measures users reaching each step, not a unique drill-by-drill session identifier. Opening the range alone does not count as starting. Pausing and resuming sends no duplicate start. Completion fires only when the exercise clock reaches zero. See [Google's funnel guide](https://support.google.com/analytics/answer/9327974?hl=en).

## Events and privacy

The site's custom event allowlist is `dojo_opened`, `drill_started`, `drill_completed`, `video_loaded`, `round_marked`, `mistake_tag_added`, `review_exported`. Custom parameters are restricted to allowed values for `drill_mode`, `difficulty`, `video_source`, `mistake_type`. `round_marked` records a successfully added custom point; detected rounds do not send analytics events.

Riot IDs, personal names, notes, file names and video links are not event parameters. Page locations omit queries and fragments; page referrers are empty. Sharing and exported reviews are local actions and may contain the user's own notes and source information. Separately, the user can send a selected recording to Google for round analysis. GA's standard session and first-visit bookkeeping is managed by GA itself if configured.

There is no analytics popup or footer control. Storage or analytics failures do not stop drills or reviews. Leave the GA4 ID empty if using only Vercel page-view analytics.
