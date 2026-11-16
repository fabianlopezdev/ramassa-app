/**
 * Gallery moderation (RAPP-381) is the Galeria segment of the moderation
 * screen (RAPP-802). The route stays so old links land on that segment.
 */
import { Redirect } from 'expo-router';

export default function TeamGalleryScreen() {
  return <Redirect href="/forum-moderation?segment=gallery" />;
}
