import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/render';

const useWebsiteMock = vi.fn();
const useUpdateQueryMock = vi.fn();

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/components/hooks')>('@/components/hooks');

  return {
    ...actual,
    useWebsite: () => useWebsiteMock(),
    useUpdateQuery: (...args: any[]) => useUpdateQueryMock(...args),
  };
});

const { WebsiteEditForm } = await import(
  '@/app/(main)/websites/[websiteId]/settings/WebsiteEditForm'
);

function getNotesTextarea() {
  return screen.getByTestId('input-notes').querySelector('textarea') as HTMLTextAreaElement;
}

function setupUpdateQueryMock() {
  const mutateAsync = vi.fn().mockImplementation(async (_data, options) => {
    await options?.onSuccess?.();
  });
  const touch = vi.fn();
  const toast = vi.fn();

  useUpdateQueryMock.mockReturnValue({ mutateAsync, error: undefined, touch, toast });

  return { mutateAsync, touch, toast };
}

test('shows the previously saved notes value when the website already has notes', () => {
  useWebsiteMock.mockReturnValue({
    id: 'website-1',
    name: 'My site',
    domain: 'example.com',
    notes: 'Production site for client X',
  });
  setupUpdateQueryMock();

  render(<WebsiteEditForm websiteId="website-1" />);

  expect(getNotesTextarea().value).toBe('Production site for client X');
});

test('renders an empty notes field without error for a website with no notes set', () => {
  useWebsiteMock.mockReturnValue({
    id: 'website-1',
    name: 'My site',
    domain: 'example.com',
    notes: null,
  });
  setupUpdateQueryMock();

  render(<WebsiteEditForm websiteId="website-1" />);

  expect(getNotesTextarea().value).toBe('');
});

test('saves an edited notes value and confirms the save', async () => {
  useWebsiteMock.mockReturnValue({
    id: 'website-1',
    name: 'My site',
    domain: 'example.com',
    notes: null,
  });
  const { mutateAsync, touch, toast } = setupUpdateQueryMock();

  const { user } = render(<WebsiteEditForm websiteId="website-1" />);

  await user.type(getNotesTextarea(), 'Requested by the sales team');
  await user.click(screen.getByTestId('button-submit'));

  await waitFor(() => {
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Requested by the sales team' }),
      expect.anything(),
    );
  });
  expect(touch).toHaveBeenCalledWith('websites');
  expect(touch).toHaveBeenCalledWith('website:website-1');
  expect(toast).toHaveBeenCalled();
});

test('rejects notes longer than 500 characters on submit', async () => {
  useWebsiteMock.mockReturnValue({
    id: 'website-1',
    name: 'My site',
    domain: 'example.com',
    notes: null,
  });
  const { mutateAsync } = setupUpdateQueryMock();

  render(<WebsiteEditForm websiteId="website-1" />);

  const textarea = getNotesTextarea();
  // Bypass the native maxLength restriction to simulate a request that skips client input limits.
  Object.defineProperty(textarea, 'value', {
    configurable: true,
    value: 'a'.repeat(501),
  });
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  screen.getByTestId('button-submit').click();

  await waitFor(() => {
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
