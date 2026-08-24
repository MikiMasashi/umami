import { expect, test } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsitesTable } from '@/app/(main)/websites/WebsitesTable';

const LONG_NOTE =
  'This is a very long note describing the purpose of the website in great detail for operators.';

test('displays the notes content for a website that has notes set', () => {
  render(
    <WebsitesTable
      data={[{ id: 'website-1', name: 'My site', domain: 'example.com', notes: 'Staging site' }]}
    />,
  );

  expect(screen.getByText('Staging site')).toBeInTheDocument();
});

test('truncates notes content that is too long to fit in the row', () => {
  render(
    <WebsitesTable
      data={[{ id: 'website-1', name: 'My site', domain: 'example.com', notes: LONG_NOTE }]}
    />,
  );

  const displayed = screen.getByTitle(LONG_NOTE);

  expect(displayed.textContent?.endsWith('…')).toBe(true);
  expect(displayed.textContent?.length).toBeLessThan(LONG_NOTE.length);
});

test('shows nothing in the notes column for a website with no notes set', () => {
  render(
    <WebsitesTable
      data={[{ id: 'website-1', name: 'My site', domain: 'example.com', notes: null }]}
    />,
  );

  expect(screen.queryByTitle(/./)).not.toBeInTheDocument();
});

test('shows nothing in the notes column for a website with an empty notes string', () => {
  render(
    <WebsitesTable
      data={[{ id: 'website-1', name: 'My site', domain: 'example.com', notes: '' }]}
    />,
  );

  expect(screen.queryByTitle(/./)).not.toBeInTheDocument();
});
