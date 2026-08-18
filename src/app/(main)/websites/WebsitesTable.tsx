import { DataColumn, DataTable, Text, type DataTableProps, Icon } from '@umami/react-zen';
import type { ReactNode } from 'react';
import { DateDistance } from '@/components/common/DateDistance';
import { LinkButton } from '@/components/common/LinkButton';
import { SortableLabel } from '@/components/common/SortableLabel';
import { useMessages, useNavigation } from '@/components/hooks';
import { SquarePen } from '@/components/icons';

export interface WebsitesTableProps extends DataTableProps {
  showActions?: boolean;
  allowEdit?: boolean;
  allowView?: boolean;
  renderLink?: (row: any) => ReactNode;
}

const MAX_NOTE_LENGTH = 100;

function formatNote(note?: string | null) {
  if (!note?.trim()) {
    return '-';
  }

  return note.length > MAX_NOTE_LENGTH ? `${note.substring(0, MAX_NOTE_LENGTH)}...` : note;
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
      <DataColumn id="note" label={<SortableLabel label={t(labels.note)} sortKey="note" />}>
        {(row: any) => {
          const displayNote = formatNote(row.note);
          const fullNote = row.note?.trim() || '-';

          return (
            <Text truncate title={fullNote}>
              {displayNote}
            </Text>
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
              <LinkButton href={renderUrl(`/websites/${websiteId}/settings`)} variant="quiet" data-test="link-button-edit">
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
