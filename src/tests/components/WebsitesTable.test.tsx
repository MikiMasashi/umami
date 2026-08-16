import { describe, expect, test } from 'vitest';
import { WebsitesTable } from '@/app/(main)/websites/WebsitesTable';
import { render, screen } from '@/test/render';

const baseRow = {
  domain: 'example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

function renderTable(data: any[]) {
  return render(<WebsitesTable data={data} renderLink={(row: any) => row.name} />);
}

describe('WebsitesTable notes column', () => {
  test('AC-3.1: renders the notes for a website that has notes', () => {
    renderTable([{ ...baseRow, id: 'w1', name: 'Alpha', notes: 'Production site for client A' }]);

    const cell = screen.getByTestId('cell-notes');
    expect(cell).toHaveTextContent('Production site for client A');
    expect(cell).toHaveAttribute('title', 'Production site for client A');
  });

  test('AC-3.2 / Q6: collapses multi-line notes into a single truncatable line', () => {
    renderTable([
      { ...baseRow, id: 'w1', name: 'Alpha', notes: 'Line one\nLine two\n\n  Line three  ' },
    ]);

    const cell = screen.getByTestId('cell-notes');
    // Displayed text has newlines collapsed to single spaces.
    expect(cell).toHaveTextContent('Line one Line two Line three');
    expect(cell.textContent).not.toContain('\n');
    // Title keeps the trimmed original for hover context.
    expect(cell).toHaveAttribute('title', 'Line one\nLine two\n\n  Line three');
    // Single-line ellipsis truncation.
    expect(cell).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
  });

  test('AC-3.3: renders no notes element for websites with empty or null notes', () => {
    renderTable([
      { ...baseRow, id: 'w1', name: 'Alpha', notes: '' },
      { ...baseRow, id: 'w2', name: 'Beta', notes: null },
      { ...baseRow, id: 'w3', name: 'Gamma', notes: '   ' },
      { ...baseRow, id: 'w4', name: 'Delta' },
    ]);

    expect(screen.queryByTestId('cell-notes')).not.toBeInTheDocument();
  });

  test('AC-3.3: only websites with notes render a notes cell', () => {
    renderTable([
      { ...baseRow, id: 'w1', name: 'Alpha', notes: 'Has notes' },
      { ...baseRow, id: 'w2', name: 'Beta', notes: null },
    ]);

    expect(screen.getAllByTestId('cell-notes')).toHaveLength(1);
    expect(screen.getByTestId('cell-notes')).toHaveTextContent('Has notes');
  });
});
