const POPULAR_EMAIL_PROVIDERS = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "hotmail.com",
  "live.com",
];

const DISPOSABLE_EMAIL_DOMAINS = [
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "temp-mail.org",
  "tempmail.com",
  "yopmail.com",
  "dispostable.com",
  "throwawaymail.com",
  "getnada.com",
  "trashmail.com",
];

export const normalizeEmail = (email = "") => email.trim().toLowerCase();

const getEmailDomain = (email) => {
  const normalizedEmail = normalizeEmail(email);
  const atIndex = normalizedEmail.lastIndexOf("@");

  if (atIndex === -1 || atIndex === normalizedEmail.length - 1) {
    return "";
  }

  return normalizedEmail.slice(atIndex + 1);
};

export const isPopularProvider = (email) => {
  const domain = getEmailDomain(email);
  return POPULAR_EMAIL_PROVIDERS.includes(domain);
};

export const isDisposableDomain = (email) => {
  const domain = getEmailDomain(email);
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
};
