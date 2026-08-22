import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined),
  z.string().max(120).optional(),
);
const optionalUuid = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined),
  z.uuid().optional().catch(undefined),
);

export const dataExportSearchSchema = z.object({
  actor: optionalUuid,
  action: optionalText,
  targetType: optionalText,
  target: optionalUuid,
  start: z.iso.date().optional().catch(undefined),
  end: z.iso.date().optional().catch(undefined),
  cursorAt: z.iso.datetime({ offset: true }).optional().catch(undefined),
  cursorId: z.uuid().optional().catch(undefined),
});

export type DataExportSearch = z.infer<typeof dataExportSearchSchema>;
