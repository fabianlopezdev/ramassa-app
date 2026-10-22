import { createContext } from 'react';
import type { View } from 'react-native';

/**
 * Scrolls the form so a view is in sight. `FormScreen` gives it; a wizard
 * question uses it after a blocked Continue (pending fix 20, RAPP-611).
 */
export const FormRevealContext = createContext<((view: View) => void) | null>(null);
