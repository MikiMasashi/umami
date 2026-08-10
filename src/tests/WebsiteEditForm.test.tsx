import { beforeEach, expect, test, vi } from 'vitest';
import { WebsiteEditForm } from '@/app/(main)/websites/[websiteId]/settings/WebsiteEditForm';
import { render, screen, within } from '@/test/render';

const mutateAsyncMock = vi.fn().mockResolvedValue({});
const toastMock = vi.fn();
const touchMock = vi.fn();

vi.mock('@/components/hooks', () => ({
  useMessages: () => ({
    t: (key: string) => key,
    labels: {
      websiteId: 'websiteId',
      name: 'name',
      domain: 'domain',
      notes: 'notes',
      save: 'save',
      required: 'required',
    },
    messages: {
      saved: 'saved',
      invalidDomain: 'invalidDomain',
      notesTooLong: 'notesTooLong',
    },
    getErrorMessage: () => undefined,
  }),
  useUpdateQuery: () => ({
    mutateAsync: mutateAsyncMock,
    error: undefined,
    touch: touchMock,
    toast: toastMock,
  }),
  useWebsite: () => ({
    id: 'website-1',
    name: 'My Site',
    domain: 'example.com',
    notes: 'Existing note',
  }),
}));

function getNotesField() {
  return within(screen.getByTestId('input-notes')).getByRole('textbox');
}

beforeEach(() => {
  mutateAsyncMock.mockClear();
  toastMock.mockClear();
  touchMock.mockClear();
});

test('renders the existing notes value in the field', () => {
  render(<WebsiteEditForm websiteId="website-1" />);

  expect(getNotesField()).toHaveValue('Existing note');
});

test('submits the trimmed notes value when saving', async () => {
  const { user } = render(<WebsiteEditForm websiteId="website-1" />);

  const notesField = getNotesField();
  await user.clear(notesField);
  await user.type(notesField, 'Updated note');
  await user.click(screen.getByTestId('button-submit'));

  expect(mutateAsyncMock).toHaveBeenCalledWith(
    expect.objectContaining({ notes: 'Updated note' }),
    expect.anything(),
  );
});

test('blocks submission and disables the save button when notes exceed 500 characters', async () => {
  const { user } = render(<WebsiteEditForm websiteId="website-1" />);

  const notesField = getNotesField();
  await user.clear(notesField);
  await user.click(notesField);
  await user.paste('a'.repeat(501));

  const submitButton = screen.getByTestId('button-submit');
  await user.click(submitButton);

  expect(mutateAsyncMock).not.toHaveBeenCalled();
  expect(submitButton).toBeDisabled();
}, 15000);
