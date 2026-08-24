import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { WebsiteSettingsPage } from '@/app/(main)/settings/websites/[websiteId]/WebsiteSettingsPage';
import { render, screen, waitFor, within } from '@/test/render';
import { setUser } from '@/store/app';
import {
  HttpResponse,
  apiUrl,
  http,
  server,
  setUpMockServer,
} from './support/msw';

// Component test for the route-level entry point of the website "settings detail"
// screen (Settings → Websites → edit screen). See:
// - docs/specifications/architecture-specification.md (testability contract: routes,
//   data-test names, error copy)
// - docs/tests/component-test-design-US-201.md (scenario list, acceptance-criteria
//   traceability)
//
// Only DOM (role / data-test / visible text) is asserted; the internal breakdown of
// WebsiteEditForm / WebsiteSettings into child components is intentionally not
// exercised here.

const WEBSITE_ID = '11111111-1111-1111-1111-111111111111';
const NOTES_TOO_LONG_MESSAGE = 'Notes must be 500 characters or less.';

const baseWebsite = {
  id: WEBSITE_ID,
  name: 'Test Website',
  domain: 'test-website.com',
  resetAt: null,
  userId: 'user-1',
  teamId: null,
  createdBy: 'user-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
  recorderEnabled: false,
  replayConfig: null,
  shareId: null,
  canUpdate: true,
};

function mockWebsiteGet(overrides: Record<string, any> = {}) {
  server.use(
    http.get(apiUrl('/websites/:websiteId'), () =>
      HttpResponse.json({ ...baseWebsite, ...overrides }),
    ),
  );
}

describe('WebsiteSettingsPage notes', () => {
  setUpMockServer();

  beforeEach(() => {
    setUser({ id: 'user-1', username: 'admin', role: 'admin', isAdmin: true });
  });

  afterAll(() => {
    setUser(null);
  });

  test('renders the existing notes value in the notes field', async () => {
    mockWebsiteGet({ notes: 'Staging site for the marketing team.' });

    render(<WebsiteSettingsPage websiteId={WEBSITE_ID} />, {
      route: `/settings/websites/${WEBSITE_ID}`,
    });

    const notesField = await screen.findByTestId('input-notes');

    expect(within(notesField).getByRole('textbox')).toHaveValue(
      'Staging site for the marketing team.',
    );
  });

  test('renders an empty notes field for a website without notes', async () => {
    mockWebsiteGet({ notes: null });

    render(<WebsiteSettingsPage websiteId={WEBSITE_ID} />, {
      route: `/settings/websites/${WEBSITE_ID}`,
    });

    const notesField = await screen.findByTestId('input-notes');

    expect(within(notesField).getByRole('textbox')).toHaveValue('');
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  test('saves notes and shows a success message', async () => {
    mockWebsiteGet({ notes: null });

    let submittedBody: any = null;

    server.use(
      http.post(apiUrl('/websites/:websiteId'), async ({ request }) => {
        submittedBody = await request.json();
        return HttpResponse.json({ ...baseWebsite, ...submittedBody });
      }),
    );

    const { user } = render(<WebsiteSettingsPage websiteId={WEBSITE_ID} />, {
      route: `/settings/websites/${WEBSITE_ID}`,
    });

    const notesField = await screen.findByTestId('input-notes');
    await user.type(within(notesField).getByRole('textbox'), 'Created for the Q3 campaign.');
    await user.click(screen.getByTestId('button-submit'));

    await waitFor(() => {
      expect(submittedBody).toMatchObject({ notes: 'Created for the Q3 campaign.' });
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  test('submits an empty notes value when the field is cleared', async () => {
    mockWebsiteGet({ notes: 'Will be cleared.' });

    let submittedBody: any = null;

    server.use(
      http.post(apiUrl('/websites/:websiteId'), async ({ request }) => {
        submittedBody = await request.json();
        return HttpResponse.json({ ...baseWebsite, ...submittedBody, notes: null });
      }),
    );

    const { user } = render(<WebsiteSettingsPage websiteId={WEBSITE_ID} />, {
      route: `/settings/websites/${WEBSITE_ID}`,
    });

    const notesField = await screen.findByTestId('input-notes');
    const textarea = within(notesField).getByRole('textbox');
    await user.clear(textarea);
    await user.click(screen.getByTestId('button-submit'));

    await waitFor(() => {
      expect(submittedBody).not.toBeNull();
    });
    expect(submittedBody.notes === '' || submittedBody.notes === null).toBe(true);
  });

  test('shows a validation message when notes exceeds 500 characters and does not submit', async () => {
    mockWebsiteGet({ notes: null });

    let requestWasSent = false;

    server.use(
      http.post(apiUrl('/websites/:websiteId'), async () => {
        requestWasSent = true;
        return HttpResponse.json(baseWebsite);
      }),
    );

    const { user } = render(<WebsiteSettingsPage websiteId={WEBSITE_ID} />, {
      route: `/settings/websites/${WEBSITE_ID}`,
    });

    const notesField = await screen.findByTestId('input-notes');
    await user.type(within(notesField).getByRole('textbox'), 'A'.repeat(501));
    await user.click(screen.getByTestId('button-submit'));

    expect(await screen.findByText(NOTES_TOO_LONG_MESSAGE)).toBeInTheDocument();
    expect(requestWasSent).toBe(false);
  });

  test('disables the notes field and hides the save button when the user cannot update the website', async () => {
    setUser({ id: 'viewer-1', username: 'viewer', role: 'user', isAdmin: false });
    mockWebsiteGet({ notes: 'Only owners and managers may edit this.', canUpdate: false });

    render(<WebsiteSettingsPage websiteId={WEBSITE_ID} />, {
      route: `/settings/websites/${WEBSITE_ID}`,
    });

    const notesField = await screen.findByTestId('input-notes');

    expect(within(notesField).getByRole('textbox')).toHaveValue(
      'Only owners and managers may edit this.',
    );
    expect(within(notesField).getByRole('textbox')).toBeDisabled();
    expect(screen.queryByTestId('button-submit')).not.toBeInTheDocument();
  });
});
