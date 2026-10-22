/**
 * The signed-in person's area and permissions for routing (RAPP-232): the live
 * answer from the auth context when it is known, otherwise what this device
 * remembered for her (an offline cold start). See account-area.ts.
 */
import { useEffect, useMemo } from 'react';
import { useAuth } from '@ramassa/shared/auth';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  areaForRole,
  readRememberedAccount,
  rememberAccount,
  resolveAccountArea,
  type AccountArea,
} from './account-area';
import { privateStorage } from './storage';

const NO_PERMISSIONS: ReadonlySet<PermissionCode> = new Set();

export function useAccountAccess(): {
  readonly area: AccountArea;
  readonly permissions: ReadonlySet<PermissionCode>;
  /** A staging test account's waived second factor (RAPP-628), live or remembered. */
  readonly secondFactorWaived: boolean;
} {
  const { role, needsOnboarding, user, permissions, isResolvingProfile, secondFactorWaived } =
    useAuth();
  const userId = user?.id ?? null;
  const remembered = useMemo(
    () => (userId === null ? null : readRememberedAccount(privateStorage, userId)),
    // `role` on purpose: once the live role resolves it is written back below,
    // and the next offline start reads that.
    [userId, role],
  );

  useEffect(() => {
    if (userId === null || role === null || needsOnboarding) return;
    rememberAccount(privateStorage, userId, {
      area: areaForRole(role),
      permissions,
      secondFactorWaived,
    });
  }, [needsOnboarding, permissions, role, secondFactorWaived, userId]);

  return {
    area: resolveAccountArea({ role, needsOnboarding, isResolvingProfile, remembered }),
    permissions: role !== null ? permissions : (remembered?.permissions ?? NO_PERMISSIONS),
    secondFactorWaived:
      role !== null ? secondFactorWaived : remembered?.secondFactorWaived === true,
  };
}
