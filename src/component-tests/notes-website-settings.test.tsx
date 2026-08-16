import { fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { WebsiteSettingsPage } from '@/app/(main)/settings/websites/[websiteId]/WebsiteSettingsPage';
import { setConfig, setUser } from '@/store/app';
import { render, screen } from '@/test/render';
import { HttpResponse, http, server, setupMockServer } from './support/server';

/**
 * Reviewed component tests for US-201 (notes on website settings detail).
 *
 * Entry point (route-level page module): WebsiteSettingsPage
 *   route: /settings/websites/{websiteId}
 *
 * Contract (see docs/specifications/architecture-specification.md §Testability contract):
 *   - Notes form field:  data-test="input-notes" (multiline text field)
 *   - Save button:       data-test="button-submit" (existing)
 *   - Over-limit error:  "Notes must be 500 characters or less."
 *
 * Assertions are DOM-only (role / data-test / visible text). They intentionally
 * do NOT depend on child-component structure or props. The tests fail today
 * because the notes field is not yet implemented.
 */

setupMockServer();

const WEBSITE_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '41e2b680-648e-4b09-bcd7-3e2b10c06264';
const NOTES_TOO_LONG = 'Notes must be 500 characters or less.';

function mockWebsite(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get('*/api/websites/:websiteId', () =>
      HttpResponse.json({
        id: WEBSITE_ID,
        name: 'Production Site',
        domain: 'prod.example',
        teamId: null,
        userId: OWNER_ID,
        shareId: null,
        replayConfig: null,
        notes: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        ...overrides,
      }),
    ),
    http.post('*/api/websites/:websiteId', () =>
      HttpResponse.json({ id: WEBSITE_ID, name: 'Production Site', shareId: null }),
    ),
  );
}

function getNotesTextbox(field: HTMLElement) {
  return within(field).getByRole('textbox') as HTMLTextAreaElement;
}

function renderPage() {
  return render(<WebsiteSettingsPage websiteId={WEBSITE_ID} />, {
    route: `/settings/websites/${WEBSITE_ID}`,
  });
}

beforeEach(() => {
  setUser({ id: OWNER_ID, role: 'admin', username: 'admin' });
  setConfig({ cloudMode: false });
});

describe('US-201 website settings notes (route: /settings/websites/{websiteId})', () => {
  test('C-1 (FR-1/AC-1): renders an editable notes field that accepts input', async () => {
    mockWebsite();
    renderPage();

    const field = await screen.findByTestId('input-notes');
    const textbox = getNotesTextbox(field);

    fireEvent.change(textbox, { target: { value: 'Staging environment for team X' } });

    expect(textbox).toHaveValue('Staging environment for team X');
    expect(await screen.findByTestId('button-submit')).toBeEnabled();
  });

  test('C-2 (FR-2/AC-2): shows the persisted notes value returned by the server', async () => {
    mockWebsite({ notes: 'Requested by marketing / production' });
    renderPage();

    const field = await screen.findByTestId('input-notes');

    expect(getNotesTextbox(field)).toHaveValue('Requested by marketing / production');
  });

  test('C-3 (FR-3/AC-5): a notes value at the 500-character limit shows no length error', async () => {
    mockWebsite();
    renderPage();

    const field = await screen.findByTestId('input-notes');
    fireEvent.change(getNotesTextbox(field), { target: { value: 'a'.repeat(500) } });
    fireEvent.click(await screen.findByTestId('button-submit'));

    expect(screen.queryByText(NOTES_TOO_LONG)).not.toBeInTheDocument();
  });

  test('C-4 (FR-3/NFR-2/AC-6): a notes value over 500 characters shows the length error', async () => {
    mockWebsite();
    renderPage();

    const field = await screen.findByTestId('input-notes');
    fireEvent.change(getNotesTextbox(field), { target: { value: 'a'.repeat(501) } });
    fireEvent.click(await screen.findByTestId('button-submit'));

    expect(await screen.findByText(NOTES_TOO_LONG)).toBeInTheDocument();
  });

  test('C-5 (FR-7/AC-9): notes can be cleared to empty without a validation error', async () => {
    mockWebsite({ notes: 'Temporary note' });
    renderPage();

    const field = await screen.findByTestId('input-notes');
    const textbox = getNotesTextbox(field);
    fireEvent.change(textbox, { target: { value: '' } });
    fireEvent.click(await screen.findByTestId('button-submit'));

    expect(textbox).toHaveValue('');
    expect(screen.queryByText(NOTES_TOO_LONG)).not.toBeInTheDocument();
  });

  test('C-6 (FR-6/AC-8): a legacy website without notes renders an empty notes field', async () => {
    mockWebsite({ notes: undefined });
    renderPage();

    const field = await screen.findByTestId('input-notes');

    expect(getNotesTextbox(field)).toHaveValue('');
  });

  test('C-7 (FR-5/AC-7): a user without update permission sees the notes field read-only', async () => {
    setUser({ id: 'someone-else', role: 'view-only', username: 'viewer' });
    mockWebsite({ notes: 'Read only note', userId: OWNER_ID });
    renderPage();

    const field = await screen.findByTestId('input-notes');

    expect(getNotesTextbox(field)).toHaveAttribute('readonly');
  });
});
