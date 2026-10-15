/** A file the app hands to the share sheet, or downloads on the web (RAPP-401). */
export interface SharedFile {
  /** Without a folder; the extension sets the type. */
  readonly name: string;
  readonly content: string;
  readonly mimeType: string;
  /** The iOS type identifier, such as `public.comma-separated-values-text`. */
  readonly uti: string;
  readonly dialogTitle: string;
}
