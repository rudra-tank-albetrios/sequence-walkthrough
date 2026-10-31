// Who a test's browser is. The tour starts by itself for a first-time visitor, which is right for
// real people and wrong for a test about something else, because its modal card would cover the
// page. So both Playwright configs start every test as a returning visitor: a real state, with the
// same key and value the app writes when a tour has run (tour.spec.ts proves they match). The app
// has no test switch, and tour.spec.ts opens the page as a first-time visitor to prove the behaviour.

/** What a browser holds once its tour has run. */
export const TOUR_SEEN = { name: 'swv:tour:seen', value: 'true' };

/** A browser that has had its tour on this site. */
export function returningVisitor(baseUrl: string) {
  return {
    cookies: [],
    origins: [{ origin: new URL(baseUrl).origin, localStorage: [TOUR_SEEN] }],
  };
}

/** A browser that has never been here. */
export const firstTimeVisitor = { cookies: [], origins: [] };
