/**
 * The season authorization as a form (RAPP-773): "Autorització de la
 * temporada" is the system legal form `season_authorization`, built on the
 * board every form uses. A version freezes it in the season's ledger; her
 * phone reads it from the version she is shown (the catalog lists its
 * screens, questions, blocks and consents with the other forms'), and the
 * staff tablet from the version it collects (`catalogWithFormVersion`).
 *
 *   - Its first two screens are re-registration (her details, the season's
 *     questions): a returning player sees them, drawn by the app's own
 *     screens. The walk leaves them out (`authorizationWalkForm`).
 *   - Its last screen holds the consents and her signature, the block marked
 *     `authorization_signature`: her signature of it is her signature of the
 *     authorization, "No puc signar" allowed.
 *   - What she gave travels as one payload (`authorizationSignPayload`, in
 *     `../authorization`), checked by the database against the version.
 */
import { parseIntakeCatalog, type IntakeCatalog } from './builder';
import type { CustomForm, CustomFormScreen } from './custom-form-model';

/** The organization's authorization form in the catalog; none from an older server. */
export function authorizationForm(
  catalog: Pick<IntakeCatalog, 'customForms'>,
): CustomForm | undefined {
  return (catalog.customForms ?? []).find((form) => form.systemKey === 'season_authorization');
}

/** A re-registration screen: the app draws it for a returning player, and it holds nothing. */
export function isReregistrationScreen(screen: Pick<CustomFormScreen, 'systemScreen'>): boolean {
  return (
    screen.systemScreen === 'reregistration' || screen.systemScreen === 'reregistration_season'
  );
}

/** The screen she signs the authorization on: the form's locked last screen. */
export function isAuthorizationSignScreen(screen: Pick<CustomFormScreen, 'systemScreen'>): boolean {
  return screen.systemScreen === 'authorization_sign';
}

/** The authorization's screens the form walker walks: re-registration stays the app's own. */
export function authorizationWalkForm(form: CustomForm): CustomForm {
  return { ...form, screens: form.screens.filter((screen) => !isReregistrationScreen(screen)) };
}

/** `{{season}}` in a text staff wrote, as the app's own texts name it. */
export function withSeasonName(text: string, seasonName: string): string {
  return text.replace(/\{\{\s*season\s*\}\}/gu, seasonName);
}

const FORM_ROW_LISTS = [
  ['custom_form_placements', 'placements'],
  ['custom_form_blocks', 'blocks'],
  ['custom_form_consent_placements', 'consent_placements'],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The catalog as `intake_catalog` sends it, with one form read from a
 * version's snapshot instead of its draft: the staff tablet collects the
 * version in force while the team may be editing the draft. Unchanged when
 * the catalog or the snapshot is not one this build reads.
 */
export function catalogWithFormVersion(raw: unknown, formId: string, snapshot: unknown): unknown {
  if (!isRecord(raw) || !isRecord(snapshot)) return raw;
  const screens = snapshot.screens;
  if (!Array.isArray(screens)) return raw;
  const forms = Array.isArray(raw.custom_forms) ? raw.custom_forms : [];
  const next: Record<string, unknown> = {
    ...raw,
    custom_forms: forms.map((form) =>
      isRecord(form) && form.id === formId
        ? {
            ...form,
            screens: screens.map((screen: unknown) =>
              isRecord(screen) ? { ...screen, is_hidden: false } : screen,
            ),
          }
        : form,
    ),
  };
  for (const [listKey, snapshotKey] of FORM_ROW_LISTS) {
    const rows = Array.isArray(raw[listKey]) ? (raw[listKey] as unknown[]) : [];
    const frozen = Array.isArray(snapshot[snapshotKey]) ? (snapshot[snapshotKey] as unknown[]) : [];
    next[listKey] = [
      ...rows.filter((row) => !isRecord(row) || row.custom_form_id !== formId),
      ...frozen.flatMap((row) =>
        isRecord(row)
          ? [
              {
                ...row,
                surface: 'custom_form',
                custom_form_id: formId,
                ...(listKey === 'custom_form_blocks' ? { kind: row.kind ?? 'signature' } : {}),
              },
            ]
          : [],
      ),
    ];
  }
  return next;
}

/**
 * The catalog as `intake_catalog` sent it (`raw`), read with the authorization
 * form as the version the tablet collects froze it; as it is when there is
 * no such version. The tablet keeps `raw` to open with no connection.
 */
export function parseCatalogWithFormVersion(
  raw: unknown,
  version: { readonly formId: string | null; readonly formSnapshot: unknown } | null,
): IntakeCatalog {
  return parseIntakeCatalog(
    version === null || version.formId === null
      ? raw
      : catalogWithFormVersion(raw, version.formId, version.formSnapshot),
  );
}
