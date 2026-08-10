import { expect, test, vi } from 'vitest';
import { WebsitesTable } from '@/app/(main)/websites/WebsitesTable';
import { render, screen } from '@/test/render';

vi.mock('@/components/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/hooks')>();

  return {
    ...actual,
    useMessages: () => ({
      t: (key: string) => key,
      labels: {
        name: 'Name',
        domain: 'Domain',
        notes: 'Notes',
        created: 'Created',
      },
    }),
    useNavigation: () => ({
      renderUrl: (path: string) => path,
      query: {},
      updateParams: vi.fn(),
      router: {},
    }),
  };
});

const rows = [
  {
    id: 'site-with-notes',
    name: 'Production Site',
    domain: 'example.com',
    notes: 'Production environment for the marketing team.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'site-without-notes',
    name: 'Legacy Site',
    domain: 'legacy.example.com',
    notes: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'site-with-long-notes',
    name: 'Long Note Site',
    domain: 'long.example.com',
    notes: 'a'.repeat(200),
    createdAt: new Date().toISOString(),
  },
];

test('shows the notes value for a website that has notes', () => {
  render(<WebsitesTable data={rows} />);

  expect(screen.getByText('Production environment for the marketing team.')).toBeInTheDocument();
});

test('does not render any notes text for a website without notes', () => {
  render(<WebsitesTable data={rows} />);

  const legacyRow = screen.getByText('Legacy Site').closest('tr');

  expect(legacyRow).not.toBeNull();
  expect(legacyRow?.textContent).not.toMatch(/notes/i);
});

test('truncates a long notes value', () => {
  render(<WebsitesTable data={rows} />);

  const longNoteText = screen.getByText(/^a+…$/);

  expect(longNoteText).toBeInTheDocument();
  expect(longNoteText.textContent?.length).toBeLessThan(200);
});
