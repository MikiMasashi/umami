import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { WebsitesSettingsPage } from '@/app/(main)/settings/websites/WebsitesSettingsPage';
import { render, screen, within } from '@/test/render';
import { setUser } from '@/store/app';
import { HttpResponse, apiUrl, http, server, setUpMockServer } from './support/msw';

// Component test for the route-level entry point of the websites list screen
// (Settings → Websites). See:
// - docs/specifications/architecture-specification.md (testability contract: routes,
//   data-test names, error copy)
// - docs/tests/component-test-design-US-201.md (scenario list, acceptance-criteria
//   traceability)
//
// Only DOM (role / data-test / visible text) is asserted; the internal breakdown of
// WebsitesDataTable / WebsitesTable into child components is intentionally not
// exercised here.

const LONG_NOTES = 'A'.repeat(120);

function websitesListResponse(data: Record<string, any>[]) {
  return {
    data,
    count: data.length,
    page: 1,
    pageSize: 10,
    orderBy: 'name',
    search: '',
  };
}

describe('WebsitesSettingsPage notes', () => {
  setUpMockServer();

  beforeEach(() => {
    setUser({ id: 'user-1', username: 'admin', role: 'admin', isAdmin: true });
  });

  afterAll(() => {
    setUser(null);
  });

  test('renders the notes summary for a website with notes', async () => {
    server.use(
      http.get(apiUrl('/users/:userId/websites'), () =>
        HttpResponse.json(
          websitesListResponse([
            {
              id: 'site-with-notes',
              name: 'Notes list site',
              domain: 'notes-list-site.com',
              createdAt: '2024-01-01T00:00:00.000Z',
              notes: 'Client demo environment.',
              shareId: null,
            },
          ]),
        ),
      ),
    );

    render(<WebsitesSettingsPage teamId={undefined as unknown as string} />, {
      route: '/settings/websites',
    });

    const row = await screen.findByRole('row', { name: /Notes list site/i });

    expect(within(row).getByTestId('text-notes')).toHaveTextContent(
      'Client demo environment.',
    );
  });

  test('truncates a long notes value to 60 characters with an ellipsis', async () => {
    server.use(
      http.get(apiUrl('/users/:userId/websites'), () =>
        HttpResponse.json(
          websitesListResponse([
            {
              id: 'site-with-long-notes',
              name: 'Long notes site',
              domain: 'long-notes-site.com',
              createdAt: '2024-01-01T00:00:00.000Z',
              notes: LONG_NOTES,
              shareId: null,
            },
          ]),
        ),
      ),
    );

    render(<WebsitesSettingsPage teamId={undefined as unknown as string} />, {
      route: '/settings/websites',
    });

    const row = await screen.findByRole('row', { name: /Long notes site/i });
    const notesCell = within(row).getByTestId('text-notes');
    const expectedSummary = `${LONG_NOTES.slice(0, 60)}…`;

    expect(notesCell).toHaveTextContent(expectedSummary);
    expect(notesCell.textContent).not.toBe(LONG_NOTES);
  });

  test('does not render any notes text for a website without notes', async () => {
    server.use(
      http.get(apiUrl('/users/:userId/websites'), () =>
        HttpResponse.json(
          websitesListResponse([
            {
              id: 'site-without-notes',
              name: 'No notes site',
              domain: 'no-notes-site.com',
              createdAt: '2024-01-01T00:00:00.000Z',
              notes: null,
              shareId: null,
            },
          ]),
        ),
      ),
    );

    render(<WebsitesSettingsPage teamId={undefined as unknown as string} />, {
      route: '/settings/websites',
    });

    const row = await screen.findByRole('row', { name: /No notes site/i });

    expect(within(row).queryByTestId('text-notes')).not.toBeInTheDocument();
  });
});
