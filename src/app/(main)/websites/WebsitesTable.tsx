import { Column, DataColumn, DataTable, type DataTableProps, Icon, Text } from '@umami/react-zen';
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

export function WebsitesTable({ showActions, renderLink, ...props }: WebsitesTableProps) {
  const { t, labels } = useMessages();
  const { renderUrl } = useNavigation();

  return (
    <DataTable {...props}>
      <DataColumn id="name" label={<SortableLabel label={t(labels.name)} sortKey="name" />}>
        {(row: any) => (
          <Column gap="1">
            {renderLink?.(row)}
            {row.notes && (
              <Text
                color="muted"
                size="sm"
                data-test={`website-note-summary-${row.id}`}
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.notes}
              </Text>
            )}
          </Column>
        )}
      </DataColumn>
      <DataColumn id="domain" label={<SortableLabel label={t(labels.domain)} sortKey="domain" />} />
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
