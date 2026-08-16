import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/render';

const mutateAsync = vi.fn();

const website = {
  id: 'w1',
  name: 'Alpha',
  domain: 'alpha.com',
  notes: 'Existing note about this site',
};

vi.mock('@/components/hooks/context/useWebsite', () => ({
  useWebsite: () => website,
}));

vi.mock('@/components/hooks/queries/useUpdateQuery', () => ({
  useUpdateQuery: () => ({
    mutateAsync,
    error: null,
    touch: vi.fn(),
    toast: vi.fn(),
  }),
}));

// Imported after mocks so the barrel re-exports the mocked hooks.
const { WebsiteEditForm } = await import(
  '@/app/(main)/websites/[websiteId]/settings/WebsiteEditForm'
);

function getNotesField(container: HTMLElement) {
  return container.querySelector('textarea[name="notes"]') as HTMLTextAreaElement;
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
});

describe('WebsiteEditForm notes field', () => {
  test('AC-1.2: pre-fills the notes textarea with the persisted value', () => {
    const { container } = render(<WebsiteEditForm websiteId="w1" />);

    const notes = getNotesField(container);

    expect(notes).not.toBeNull();
    expect(notes.tagName).toBe('TEXTAREA');
    expect(notes).toHaveValue('Existing note about this site');
  });

  test('AC-1.1 / AC-1.3: submits the edited notes value through the update mutation', async () => {
    const { container, user } = render(<WebsiteEditForm websiteId="w1" />);

    const notes = getNotesField(container);
    await user.clear(notes);
    await user.type(notes, 'A shorter note');

    await user.click(screen.getByTestId('button-submit'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));

    const submitted = mutateAsync.mock.calls[0][0];
    expect(submitted).toMatchObject({ notes: 'A shorter note' });
    // shareId is stripped before submitting (existing behavior preserved).
    expect(submitted).not.toHaveProperty('shareId');
  });

  test('AC-2.2: client-side validation blocks submitting notes longer than 500 characters', async () => {
    const { container, user } = render(<WebsiteEditForm websiteId="w1" />);

    const submit = screen.getByTestId('button-submit');
    const notes = getNotesField(container);

    // A valid edit enables submission.
    fireEvent.change(notes, { target: { value: 'valid note' } });
    await waitFor(() => expect(submit).toBeEnabled());

    // Exceeding the 500 character limit re-disables submission (client-side block).
    fireEvent.change(notes, { target: { value: 'a'.repeat(501) } });
    await waitFor(() => expect(submit).toBeDisabled());

    await user.click(submit);

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test('AC-2.1: notes at the 500 character boundary keep the form submittable', async () => {
    const { container } = render(<WebsiteEditForm websiteId="w1" />);

    const notes = getNotesField(container);
    fireEvent.change(notes, { target: { value: 'a'.repeat(500) } });

    await waitFor(() => expect(screen.getByTestId('button-submit')).toBeEnabled());
  });
});
