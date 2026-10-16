/**
 * Internal documents on the phone (RAPP-406), for `settings.documents`
 * holders, as the documents tab of the web admin's Settings: a search over
 * the organization's private documents, opening one, and adding one. A
 * document is fetched through the media Worker with the person's session and
 * handed to the share sheet, which deletes it from the phone afterwards; one
 * is added from the phone's files, uploaded to the documents folder and then
 * registered. The database checks `settings.documents` on both.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  registerInternalDocument,
  searchInternalDocuments,
  type InternalDocument,
} from '@ramassa/shared/organization-settings';
import { UPLOAD_CONTENT_TYPES, uploadContentTypeSchema } from '@ramassa/shared/schemas';
import { buildMediaObjectUrl, uploadFile } from '@ramassa/shared/upload-client';
import { documentFileName, documentUti } from './document-file';
import { readFileBytes } from './read-file-bytes';
import { shareFile } from './share-file';
import { mobileClientEnv, supabase } from './supabase';

const documentsRoot = (userId: string) => ['team', userId, 'documents'] as const;

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session === null) throw new AppError('AUTH-2');
  return data.session.access_token;
}

function mediaWorkerUrl(): string {
  const url = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
  if (url === undefined) throw new AppError('UPLOAD-1');
  return url;
}

export function useInternalDocuments(query: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...documentsRoot(user?.id ?? 'signed-out'), query],
    queryFn: () => searchInternalDocuments(supabase, query),
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });
}

export function useDocumentActions(dialogTitle: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const open = useMutation({
    mutationFn: async (document: InternalDocument) => {
      const response = await fetch(buildMediaObjectUrl(mediaWorkerUrl(), document.object_key), {
        headers: { authorization: `Bearer ${await accessToken()}` },
      });
      if (!response.ok) throw new AppError('UPLOAD-1');
      await shareFile({
        name: documentFileName(document.name),
        content: new Uint8Array(await response.arrayBuffer()),
        mimeType: document.content_type,
        uti: documentUti(document.content_type),
        dialogTitle,
      });
    },
  });

  /** Resolves false when the person closes the picker without a file. */
  const add = useMutation({
    mutationFn: async (): Promise<boolean> => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [...UPLOAD_CONTENT_TYPES].filter((type) => !type.startsWith('video/')),
        copyToCacheDirectory: true,
      });
      const asset = picked.canceled ? undefined : picked.assets[0];
      if (asset === undefined) return false;
      const contentType = uploadContentTypeSchema.parse(asset.mimeType);
      const bytes = await readFileBytes(asset.uri);
      const uploaded = await uploadFile({
        mediaWorkerUrl: mediaWorkerUrl(),
        accessToken: await accessToken(),
        folder: 'documents',
        file: { data: bytes, contentType, byteLength: bytes.byteLength },
      });
      if (!uploaded.ok) throw uploaded.error;
      await registerInternalDocument(supabase, {
        objectKey: uploaded.value.objectKey,
        name: asset.name,
        contentType,
        fileSize: bytes.byteLength,
      });
      return true;
    },
    onSuccess: (added) => {
      if (!added) return undefined;
      return queryClient.invalidateQueries({ queryKey: documentsRoot(user?.id ?? 'signed-out') });
    },
  });

  return { open, add };
}
