/**
 * The participants list reads four app fields through the feature registry
 * (RAPP-662, D7): her nationality, her municipality, her entity and her
 * dependants. Each column and filter shows while its field has a type the
 * feature reads (RAPP-664). When staff change that field's type on Dades de
 * les jugadores, the database stops filling it, and the list stops showing a
 * column that would always be empty.
 */

import { fieldOfFeature, type SystemFieldIndex } from '@ramassa/shared/intake-builder';

export interface ParticipantListColumns {
  readonly nationality: boolean;
  readonly city: boolean;
  readonly entity: boolean;
  readonly dependents: boolean;
}

/**
 * The columns and filters the list shows. Without the fields (the catalog did
 * not load) it shows them all, as it always did: the database still decides
 * what each holds.
 */
export function participantListColumns(fields: SystemFieldIndex): ParticipantListColumns {
  if (fields.size === 0) {
    return { nationality: true, city: true, entity: true, dependents: true };
  }
  const reads = (feature: Parameters<typeof fieldOfFeature>[0]) =>
    fieldOfFeature(feature, fields) !== undefined;
  return {
    nationality: reads('participants.nationality'),
    city: reads('participants.city'),
    entity: reads('participants.entity'),
    dependents: reads('participants.has_dependents'),
  };
}
