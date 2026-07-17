/**
 * Placeholder Supabase database types.
 *
 * RAPP-10 replaces this file wholesale with the output of
 * `bunx supabase gen types typescript`. Until then it provides an empty-but-valid
 * `Database` shape so the typed Supabase client factory (`lib/supabase.ts`)
 * compiles. Do not hand-author table types here; they are generated.
 */

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
