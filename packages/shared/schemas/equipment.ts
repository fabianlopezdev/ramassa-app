/**
 * Equipment deliveries (RAPP-27): what the team handed a participant, when, and
 * who handed it over.
 *
 * THE ITEM IS A CATALOG, NEVER FREE TEXT (CLAUDE.md rule 18). The question this
 * data exists to answer is "how many pairs of boots did we hand out this
 * season", asked by a funder, and a typed item answers it wrong forever:
 * "botes", "Botes", "bota" and "boots" are four buckets for one thing and no
 * later cleaning recovers what was meant. This list is the twelve built-in
 * items every organization starts with; since RAPP-253 the team can add items
 * of its own, so the database refuses any item its catalog does not have, and
 * `equipment.test.ts` asserts this list matches the built-ins.
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
 * What `equipment_deliveries.item` holds: a built-in token, or a custom
 * item's key (RAPP-253). `save_item_type` generates `custom_` and 32 hex
 * digits; the seed uses readable ones such as `custom_bibs`. A label typed in
 * is refused here, and the ledger trigger refuses a key the catalog lacks.
 */
export const equipmentItemKeySchema = z.union([
  equipmentItemSchema,
  z.string().regex(/^custom_[a-z0-9_]{1,64}$/),
]);

/**
 * What the add-delivery form submits, for an item type with these sizes.
 * `deliveredOn` is a date, not a timestamp: staff record that a handover
 * happened on a day, often the day after, and a time nobody observed would be
 * invented precision.
 *
 * The sizes come from the item type, because the team edits them (RAPP-253):
 * a fixed list of sizeless items here would disagree with the catalog the
 * moment somebody gave the rucksack a size or took them off the gloves.
 */
export function equipmentDeliverySchemaFor(sizes: readonly string[]) {
  return z
    .object({
      item: equipmentItemKeySchema,
      size: z.string().trim().max(20).optional(),
      deliveredOn: z.iso.date(),
      note: z.string().trim().max(500).optional(),
    })
    .superRefine((delivery, context) => {
      // An item that takes a size must have one of its own, or the season
      // report cannot say which sizes ran out, which is the second question it
      // is asked. An item with no sizes stores none.
      const size = delivery.size ?? '';
      const isValid = sizes.length === 0 ? size === '' : sizes.includes(size);
      if (!isValid) {
        context.addIssue({
          code: 'custom',
          path: ['size'],
          message: 'This item needs one of its sizes',
        });
      }
    });
}

export type EquipmentDeliveryInput = z.infer<ReturnType<typeof equipmentDeliverySchemaFor>>;
