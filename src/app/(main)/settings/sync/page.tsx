import { notFound } from 'next/navigation';

import { serverFeatureFlags } from '@/config/server/featureFlags';
import { metadataModule } from '@/server/metadata';
import { translation } from '@/server/translation';
import { gerServerDeviceInfo, isMobileDevice } from '@/utils/responsive';

import Page from './index';

export const generateMetadata = async () => {
  const { t } = await translation('setting');
  return metadataModule.generate({
    description: t('tab.sync'),
    title: t('header.desc'),
    url: '/settings/sync',
  });
};
export default () => {
  const enableWebrtc = serverFeatureFlags().enableWebrtc;
  if (!enableWebrtc) return notFound();

  const isMobile = isMobileDevice();
  const { os, browser } = gerServerDeviceInfo();

  return <Page browser={browser} mobile={isMobile} os={os} />;
};
