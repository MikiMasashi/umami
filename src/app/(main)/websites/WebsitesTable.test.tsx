import { expect, test } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsitesTable } from './WebsitesTable';

const websites = [
  {
    id: 'website-1',
    name: 'Website With Note',
    domain: 'a.example.com',
    notes: 'Production site for Client A.',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'website-2',
    name: 'Website Without Note',
    domain: 'b.example.com',
    notes: null,
    createdAt: '2024-01-02T00:00:00.000Z',
  },
  {
    id: 'website-3',
    name: 'Website With Long Note',
    domain: 'c.example.com',
    notes: 'X'.repeat(80),
    createdAt: '2024-01-03T00:00:00.000Z',
  },
];

test('shows notes for a website that has one (FR-5, AC-5)', () => {
  render(<WebsitesTable data={websites} />);

  expect(screen.getByText('Production site for Client A.')).toBeInTheDocument();
});

test('renders nothing for a website with no notes (FR-7, AC-7)', () => {
  render(<WebsitesTable data={[websites[1]]} />);

  expect(screen.queryByText('null')).not.toBeInTheDocument();
  expect(screen.getByText('Website Without Note')).toBeInTheDocument();
});

test('truncates long notes for display (FR-6, AC-6)', () => {
  render(<WebsitesTable data={[websites[2]]} />);

  const longNote = 'X'.repeat(80);

  expect(screen.queryByText(longNote)).not.toBeInTheDocument();
  expect(screen.getByText(`${'X'.repeat(40)}…`)).toBeInTheDocument();
});
