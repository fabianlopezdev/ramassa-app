/**
 * Desktop to phone photo handoff (RAPP-254). The desk opens a single-use
 * request bound to the person, valid ten minutes, and shows it as a QR code.
 * The phone, signed in as the same person, takes the photo, uploads it, and
 * completes the request; the database then does the target's work (for an
 * internal document, it registers it). The desk hears of it through Realtime.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, databaseErrorCode } from './errors';
import { realtimeTopic } from './lib/realtime-topic';
import type { Database } from './types/database';

type Client = SupabaseClient<Database>;

export type PhotoHandoffTarget = 'internal_document';

export interface PhotoHandoff {
  readonly id: string;
  readonly target: PhotoHandoffTarget;
  readonly documentName: string;
  readonly expiresAt: string;
  readonly completedAt: string | null;
  readonly resultId: string | null;
}

export type PhotoHandoffState = 'open' | 'done' | 'expired';

function databaseError(error: { readonly message: string; readonly code?: string }): AppError {
  return new AppError(databaseErrorCode(error.message, error.code), { message: error.message });
}

/** The path the QR code points at, on the web admin; the phone page offers the app too. */
export function photoHandoffPath(id: string): string {
  return `/photo-handoff/${id}`;
}

/** The link that opens the Ramassà app on this handoff. */
export function photoHandoffAppLink(id: string): string {
  return `ramassa://photo-handoff/${id}`;
}

export function photoHandoffState(
  handoff: PhotoHandoff,
  now: Date = new Date(),
): PhotoHandoffState {
  if (handoff.completedAt !== null) return 'done';
  return Date.parse(handoff.expiresAt) <= now.getTime() ? 'expired' : 'open';
}

export async function createPhotoHandoff(
  client: Client,
  input: { readonly target: PhotoHandoffTarget; readonly documentName: string },
): Promise<{ readonly id: string; readonly expiresAt: string }> {
  const { data, error } = await client.rpc('create_photo_handoff', {
    p_target: input.target,
    p_document_name: input.documentName.trim(),
  });
  if (error) throw databaseError(error);
  const row = data?.[0];
  if (row === undefined) throw new AppError('DB-1', { message: 'create_photo_handoff: no row' });
  return { id: row.handoff_id, expiresAt: row.expires_at };
}

/** Null when it does not exist or belongs to someone else (both read the same). */
export async function fetchPhotoHandoff(client: Client, id: string): Promise<PhotoHandoff | null> {
  const { data, error } = await client
    .from('photo_handoffs')
    .select('id, target, document_name, expires_at, completed_at, result_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (data === null) return null;
  return {
    id: data.id,
    target: data.target as PhotoHandoffTarget,
    documentName: data.document_name,
    expiresAt: data.expires_at,
    completedAt: data.completed_at,
    resultId: data.result_id,
  };
}

export async function completePhotoHandoff(
  client: Client,
  input: {
    readonly id: string;
    readonly objectKey: string;
    readonly contentType: string;
    readonly fileSize: number;
  },
): Promise<void> {
  const { error } = await client.rpc('complete_photo_handoff', {
    p_id: input.id,
    p_object_key: input.objectKey,
    p_content_type: input.contentType,
    p_file_size: input.fileSize,
  });
  if (error) throw databaseError(error);
}

/** Calls back when the phone completes this handoff. */
export function subscribeToPhotoHandoff(
  client: Client,
  id: string,
  onCompleted: () => void,
): () => void {
  const channel = client
    .channel(realtimeTopic(`photo-handoff:${id}`))
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'photo_handoffs', filter: `id=eq.${id}` },
      (payload) => {
        if ((payload.new as { completed_at?: string | null }).completed_at != null) onCompleted();
      },
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
