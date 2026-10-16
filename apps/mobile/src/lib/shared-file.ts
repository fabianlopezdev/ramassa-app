/** A file the app hands to the share sheet, or downloads on the web (RAPP-401). */
export interface SharedFile {
  /** Without a folder; the extension sets the type. */
  readonly name: string;
  /** Text such as a CSV, or the bytes of a downloaded file (RAPP-406). */
  readonly content: string | Uint8Array;
  readonly mimeType: string;
  /** The iOS type identifier, such as `public.comma-separated-values-text`. */
  readonly uti: string;
  readonly dialogTitle: string;
}
