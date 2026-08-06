import { expect, test } from 'vitest';
import { WebsiteContext } from '@/app/(main)/websites/WebsiteProvider';
import { render, screen } from '@/test/render';
import { WebsiteEditForm } from './WebsiteEditForm';

const website = {
  id: 'website-1',
  name: 'Example',
  domain: 'example.com',
  notes: 'Existing notes for this website.',
} as any;

function renderForm() {
  return render(
    <WebsiteContext.Provider value={website}>
      <WebsiteEditForm websiteId={website.id} />
    </WebsiteContext.Provider>,
  );
}

test('renders the existing notes value', () => {
  renderForm();

  expect(screen.getByLabelText('Notes')).toHaveValue('Existing notes for this website.');
});

test('prevents entering notes longer than the character limit', async () => {
  const { user } = renderForm();

  const notesField = screen.getByLabelText('Notes') as HTMLTextAreaElement;

  await user.clear(notesField);
  await user.type(notesField, 'a'.repeat(550));

  expect(notesField.value).toHaveLength(500);
});
