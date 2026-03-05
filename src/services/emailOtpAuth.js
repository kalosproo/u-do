import {
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
} from "firebase/auth";
import { auth } from "./firebase";

const EMAIL_STORAGE_KEY = "u-do-email-for-sign-in";

const getActionCodeSettings = () => ({
  url: `${window.location.origin}/login`,
  handleCodeInApp: true,
});

export const sendOtpEmail = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Please enter your email address.");
  }

  await sendSignInLinkToEmail(auth, normalizedEmail, getActionCodeSettings());
  localStorage.setItem(EMAIL_STORAGE_KEY, normalizedEmail);
};

export const completeEmailLogin = async () => {
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    return { signedIn: false };
  }

  let email = localStorage.getItem(EMAIL_STORAGE_KEY);

  if (!email) {
    email = window.prompt("Please confirm your email to finish login");
  }

  if (!email) {
    throw new Error("Missing email. Please request a new login link.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  await signInWithEmailLink(auth, normalizedEmail, window.location.href);
  localStorage.removeItem(EMAIL_STORAGE_KEY);

  return { signedIn: true };
};
