/**
 * Equipment deliveries (RAPP-27): what the team handed a participant, when, and
 * who handed it over.
 *
 * THE ITEM IS A CATALOG, NEVER FREE TEXT (CLAUDE.md rule 18). The question this
 * data exists to answer is "how many pairs of boots did we hand out this
 * season", asked by a funder, and a typed item answers it wrong forever:
 * "botes", "Botes", "bota" and "boots" are four buckets for one thing and no
 * later cleaning recovers what was meant. The list is mirrored by a check
 * constraint in the database, so a client that skips the picker is still
 * refused, and `equipment.test.ts` asserts the two agree.
 *
 * Values are stable machine tokens, not labels. The label a person reads is an
 * i18n key, so the same delivery reads "Botes" in Catalan and "أحذية" in Arabic
 * while the stored value stays one string a report can group on.
 */

import { z } from 'zod';

export const EQUIPMENT_ITEMS = [
  'boots',
  'shin_pads',
  'socks',
  'shorts',
  'jersey',
  'tracksuit',
  'coat',
  'gloves',
  'water_bottle',
  'rucksack',
  'ball',
  'other',
] as const;

export type EquipmentItem = (typeof EQUIPMENT_ITEMS)[number];
export const equipmentItemSchema = z.enum(EQUIPMENT_ITEMS);

/**
 * The items a size is meaningful for. A water bottle has no size, and a form
 * that asked for one would collect a fake value from a staff member who wanted
 * to move on.
 */
export const SIZELESS_EQUIPMENT_ITEMS = [
  'water_bottle',
  'rucksack',
  'ball',
] as const satisfies readonly EquipmentItem[];

export function equipmentItemTakesSize(item: EquipmentItem): boolean {
  return !(SIZELESS_EQUIPMENT_ITEMS as readonly EquipmentItem[]).includes(item);
}

/**
 * What the add-delivery form submits. `deliveredOn` is a date, not a timestamp:
 * staff record that a handover happened on a day, often the day after, and a
 * time nobody observed would be invented precision.
 */
export const equipmentDeliverySchema = z
  .object({
    item: equipmentItemSchema,
    size: z.string().trim().max(20).optional(),
    deliveredOn: z.iso.date(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((delivery, context) => {
    // An item that takes a size must have one, or the season report cannot say
    // which sizes ran out, which is the second question it is asked.
    if (equipmentItemTakesSize(delivery.item) && (delivery.size ?? '') === '') {
      context.addIssue({
        code: 'custom',
        path: ['size'],
        message: 'This item needs a size',
      });
    }
  });

export type EquipmentDeliveryInput = z.infer<typeof equipmentDeliverySchema>;
