import type { Metadata } from 'next';
import { WebsitesSettingsPage } from './WebsitesSettingsPage';

export default function () {
  return <WebsitesSettingsPage />;
}

export const metadata: Metadata = {
  title: 'Websites',
};
