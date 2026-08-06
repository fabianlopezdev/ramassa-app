import { StyleSheet, View } from 'react-native';
import type { StructuredContentVideoProps } from '@ramassa/shared/structured-content';
import {
  createPlayerStructuredContentComponents,
  PlayerStructuredContentFrame,
  type PlayerStructuredContentProps,
} from './player-structured-content-shared';

const styles = StyleSheet.create({
  video: { aspectRatio: 16 / 9, width: '100%' },
});
const iframeStyle = { border: 0, height: '100%', width: '100%' } as const;

function WebVideo({ embedUrl, title }: StructuredContentVideoProps) {
  return (
    <View style={styles.video} className="overflow-hidden rounded-lg border border-neutral-200">
      <iframe
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allowFullScreen
        style={iframeStyle}
      />
    </View>
  );
}

const webComponents = createPlayerStructuredContentComponents(WebVideo);

export function PlayerStructuredContent(props: PlayerStructuredContentProps) {
  return <PlayerStructuredContentFrame {...props} components={webComponents} />;
}
