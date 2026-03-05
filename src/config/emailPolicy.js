import emailPolicy from "../../config/email-policy.json";

export const EMAIL_POLICY = emailPolicy;
export const POLICY_ERROR_CODES = emailPolicy.errorCodes;

export const extractDomain = (email = "") => email.trim().toLowerCase().split("@")[1] || "";
