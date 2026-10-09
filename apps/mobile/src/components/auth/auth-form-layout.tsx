import type { ReactNode } from 'react';

/** Forms retain validation/submission ownership while screens place their action. */
export type AuthFormLayout = (fields: ReactNode, action: ReactNode) => ReactNode;
