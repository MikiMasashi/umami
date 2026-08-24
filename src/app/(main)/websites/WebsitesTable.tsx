import { DataColumn, DataTable, type DataTableProps, Icon } from '@umami/react-zen';
import { type ReactNode, useEffect, useRef } from 'react';
import { DateDistance } from '@/components/common/DateDistance';
import { LinkButton } from '@/components/common/LinkButton';
import { SortableLabel } from '@/components/common/SortableLabel';
import { useMessages, useNavigation } from '@/components/hooks';
import { SquarePen } from '@/components/icons';
import { summarizeNotes } from '@/lib/format';

export interface WebsitesTableProps extends DataTableProps {
  showActions?: boolean;
  allowEdit?: boolean;
  allowView?: boolean;
  renderLink?: (row: any) => ReactNode;
}

export function WebsitesTable({ showActions, renderLink, ...props }: WebsitesTableProps) {
  const { t, labels } = useMessages();
  const { renderUrl } = useNavigation();
  const containerRef = useRef<HTMLDivElement>(null);

  // react-zen's DataTable/DataColumn only forwards the `label` column prop to the
  // header cell (<th>), not to the body <td> cells (it's consumed internally by
  // react-aria-components for accessible naming and isn't rendered as a plain HTML
  // attribute on <td>). Reviewed E2E tests locate the notes cell via `td[label="Notes"]`,
  // so we tag the notes column's cells with a literal `label` attribute after render.
  // This is additive metadata only; it doesn't affect layout, styling, or behavior.
  useEffect(() => {
    const notesCells = containerRef.current?.querySelectorAll('td[id$="-notes"]');
    notesCells?.forEach(cell => cell.setAttribute('label', 'Notes'));
  });

  return (
    <div ref={containerRef}>
      <DataTable {...props}>
        <DataColumn id="name" label={<SortableLabel label={t(labels.name)} sortKey="name" />}>
          {renderLink}
        </DataColumn>
        <DataColumn id="domain" label={<SortableLabel label={t(labels.domain)} sortKey="domain" />} />
        <DataColumn id="notes" label={t(labels.notes)}>
          {(row: any) => {
            const summary = summarizeNotes(row.notes);

            return summary ? <span data-test="text-notes">{summary}</span> : null;
          }}
        </DataColumn>
        <DataColumn
          id="created"
          label={
            <SortableLabel label={t(labels.created)} sortKey="createdAt" defaultDirection="desc" />
          }
          width="200px"
        >
          {(row: any) => <DateDistance date={new Date(row.createdAt)} />}
        </DataColumn>
        {showActions && (
          <DataColumn id="action" label=" " align="end">
            {(row: any) => {
              const websiteId = row.id;

              return (
                <LinkButton href={renderUrl(`/websites/${websiteId}/settings`)} variant="quiet">
                  <Icon>
                    <SquarePen />
                  </Icon>
                </LinkButton>
              );
            }}
          </DataColumn>
        )}
      </DataTable>
    </div>
  );
}
