import { expect, test } from 'vitest';
import { WebsitesTable } from '@/app/(main)/websites/WebsitesTable';
import { render, screen } from '@/test/render';

test('renders notes only for websites with non-empty notes', () => {
  render(
    <WebsitesTable
      showActions={false}
      data={[
        {
          id: 'website-1',
          name: 'Production',
          domain: 'prod.example.com',
          notes: '  Production website for ad campaigns.  ',
          createdAt: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'website-2',
          name: 'Sandbox',
          domain: 'sandbox.example.com',
          notes: '   ',
          createdAt: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'website-3',
          name: 'Internal',
          domain: 'internal.example.com',
          notes: null,
          createdAt: '2026-08-20T00:00:00.000Z',
        },
      ]}
    />,
  );

  expect(screen.getByText('Production website for ad campaigns.')).toBeInTheDocument();
  expect(screen.getAllByTestId('text-notes')).toHaveLength(1);
});
