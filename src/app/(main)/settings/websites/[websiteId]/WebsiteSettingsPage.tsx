'use client';
import { Column, Loading } from '@umami/react-zen';
import { WebsiteSettings } from '@/app/(main)/websites/[websiteId]/settings/WebsiteSettings';
import { WebsiteSettingsHeader } from '@/app/(main)/websites/[websiteId]/settings/WebsiteSettingsHeader';
import { useWebsiteQuery } from '@/components/hooks';
import { WebsiteContext } from '@/app/(main)/websites/WebsiteProvider';

export function WebsiteSettingsPage({ websiteId }: { websiteId: string }) {
  const { data: website, isFetching, isLoading } = useWebsiteQuery(websiteId);

  if (isFetching && isLoading) {
    return <Loading placement="absolute" />;
  }

  if (!website) {
    return null;
  }

  return (
    <WebsiteContext.Provider value={website}>
      <Column margin="2" width="100%" maxWidth="800px" style={{ marginInline: 'auto' }}>
        <WebsiteSettingsHeader />
        <WebsiteSettings websiteId={websiteId} />
      </Column>
    </WebsiteContext.Provider>
  );
}
