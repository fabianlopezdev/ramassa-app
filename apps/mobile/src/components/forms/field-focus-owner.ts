import { createFieldFocusOwnership } from '@/lib/field-focus-ownership';
import { makeMutable } from 'react-native-reanimated';

/** All fields, including modal fields, derive visibility from this one ephemeral ID. */
export const activeFieldFocusId = makeMutable<string | null>(null);
export const fieldFocusOwner = createFieldFocusOwnership((fieldId) => {
  activeFieldFocusId.set(fieldId);
});
