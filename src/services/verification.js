import { sendEmailVerification } from "firebase/auth";

/**
 * Sends the address-confirmation email, landing back on the app.
 * A preview deployment's domain is not on the project's authorized list, so a
 * rejected return address falls back to Firebase's own confirmation page.
 */
export const sendVerification = async (user) => {
  try {
    await sendEmailVerification(user, { url: `${window.location.origin}/` });
  } catch (error) {
    if (error?.code !== "auth/unauthorized-continue-uri" && error?.code !== "auth/invalid-continue-uri") {
      throw error;
    }
    await sendEmailVerification(user);
  }
};
