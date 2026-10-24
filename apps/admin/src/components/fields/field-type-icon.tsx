/**
 * A field's type as a small icon tile (RAPP-650): the Fitxa's rows and the
 * onboarding picker (RAPP-651) show it before the name. The type's name is
 * the tile's title and its accessible name.
 */

import { cn } from '@/lib/utils';
import {
  AlignLeft,
  Calendar,
  CircleDot,
  CircleHelp,
  FileCheck,
  Hash,
  List,
  ListChecks,
  Mail,
  Paperclip,
  PenLine,
  Phone,
  Search,
  ToggleLeft,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CustomQuestionType } from '@ramassa/shared/intake-builder';

const TYPE_ICONS: Readonly<Record<CustomQuestionType, LucideIcon>> = {
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
  consent: FileCheck,
  file_upload: Paperclip,
  signature: PenLine,
};

export function FieldTypeIcon({
  type,
  className,
}: {
  readonly type: CustomQuestionType;
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
