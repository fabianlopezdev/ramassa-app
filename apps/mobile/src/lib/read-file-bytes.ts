/**
 * The bytes of a file the app made or picked (RAPP-403). The web build has
 * its own file (`read-file-bytes.web.ts`), because expo-file-system has no
 * web support.
 */
import { File } from 'expo-file-system';

export function readFileBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}
