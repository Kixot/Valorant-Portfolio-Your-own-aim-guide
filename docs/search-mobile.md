# Search appearance and mobile navigation, 2026-10-19

The public site already returned working robots.txt, sitemap.xml and social preview tags. The sitemap lists the homepage, Dojo and VOD Review. All three remain crawlable with canonical URLs under https://www.kixotgg.com. The previous screenshot's search snippet describes an older version of the homepage; changing the code does not immediately change Google's cached result.

The previous favicon was SVG-only. Google documents PNG and ICO among its supported search favicon formats. The existing target emblem now has 96px and 192px PNG versions, a root favicon.ico with 16/32/48/96px frames, and a 180px Apple touch icon. These are actual image files, linked from every page and included in the Vercel upload allowlist. The original SVG footer emblem is unchanged.

The homepage includes WebSite and ProfilePage JSON-LD identifying Kixot as a Person, using the existing YouTube profile. Dojo and VOD Review use WebPage descriptions linked to the site and creator. No ratings, dates, achievements or follower counts were invented. Open Graph site name, locale, image type and Twitter image alternatives supplement the existing titles, descriptions and social image.

At phone and touch-tablet sizes, the folder lives in the page header and its expanded menu occupies space above the main content. It does not float across the player, inputs or drill settings. Links have 44px touch targets and matching branch geometry. Selecting an anchor closes the menu before measuring the destination, preserving the correct scroll position. Escape closes the menu and restores keyboard focus. The home and Dojo back buttons have separate positions. Desktop positioning and the original hero markup remain unchanged. The VOD frame also shrinks to its available width rather than being clipped by its old minimum height.

Validation: 37 dependency-free tests passed. Touch browser checks covered 320, 360, 390, 414 and 768px widths, 844px landscape, all three pages, Quick 30, the survey, outside-tap dismissal, keyboard dismissal, anchor scroll, live resizing and VOD field entry. The navigation audit also checked desktop at 1440px, local asset responses and page errors. Browser checks use Chromium phone emulation, not a physical iPhone. Google tags and the analysis endpoint were isolated to prevent test analytics and paid/provider requests. Screenshots are in ignored .task-test-output/.

After redeploying:

1. Check https://www.kixotgg.com/favicon.ico and https://www.kixotgg.com/assets/favicon-96.png. Both should return images without login or crawler restrictions.
2. In Search Console, inspect https://www.kixotgg.com/, choose Test live URL, then Request indexing. Inspect the Dojo and VOD URLs as well.
3. Under Sitemaps, submit sitemap.xml if it is not already submitted.
4. Check the homepage with Google's Rich Results Test. Structured data can improve understanding but does not guarantee a special search display.

Google may take several days to several weeks to recrawl the favicon and does not guarantee it will display. The icon URL should remain stable. No production deployment or Search Console submission was performed during this change.

References: [Google favicon guidance](https://developers.google.com/search/docs/appearance/favicon-in-search), [profile structured data](https://developers.google.com/search/docs/appearance/structured-data/profile-page).
