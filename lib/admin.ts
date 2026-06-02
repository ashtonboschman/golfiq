export const ADMIN_USER_ID = BigInt(1);

export function isAdminUserId(
  userId: bigint | string | number | null | undefined
): boolean {
  if (userId === null || userId === undefined) return false;

  try {
    return BigInt(userId) === ADMIN_USER_ID;
  } catch {
    return false;
  }
}
