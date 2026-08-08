/**
 * Protected route guards must not mount while Supabase restores the persisted
 * session. Mounting the signed-out guard first would replace a cold-start deep
 * link with the login route before the stored session becomes available.
 */
export function shouldMountAuthRoutes(isLoading: boolean): boolean {
  return !isLoading;
}
