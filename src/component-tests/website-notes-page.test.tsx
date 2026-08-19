import { expect, test, vi } from 'vitest';
import WebsiteEditPage from '@/app/(main)/settings/websites/[websiteId]/page';
import WebsitesListPage from '@/app/(main)/settings/websites/page';
import { render, screen } from '@/test/render';

const testState = vi.hoisted(() => ({
  website: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'US-201 Website',
    domain: 'us201.example',
    notes: 'Production storefront. Owner: Growth team.',
    teamId: null,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    replayConfig: null,
    recorderEnabled: false,
  },
  blankWebsite: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'US-201 Blank Website',
    domain: 'blank.example',
    notes: null,
    teamId: null,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  },
  mutateAsync: vi.fn(),
  touch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/components/hooks/queries/useWebsiteQuery', () => ({
  useWebsiteQuery: () => ({
    data: testState.website,
    isFetching: false,
    isLoading: false,
  }),
}));

vi.mock('@/components/hooks/useConfig', () => ({
  useConfig: () => ({ cloudMode: false, trackerScriptName: 'script.js' }),
}));

vi.mock('@/components/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/hooks')>();

  return {
    ...actual,
    useLoginQuery: () => ({
      user: { id: 'user-1', username: 'admin', role: 'admin', teams: [] },
      isLoading: false,
      isFetching: false,
    }),
    useUserWebsitesQuery: () => ({
      data: {
        data: [testState.website, testState.blankWebsite],
        count: 2,
        page: 1,
        pageSize: 10,
      },
      error: null,
      isLoading: false,
      isFetching: false,
    }),
    useWebsiteSharesQuery: () => ({
      data: { data: [], count: 0, page: 1, pageSize: 10 },
      error: null,
      isLoading: false,
      isFetching: false,
    }),
    useUserTeamsQuery: () => ({
      data: { data: [] },
      error: null,
      isLoading: false,
      isFetching: false,
    }),
    useSubscription: () => ({
      isPro: false,
      isBusiness: false,
      isNoBilling: false,
      hasSubscription: false,
      unlimitedWebsites: false,
      cloudMode: false,
      hasFeature: () => true,
    }),
    useConfig: () => ({ cloudMode: false, trackerScriptName: 'script.js' }),
    useUpdateQuery: () => ({
      mutateAsync: testState.mutateAsync,
      error: null,
      touch: testState.touch,
      toast: testState.toast,
      isPending: false,
    }),
  };
});

test('US-201 edit page exposes the Notes field with the saved value and 500 character contract', async () => {
  const page = await WebsiteEditPage({
    params: Promise.resolve({ websiteId: testState.website.id }),
  });

  render(page, { route: `/settings/websites/${testState.website.id}` });

  const notesField = await screen.findByTestId('input-notes');
  const textarea = notesField.querySelector('textarea');

  expect(screen.getByLabelText('Notes')).toBe(textarea);
  expect(textarea).toHaveValue(testState.website.notes);
  expect(textarea).toHaveAttribute('name', 'notes');
  expect(textarea).toHaveAttribute('maxlength', '500');
  expect(screen.queryByText('Notes must be 500 characters or fewer.')).not.toBeInTheDocument();
});

test('US-201 websites list page renders note summaries only for websites with notes', async () => {
  const page = await WebsitesListPage({
    params: Promise.resolve({ teamId: undefined }),
  });

  render(page, { route: '/settings/websites' });

  expect(
    await screen.findByTestId(`website-note-summary-${testState.website.id}`),
  ).toHaveTextContent(testState.website.notes);
  expect(
    screen.queryByTestId(`website-note-summary-${testState.blankWebsite.id}`),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('No notes')).not.toBeInTheDocument();
});
