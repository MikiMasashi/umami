import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsiteEditForm } from './WebsiteEditForm';

const mutateAsyncMock = vi.fn().mockResolvedValue({});
const toastMock = vi.fn();
const touchMock = vi.fn();

const mockWebsite = {
  id: 'website-1',
  name: 'My Website',
  domain: 'example.com',
  notes: 'Existing note',
};

vi.mock('@/components/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/hooks')>();

  return {
    ...actual,
    useWebsite: () => mockWebsite,
    useUpdateQuery: () => ({
      mutateAsync: mutateAsyncMock,
      error: undefined,
      touch: touchMock,
      toast: toastMock,
    }),
  };
});

test('renders the persisted notes value on load (AC-2)', () => {
  render(<WebsiteEditForm websiteId="website-1" />);

  expect(screen.getByLabelText('Notes')).toHaveValue('Existing note');
});

test('saves a notes value within the character limit (AC-1)', async () => {
  mutateAsyncMock.mockClear();

  const { user } = render(<WebsiteEditForm websiteId="website-1" />);

  const notesField = screen.getByLabelText('Notes');
  await user.clear(notesField);
  await user.type(notesField, 'Staging environment for Client B.');
  await user.click(screen.getByTestId('button-submit'));

  expect(mutateAsyncMock).toHaveBeenCalledWith(
    expect.objectContaining({ notes: 'Staging environment for Client B.' }),
    expect.anything(),
  );
});

test('shows a validation error and blocks submit when notes exceed 500 characters (AC-3)', async () => {
  mutateAsyncMock.mockClear();

  const { user } = render(<WebsiteEditForm websiteId="website-1" />);

  const notesField = screen.getByLabelText('Notes');
  await user.clear(notesField);
  await user.type(notesField, 'A'.repeat(501), { delay: null });
  await user.click(screen.getByTestId('button-submit'));

  expect(screen.getByTestId('button-submit')).toBeDisabled();
  expect(mutateAsyncMock).not.toHaveBeenCalled();
}, 15000);

test('allows saving with an empty notes field (AC-4)', async () => {
  mutateAsyncMock.mockClear();

  const { user } = render(<WebsiteEditForm websiteId="website-1" />);

  const notesField = screen.getByLabelText('Notes');
  await user.clear(notesField);
  await user.click(screen.getByTestId('button-submit'));

  expect(mutateAsyncMock).toHaveBeenCalledWith(
    expect.objectContaining({ notes: '' }),
    expect.anything(),
  );
});
