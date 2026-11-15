/**
 * A field's type as a small icon tile (RAPP-650): the Fitxa's rows and the
 * onboarding picker (RAPP-651) show it before the name. The type's name is
 * the tile's title and its accessible name. A signature block (RAPP-690) has
 * its own tile in the same lists, and so do a consent and a document (RAPP-699).
 */

import { cn } from '@/lib/utils';
import {
  AlignLeft,
  Calendar,
  CircleDot,
  CircleHelp,
  FileText,
  Globe,
  Hash,
  LayoutList,
  List,
  ListChecks,
  Mail,
  MapPin,
  Paperclip,
  PenLine,
  Phone,
  Pilcrow,
  Search,
  ShieldCheck,
  ToggleLeft,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CustomQuestionType } from '@ramassa/shared/intake-builder';

/**
 * A field's type, a block of a form (a signature, RAPP-690; a text or points,
 * RAPP-770) or a consent of Dades legals (RAPP-699).
 */
export type CatalogItemType =
  CustomQuestionType | 'signature' | 'text_block' | 'points_block' | 'consent' | 'document';

const TYPE_ICONS: Readonly<Record<CatalogItemType, LucideIcon>> = {
  short_text: Type,
  long_text: AlignLeft,
  yes_no_maybe: CircleHelp,
  yes_no: ToggleLeft,
  single_choice: CircleDot,
  multiple_choice: ListChecks,
  search_choice: Search,
  number: Hash,
  date: Calendar,
  phone: Phone,
  email: Mail,
  item_list: List,
  file_upload: Paperclip,
  country: Globe,
  municipality: MapPin,
  signature: PenLine,
  text_block: Pilcrow,
  points_block: LayoutList,
  consent: ShieldCheck,
  document: FileText,
};

/** The icon of a type, for a menu that lists types. */
export function catalogItemIcon(type: CatalogItemType): LucideIcon {
  return TYPE_ICONS[type];
}

export function FieldTypeIcon({
  type,
  className,
}: {
  readonly type: CatalogItemType;
  readonly className?: string;
}) {
  const { t } = useTranslation('settings');
  const Icon = TYPE_ICONS[type];
  const name = t(`questions.types.${type}`);
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary',
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </span>
  );
}
