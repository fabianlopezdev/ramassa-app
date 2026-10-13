/**
 * What the team has handed this participant, and the form for recording the
 * next one (RAPP-27).
 *
 * Append-only, and the screen SAYS so, for the same reason the note thread does:
 * a delivery entered by mistake is corrected by recording the truth beside it,
 * not by making the mistake disappear. The database has no UPDATE or DELETE
 * policy on this table; this sentence is what stops a staff member entering
 * something provisional in the belief she can tidy it later.
 *
 * The item is a PICKER, never a text field (CLAUDE.md rule 18). The question
 * this log is kept to answer is how many pairs of boots went out this season,
 * and a typed item answers it wrong forever: "botes", "Botes" and "bota" are
 * three buckets for one thing. The stored value is a stable token; what the
 * reader sees is her own language.
 *
 * The picker offers the organization's own catalog (RAPP-253): the active
 * built-in items and the ones the team added, each with the sizes set for it.
 * A custom item reads by its own name in her language, Catalan when that
 * language is missing, so a delivery never shows up as its generated key.
 */

import { DetailSection } from '@/components/detail/detail-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  itemTypeLabel,
  type EquipmentDeliveryRow,
  type HandoverItemType,
} from '@ramassa/shared/equipment';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import { equipmentDeliverySchemaFor, type EquipmentDeliveryInput } from '@ramassa/shared/schemas';

export interface ParticipantEquipmentProps {
  readonly deliveries: readonly EquipmentDeliveryRow[];
  /**
   * The organization's item types, switched-off ones included: a delivery of
   * an item nobody hands out any more still needs its name.
   */
  readonly itemTypes: readonly HandoverItemType[];
  readonly onAdd: (delivery: EquipmentDeliveryInput) => Promise<void>;
  /** Set when the write itself failed, as opposed to the form being invalid. */
  readonly errorMessage?: string;
}

/** Today, as the date input wants it. Local, not UTC: a handover happened on the day the team saw it. */
function todayForInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function ParticipantEquipment({
  deliveries,
  itemTypes,
  onAdd,
  errorMessage,
}: ParticipantEquipmentProps) {
  const { t, i18n } = useTranslation(['participants', 'equipment']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const language = locale as SupportedLanguage;
  const fieldId = useId();

  const typesByKey = useMemo(() => new Map(itemTypes.map((type) => [type.key, type])), [itemTypes]);
  const itemLabel = (key: string): string =>
    itemTypeLabel(typesByKey.get(key), key, language, (value) => t(`equipment:${value}`));

  // Switched-off items leave the picker (RAPP-253). In the reader's language
  // order, so the list reads alphabetically, as it does on the phone.
  const options = itemTypes
    .filter((type) => type.is_active)
    .map((type) => ({ type, label: itemLabel(type.key) }))
    .sort((left, right) => left.label.localeCompare(right.label, locale));

  const [item, setItem] = useState(
    () =>
      options.find((option) => option.type.key === 'boots')?.type.key ?? options[0]?.type.key ?? '',
  );
  const [size, setSize] = useState('');
  const [deliveredOn, setDeliveredOn] = useState(todayForInput());
  const [note, setNote] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const sizes = typesByKey.get(item)?.sizes ?? [];
  const takesSize = sizes.length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // The same rules the schema enforces server-side, checked here so a staff
    // member is told what is missing rather than having the write refused and
    // surfaced as a generic failure.
    const parsed = equipmentDeliverySchemaFor(sizes).safeParse({
      item,
      size: takesSize ? size : undefined,
      deliveredOn,
      note: note.trim() === '' ? undefined : note,
    });
    if (!parsed.success) {
      setValidationMessage(t('equipmentSizeRequired'));
      return;
    }
    setValidationMessage(null);
    setIsSaving(true);
    await onAdd(parsed.data);
    setIsSaving(false);
    setSize('');
    setNote('');
  }

  return (
    <DetailSection title={t('equipmentTitle')} description={t('equipmentAppendOnly')}>
      {deliveries.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('equipmentEmpty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('equipmentColumnItem')}</TableHead>
              <TableHead>{t('equipmentColumnSize')}</TableHead>
              <TableHead>{t('equipmentColumnDate')}</TableHead>
              <TableHead>{t('equipmentColumnNote')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                {/* The token rendered in her language, or a custom item's own
                    name. A missing key would show the raw token rather than an
                    invented label. */}
                <TableCell>{itemLabel(delivery.item)}</TableCell>
                <TableCell>{delivery.size ?? '—'}</TableCell>
                <TableCell>{new Date(delivery.delivered_on).toLocaleDateString(locale)}</TableCell>
                <TableCell>{delivery.note ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${fieldId}-item`} className="text-start text-sm font-medium">
              {t('equipmentColumnItem')}
            </label>
            <select
              id={`${fieldId}-item`}
              value={item}
              onChange={(event) => {
                setItem(event.target.value);
                // Sizes belong to the item: a 38 chosen for boots is no size of a jersey.
                setSize('');
              }}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {options.map((option) => (
                <option key={option.type.key} value={option.type.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Hidden for an item that has none, rather than shown and ignored: a
              field that does nothing is a question the reader has to answer. */}
          {takesSize ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${fieldId}-size`} className="text-start text-sm font-medium">
                {t('equipmentColumnSize')}
              </label>
              {/* A picker of the item's own sizes, for the reason the item is one:
                  "38" and "38 " are two sizes to a report. Starts empty, so a
                  size is chosen rather than left at the first one. */}
              <select
                id={`${fieldId}-size`}
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="h-10 w-28 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">{t('equipmentSizeChoose')}</option>
                {sizes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <label htmlFor={`${fieldId}-date`} className="text-start text-sm font-medium">
              {t('equipmentColumnDate')}
            </label>
            <Input
              id={`${fieldId}-date`}
              type="date"
              value={deliveredOn}
              onChange={(event) => setDeliveredOn(event.target.value)}
              className="w-44"
            />
          </div>

          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={`${fieldId}-note`} className="text-start text-sm font-medium">
              {t('equipmentColumnNote')}
            </label>
            <Input
              id={`${fieldId}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <Button type="submit" size="lg" disabled={isSaving}>
            {t('equipmentAddAction')}
          </Button>
        </div>

        {validationMessage === null ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {validationMessage}
          </p>
        )}
        {errorMessage === undefined ? null : (
          <p aria-live="polite" className="text-start text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </form>
    </DetailSection>
  );
}
