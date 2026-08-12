import { afterAll, afterEach, beforeAll } from 'vitest';
import { HttpResponse, http, server } from '@/test/msw/server';

// Shared MSW wiring for component tests. Not itself a test file (vitest only
// collects src/**/*.test.{ts,tsx}), just a helper imported by tests in this folder.
//
// The app builds request URLs via `getApiUrl()` (see src/lib/api-url.ts). In the
// jsdom test environment there is no real page origin, so relative fetches like
// `/api/websites/xyz` throw ("Failed to parse URL"). Setting `apiUrl` to an
// absolute origin makes the app issue absolute request URLs that both Node's
// fetch and MSW can handle.
export const API_ORIGIN = 'http://localhost/api';

export function setUpMockServer() {
  beforeAll(() => {
    process.env.apiUrl = API_ORIGIN;
    server.listen({ onUnhandledRequest: 'bypass' });
    // Registered once as a permanent baseline (not wiped by resetHandlers) so
    // effects from a previous, already-unmounted test that resolve late never
    // fall through to a real network call.
    server.use(...defaultAncillaryHandlers());
  });

  afterEach(() => {
    server.resetHandlers(...defaultAncillaryHandlers());
  });

  afterAll(() => {
    server.close();
    delete process.env.apiUrl;
  });
}

export function apiUrl(path: string) {
  return `${API_ORIGIN}${path}`;
}

// Default handlers for endpoints that are not the focus of a given test but are
// still called by the route-level page (config, shares, team list). Tests can
// override these per-case with `server.use(...)`.
export function defaultAncillaryHandlers() {
  return [
    // `/config` (and `/auth/*`) are deliberately excluded from the `apiUrl`
    // base-path substitution in src/lib/api-url.ts (they are Next.js app
    // routes, not the external API), so they are always requested as a
    // relative `/api/config` URL resolved against jsdom's default document
    // origin. Match with a wildcard origin so this keeps working regardless
    // of that origin.
    http.get('*/api/config', () =>
      HttpResponse.json({
        cloudMode: false,
        privateMode: false,
        telemetryDisabled: true,
        updatesDisabled: true,
      }),
    ),
    http.get(apiUrl('/websites/:websiteId/shares'), () =>
      HttpResponse.json({ data: [], count: 0, page: 1, pageSize: 10, orderBy: null, search: '' }),
    ),
    http.get(apiUrl('/users/:userId/teams'), () =>
      HttpResponse.json({ data: [], count: 0, page: 1, pageSize: 10, orderBy: null, search: '' }),
    ),
  ];
}

export { HttpResponse, http, server };
