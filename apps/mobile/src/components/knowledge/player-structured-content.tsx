import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { StructuredContentVideoProps } from '@ramassa/shared/structured-content';
import {
  createPlayerStructuredContentComponents,
  PlayerStructuredContentFrame,
  VideoLinkButton,
  type PlayerStructuredContentProps,
} from './player-structured-content-shared';

function NativeVideo({ embedUrl, title }: StructuredContentVideoProps) {
  const { t } = useTranslation('knowledge');
  const openVideo = useCallback(() => {
    void WebBrowser.openBrowserAsync(embedUrl);
  }, [embedUrl]);
  return (
    <VideoLinkButton
      title={title}
      label={t('knowledge:openVideo', { title })}
      onPress={openVideo}
    />
  );
}

const nativeComponents = createPlayerStructuredContentComponents(NativeVideo);

export function PlayerStructuredContent(props: PlayerStructuredContentProps) {
  return <PlayerStructuredContentFrame {...props} components={nativeComponents} />;
}
