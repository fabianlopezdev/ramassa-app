/**
 * The modules the runner loads. Each one is a `GroundModule`; the runner sorts
 * them by `order`, so the order of this list does not matter.
 */

import type { GroundModule } from '../lib/ground';
import accounts from './accounts';

export const MODULES: readonly GroundModule[] = [accounts];
