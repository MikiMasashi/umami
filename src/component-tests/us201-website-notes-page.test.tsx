import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@/test/render';

const notesFixtures = {
  withNotes: {
    id: 'website-with-notes',
    name: 'Website with notes',
    domain: 'with-notes.example.com',
    createdAt: '2026-08-20T00:00:00.000Z',
    notes: 'Production site for JP market',
  },
  withoutNotes: {
    id: 'website-without-notes',
    name: 'Website without notes',
    domain: 'without-notes.example.com',
    createdAt: '2026-08-20T00:00:00.000Z',
    notes: null,
  },
};

const messagesProxy = new Proxy(
  {},
  {
    get: (_, property: string | symbol) => String(property),
  },
) as Record<string, string>;

vi.mock('@/components/common/DataGrid', () => ({
  DataGrid: ({
    query,
    children,
  }: {
    query: { data: Record<string, unknown> };
    children: ReactNode | ((data: Record<string, unknown>) => ReactNode);
  }) => (typeof children === 'function' ? children(query.data) : children),
}));

vi.mock('@/app/(main)/websites/WebsiteProvider', () => ({
  WebsiteProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/app/(main)/websites/WebsiteAddButton', () => ({
  WebsiteAddButton: () => <button type="button">Add website</button>,
}));

vi.mock('@/index', () => ({
  Favicon: () => <span data-test="mock-favicon" />,
}));

vi.mock('@/app/(main)/websites/[websiteId]/settings/WebsiteTrackingCode', () => ({
  WebsiteTrackingCode: () => <div data-test="mock-tracking-code" />,
}));

vi.mock('@/app/(main)/websites/[websiteId]/settings/WebsiteReplaySettings', () => ({
  WebsiteReplaySettings: () => <div data-test="mock-replay-settings" />,
}));

vi.mock('@/app/(main)/websites/[websiteId]/settings/WebsiteShareForm', () => ({
  WebsiteShareForm: () => <div data-test="mock-share-form" />,
}));

vi.mock('@/app/(main)/websites/[websiteId]/settings/WebsiteData', () => ({
  WebsiteData: () => <div data-test="mock-website-data" />,
}));

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/components/hooks')>('@/components/hooks');

  return {
    ...actual,
    useMessages: () => ({
      t: (key: string) => key,
      labels: messagesProxy,
      messages: messagesProxy,
      getErrorMessage: () => undefined,
    }),
    useWebsite: () => ({
      id: 'website-with-notes',
      name: 'Website with notes',
      domain: 'with-notes.example.com',
      teamId: null,
      replayConfig: null,
    }),
    useUpdateQuery: () => ({
      mutateAsync: vi.fn(),
      error: undefined,
      touch: vi.fn(),
      toast: vi.fn(),
      isPending: false,
    }),
    useLoginQuery: () => ({
      user: { id: 'user-id', role: 'admin' },
      isLoading: false,
    }),
    useTeamMembersQuery: () => ({ data: { data: [] } }),
    useUserWebsitesQuery: () => ({
      data: {
        data: [notesFixtures.withNotes, notesFixtures.withoutNotes],
        count: 2,
        page: 1,
        pageSize: 20,
        orderBy: 'name',
        search: '',
      },
      isLoading: false,
      isFetching: false,
      error: null,
    }),
    useNavigation: () => ({
      router: { push: vi.fn() },
      pathname: '/websites',
      searchParams: new URLSearchParams(),
      query: {},
      teamId: undefined,
      websiteId: undefined,
      updateParams: () => '/websites',
      replaceParams: () => '/websites',
      renderUrl: (path: string) => path,
    }),
    useConfig: () => ({}),
  };
});

import settingsRoutePage from '@/app/(main)/websites/[websiteId]/settings/page';
import websitesRoutePage from '@/app/(main)/websites/page';

async function renderWebsiteSettingsRoute() {
  const ui = await settingsRoutePage({
    params: Promise.resolve({ websiteId: 'website-with-notes' }),
  });

  return render(ui, { route: '/websites/website-with-notes/settings' });
}

function renderWebsitesRoute() {
  const ui = websitesRoutePage();
  return render(ui, { route: '/websites' });
}

describe('US-201 component contract: website notes', () => {
  test('CT-201-01: settings route provides notes input field', async () => {
    await renderWebsiteSettingsRoute();

    const notesField = screen.getByTestId('input-notes');
    expect(notesField).toBeInTheDocument();
    expect(within(notesField).getByRole('textbox')).toBeInTheDocument();
  });

  test('CT-201-02: settings route shows over-limit validation message', async () => {
    const { user } = await renderWebsiteSettingsRoute();

    const notesTextbox = within(screen.getByTestId('input-notes')).getByRole('textbox');
    const overLimitNotes = 'x'.repeat(501);

    await user.type(notesTextbox, overLimitNotes);
    await user.click(screen.getByTestId('button-submit'));

    expect(screen.getByText('Notes must be 500 characters or less.')).toBeInTheDocument();
  });

  test('CT-201-03: websites route shows notes only when notes are set', () => {
    renderWebsitesRoute();

    expect(screen.getByText('Production site for JP market')).toBeInTheDocument();

    const withoutNotesRow = screen.getByRole('row', { name: /website without notes/i });
    expect(within(withoutNotesRow).queryByTestId('website-notes-preview')).not.toBeInTheDocument();
  });

  test('CT-201-04: websites route truncates long notes preview', () => {
    renderWebsitesRoute();

    expect(screen.getByText(/production site for jp market/i)).toBeInTheDocument();
    expect(screen.getByText(/\.\.\.$/)).toBeInTheDocument();
  });
});
