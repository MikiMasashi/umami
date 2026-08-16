import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Shared Mock Service Worker server for reviewed component tests (US-201).
 *
 * The handlers below are intentionally permissive: their only purpose is to let
 * the route-level page modules mount without crashing on unrelated network calls,
 * so that DOM-based assertions about the `notes` feature can run. Individual tests
 * override the endpoints they care about via `server.use(...)`.
 */

const emptyPaged = () =>
  HttpResponse.json({ data: [], count: 0, page: 1, pageSize: 10, orderBy: '', search: '' });

export const defaultHandlers = [
  http.post('*/api/auth/verify', () => HttpResponse.json({})),
  http.get('*/api/config', () =>
    HttpResponse.json({
      cloudMode: false,
      privateMode: false,
      telemetryDisabled: true,
      updatesDisabled: true,
      trackerScriptName: 'script.js',
    }),
  ),
  http.get('*/api/me/websites', emptyPaged),
  http.get('*/api/users/:userId/websites', emptyPaged),
  http.get('*/api/teams/:teamId/websites', emptyPaged),
  http.get('*/api/users/:userId/teams', emptyPaged),
  http.get('*/api/me/teams', emptyPaged),
  http.get('*/api/websites/:websiteId/shares', emptyPaged),
];

export const server = setupServer(...defaultHandlers);

export { HttpResponse, http };

/**
 * Registers the MSW lifecycle for a component-test file. Call once at module top level.
 */
export function setupMockServer() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
