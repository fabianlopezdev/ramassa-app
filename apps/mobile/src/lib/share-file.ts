/**
 * Hands a file the app made to the system share sheet (RAPP-401), for the
 * exports the design doc routes through it: the person chooses where the
 * file goes (Files, mail, a drive). The file is written to the cache and
 * deleted once the sheet closes, because exports hold personal data. The web
 * build has its own file (`share-file.web.ts`), which downloads instead.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppError } from '@ramassa/shared/errors';
import type { SharedFile } from './shared-file';

export async function shareFile(shared: SharedFile): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new AppError('UPLOAD-1');
  const file = new File(Paths.cache, shared.name);
  try {
    if (file.exists) file.delete();
    await file.write(shared.content);
    await Sharing.shareAsync(file.uri, {
      mimeType: shared.mimeType,
      UTI: shared.uti,
      dialogTitle: shared.dialogTitle,
    });
  } finally {
    if (file.exists) file.delete();
  }
}
