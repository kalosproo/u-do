/**
 * The profile picture comes from the signed-in Google account. Local uploads
 * were removed: they were stored as base64 in localStorage, which never synced
 * to another device and could exhaust the storage quota on a large image.
 */
export function resolveUserPhoto(user) {
  return user?.photoURL || "";
}

/** Key an older build wrote uploaded photos to. Cleared when data is cleared. */
export const LEGACY_PHOTO_KEY_PREFIX = "u_do_profile_photo_";
