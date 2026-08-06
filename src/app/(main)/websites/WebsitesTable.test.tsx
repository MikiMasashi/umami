import { expect, test } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsitesTable } from './WebsitesTable';

const data = [
  {
    id: 'website-with-notes',
    name: 'Example',
    domain: 'example.com',
    notes: 'Production site for the marketing team.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'website-without-notes',
    name: 'Staging',
    domain: 'staging.example.com',
    notes: null,
    createdAt: new Date().toISOString(),
  },
];

test('renders notes for a website that has them', () => {
  render(<WebsitesTable data={data} />);

  expect(screen.getByText('Production site for the marketing team.')).toBeInTheDocument();
});

test('renders nothing in the notes column for a website without notes', () => {
  render(<WebsitesTable data={data} />);

  const stagingRow = screen.getByText('Staging').closest('tr');

  expect(stagingRow).not.toBeNull();
  expect(stagingRow).not.toHaveTextContent('null');
});
