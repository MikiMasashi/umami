import { beforeEach, describe, expect, test } from 'vitest';
import { WebsitesSettingsPage } from '@/app/(main)/settings/websites/WebsitesSettingsPage';
import { setConfig, setUser } from '@/store/app';
import { render, screen } from '@/test/render';
import { HttpResponse, http, server, setupMockServer } from './support/server';

/**
 * Reviewed component tests for US-201 (notes shown in the website list).
 *
 * Entry point (route-level page module): WebsitesSettingsPage
 *   route: /settings/websites
 *
 * Contract (see docs/specifications/architecture-specification.md §Testability contract):
 *   - Per-row notes cell: data-test="website-notes"
 *     Rendered ONLY for rows whose notes are non-empty; contains the notes text
 *     (which may be visually truncated for long values).
 *
 * Assertions are DOM-only. The tests fail today because the list does not yet
 * render a notes cell.
 */

setupMockServer();

const USER_ID = '41e2b680-648e-4b09-bcd7-3e2b10c06264';

function mockWebsites(data: Array<Record<string, unknown>>) {
  server.use(
    http.get('*/api/users/:userId/websites', () =>
      HttpResponse.json({
        data,
        count: data.length,
        page: 1,
        pageSize: 10,
        orderBy: 'name',
        search: '',
      }),
    ),
  );
}

function renderList() {
  return render(<WebsitesSettingsPage teamId={undefined as unknown as string} />, {
    route: '/settings/websites',
  });
}

beforeEach(() => {
  setUser({ id: USER_ID, role: 'admin', username: 'admin' });
  setConfig({ cloudMode: false });
});

describe('US-201 website list notes (route: /settings/websites)', () => {
  test('C-8 (FR-4/AC-3): a website with notes shows its notes text in the list', async () => {
    mockWebsites([
      {
        id: 'a',
        name: 'Site A',
        domain: 'a.com',
        notes: 'Production - do not touch',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    renderList();

    await screen.findByText('Site A');
    const notes = await screen.findByTestId('website-notes');

    expect(notes).toHaveTextContent('Production - do not touch');
  });

  test('C-9 (FR-4/FR-6/AC-4): a website without notes shows no notes cell', async () => {
    mockWebsites([
      {
        id: 'a',
        name: 'Site A',
        domain: 'a.com',
        notes: 'Production - do not touch',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        name: 'Site B',
        domain: 'b.com',
        notes: null,
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
    renderList();

    await screen.findByText('Site A');
    await screen.findByText('Site B');

    // Only the row that has notes renders a notes cell.
    expect(await screen.findAllByTestId('website-notes')).toHaveLength(1);
  });
});
