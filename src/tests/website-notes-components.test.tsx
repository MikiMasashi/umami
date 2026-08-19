import { expect, test, vi } from 'vitest';
import { WebsiteEditForm } from '@/app/(main)/websites/[websiteId]/settings/WebsiteEditForm';
import { WebsitesTable } from '@/app/(main)/websites/WebsitesTable';
import { render, screen, within } from '@/test/render';

vi.mock('@/components/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/hooks')>();

  return {
    ...actual,
    useWebsite: () => ({
      id: 'website-1',
      name: 'Example',
      domain: 'example.com',
      notes: 'Existing notes',
    }),
    useUpdateQuery: () => ({
      mutateAsync: vi.fn(),
      error: null,
      touch: vi.fn(),
      toast: vi.fn(),
    }),
  };
});

test('WebsiteEditForm renders a notes textarea with existing notes', () => {
  render(<WebsiteEditForm websiteId="website-1" />);

  expect(screen.getByLabelText('Notes')).toHaveValue('Existing notes');
});

test('WebsitesTable shows notes only for rows with meaningful notes', () => {
  render(
    <WebsitesTable
      data={[
        {
          id: 'website-1',
          name: 'Production',
          domain: 'example.com',
          notes: 'Managed by marketing',
          createdAt: '2026-08-19T00:00:00.000Z',
        },
        {
          id: 'website-2',
          name: 'Staging',
          domain: 'staging.example.com',
          notes: '   ',
          createdAt: '2026-08-19T00:00:00.000Z',
        },
      ]}
      renderLink={row => row.name}
    />,
  );

  expect(screen.getByText('Managed by marketing')).toBeInTheDocument();
  const stagingRow = screen.getByText('Staging').closest('tr');
  expect(stagingRow).toBeTruthy();
  expect(within(stagingRow as HTMLElement).queryByTestId('website-notes')).not.toBeInTheDocument();
});
