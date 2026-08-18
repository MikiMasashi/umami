import { DataColumn, DataTable, type DataTableProps, Icon } from '@umami/react-zen';
import type { ReactNode } from 'react';
import { DateDistance } from '@/components/common/DateDistance';
import { LinkButton } from '@/components/common/LinkButton';
import { SortableLabel } from '@/components/common/SortableLabel';
import { useMessages, useNavigation } from '@/components/hooks';
import { truncateNotes } from '@/lib/notes';
import { SquarePen } from '@/components/icons';

export interface WebsitesTableProps extends DataTableProps {
  showActions?: boolean;
  allowEdit?: boolean;
  allowView?: boolean;
  renderLink?: (row: any) => ReactNode;
}

export function WebsitesTable({ showActions, renderLink, ...props }: WebsitesTableProps) {
  const { t, labels } = useMessages();
  const { renderUrl } = useNavigation();

  return (
    <DataTable {...props}>
      <DataColumn id="name" label={<SortableLabel label={t(labels.name)} sortKey="name" />}>
        {renderLink}
      </DataColumn>
      <DataColumn id="domain" label={<SortableLabel label={t(labels.domain)} sortKey="domain" />} />
      <DataColumn id="notes" label={<span data-test="website-notes-column">Notes</span>}>
        {(row: any) => {
          const notes = truncateNotes(row.notes);
          const hasTooltip = !!row.notes && row.notes.length > notes.length;

          return (
            <span
              data-test={`website-notes-cell-${row.id}`}
              title={hasTooltip ? row.notes : undefined}
            >
              {notes}
              {hasTooltip && (
                <span data-test={`website-notes-tooltip-${row.id}`} title={row.notes} />
              )}
            </span>
          );
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
  );
}
