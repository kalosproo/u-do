const PROFILE_PHOTO_KEY_PREFIX = "u_do_profile_photo_";

export function getStoredProfilePhoto(uid) {
  if (!uid) return "";
  return localStorage.getItem(`${PROFILE_PHOTO_KEY_PREFIX}${uid}`) || "";
}

export function setStoredProfilePhoto(uid, dataUrl) {
  if (!uid) return;
  localStorage.setItem(`${PROFILE_PHOTO_KEY_PREFIX}${uid}`, dataUrl);
}

export function clearStoredProfilePhoto(uid) {
  if (!uid) return;
  localStorage.removeItem(`${PROFILE_PHOTO_KEY_PREFIX}${uid}`);
}

export function resolveUserPhoto(user) {
  if (!user) return "";
  return getStoredProfilePhoto(user.uid) || user.photoURL || "";
}
