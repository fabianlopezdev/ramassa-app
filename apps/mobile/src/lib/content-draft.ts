/**
 * A content editor's text kept on the device while she writes (RAPP-341,
 * RAPP-342), so a call, the app lock or a lost connection does not lose it.
 * One draft per person, per content type and per item (`new` for a new one),
 * in the encrypted private storage, removed once the save succeeds. A stored
 * draft that no longer fits its schema is ignored.
 */
import type { z } from 'zod';

export interface DraftStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean | void;
}

export function createDraftStore<Schema extends z.ZodType>(kind: string, schema: Schema) {
  type Draft = z.infer<Schema>;
  const key = (userId: string, itemId: string) => `content.${kind}-draft.${userId}.${itemId}`;
  return {
    read(storage: DraftStorage, userId: string, itemId: string): Draft | null {
      const raw = storage.getString(key(userId, itemId));
      if (raw === undefined) return null;
      try {
        const parsed = schema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    write(storage: DraftStorage, userId: string, itemId: string, draft: Draft): void {
      storage.set(key(userId, itemId), JSON.stringify(draft));
    },
    clear(storage: DraftStorage, userId: string, itemId: string): void {
      storage.remove(key(userId, itemId));
    },
  };
}
