import { httpsCallable } from "firebase/functions";

import { functions } from "./firebase";

/**
 * The private calendar link (.ics) that Google, Apple and Outlook calendars
 * subscribe to. `reset` issues a new link and stops the old one working.
 */
export const getCalendarFeedUrl = async ({ reset = false } = {}) => {
  const { data } = await httpsCallable(functions, "getCalendarFeedUrl")({ reset });
  return data.url;
};

/** Calendar apps subscribe through webcal://, which hands the link to them. */
export const webcalUrl = (url) => url.replace(/^https:\/\//, "webcal://");

export const googleCalendarUrl = (url) =>
  `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(url))}`;
