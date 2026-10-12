/**
 * Money, in integer minor units.
 *
 * Every amount in the expense book is an integer count of the currency's
 * smallest unit — paise for INR — never a fractional major unit. The billing
 * side already worked this way (`priceMinor` in functions/src/schema/plans.js);
 * the book people actually use did not.
 *
 * Two things went wrong with the float model, and only one of them is the one
 * usually blamed:
 *
 * Float drift is real but was NOT costing anyone money here. Summing a month
 * of realistic amounts differs from the exact total by around 1e-12, which
 * never changes a figure at two decimal places. That was measured over 200,000
 * randomised baskets before this file was written, and the claim is not worth
 * making without the measurement.
 *
 * The display was. Rendering went through `Math.round(value)`, so ₹12.50 was
 * shown as ₹13 and four ₹0.50 rows each read ₹1 under a total of ₹2. Storing
 * integers is what makes that honest: there is no fractional part left to
 * round away, and the formatter shows exactly what is stored.
 */

export const DEFAULT_CURRENCY = "INR";

/**
 * Only INR is offered today. The point of the table is that the symbol and the
 * scale are looked up from the amount's own currency rather than assumed, so
 * adding one is a row here instead of a hunt through the pages.
 */
const CURRENCIES = Object.freeze({
  INR: { symbol: "₹", minorPerMajor: 100, locale: "en-IN" },
});

export const isKnownCurrency = (code) => Object.hasOwn(CURRENCIES, String(code || ""));

const spec = (currency) => CURRENCIES[currency] || CURRENCIES[DEFAULT_CURRENCY];

/**
 * ₹10 crore. A personal ledger does not hold more, and the cap is what keeps
 * a whole book's total inside the safe integer range: 5,000 entries at the
 * limit sum to 5e13, well under 9.007e15.
 */
export const MAX_AMOUNT_MINOR = 1_000_000_000_0;

/** Grouping separators, the symbol and whitespace are noise, not digits. */
const NOISE = /[\s,₹]/g;

/**
 * A plain decimal. Exponent notation is deliberately refused: `1e5` in an
 * amount box is a paste accident far more often than a request for ₹100,000,
 * and `Number()` used to honour it silently.
 */
const DECIMAL = /^(-?)(\d*)(?:\.(\d*))?$/;

/**
 * Parses an amount into integer minor units, or null if it isn't one.
 *
 * Returning null rather than 0 is the point. The old `toAmount` turned
 * "banana", "" and null alike into 0, so a corrupted row became a free ₹0 line
 * that looked deliberate. Callers now have to decide what to do about garbage.
 *
 * A string is read digit by digit rather than through Number(), so "12.35"
 * becomes exactly 1235 without ever being the float 12.349999999999998.
 */
export const parseMinor = (value, currency = DEFAULT_CURRENCY) => {
  const { minorPerMajor } = spec(currency);
  const digits = String(minorPerMajor).length - 1;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const minor = Math.round(value * minorPerMajor);
    return Number.isSafeInteger(minor) ? minor : null;
  }

  if (typeof value !== "string") return null;

  const cleaned = value.replace(NOISE, "");
  if (!cleaned) return null;

  const match = DECIMAL.exec(cleaned);
  if (!match) return null;

  const [, sign, whole = "", fraction = ""] = match;
  if (!whole && !fraction) return null;

  // Pad or truncate the fraction to the currency's scale. Truncating rather
  // than rounding a third decimal would quietly discard money, so it rounds.
  const scaled = `${fraction}`.padEnd(digits + 1, "0").slice(0, digits + 1);
  const carry = Number(scaled[digits]) >= 5 ? 1 : 0;
  const minor =
    Number(whole || "0") * minorPerMajor + Number(scaled.slice(0, digits) || "0") + carry;

  if (!Number.isSafeInteger(minor)) return null;
  return sign === "-" ? -minor : minor;
};

/** Parses, or falls back — for the paths where a number is required regardless. */
export const toMinor = (value, fallback = 0, currency = DEFAULT_CURRENCY) => {
  const minor = parseMinor(value, currency);
  return minor === null ? fallback : minor;
};

/** An amount the book will accept: a whole number of minor units, in range. */
export const isValidMinor = (minor) =>
  Number.isSafeInteger(minor) && Math.abs(minor) <= MAX_AMOUNT_MINOR;

/** Minor units back to major, for arithmetic that has to leave integers. */
export const fromMinor = (minor, currency = DEFAULT_CURRENCY) =>
  (Number(minor) || 0) / spec(currency).minorPerMajor;

/** Integer addition: no intermediate value is ever fractional. */
export const sumMinor = (values) =>
  values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);

/**
 * The exact major-unit decimal, for CSV and anywhere a machine reads it.
 * `12.5` would be ambiguous about its scale; `12.50` is not.
 */
export const toDecimalString = (minor, currency = DEFAULT_CURRENCY) => {
  const { minorPerMajor } = spec(currency);
  const digits = String(minorPerMajor).length - 1;
  const safe = Number.isFinite(minor) ? Math.round(minor) : 0;
  const abs = Math.abs(safe);

  return `${safe < 0 ? "-" : ""}${Math.floor(abs / minorPerMajor)}.${String(
    abs % minorPerMajor
  ).padStart(digits, "0")}`;
};

/**
 * What a person reads.
 *
 * A whole amount renders exactly as it did before this change — `₹1,200`, with
 * the sign inside the symbol the way the old formatter placed it. Paise appear
 * only when there are paise, which is the only case whose output moves, and it
 * moves from wrong to right.
 */
export const formatMoney = (minor, currency = DEFAULT_CURRENCY) => {
  const { symbol, minorPerMajor, locale } = spec(currency);
  const digits = String(minorPerMajor).length - 1;
  const safe = Number.isFinite(minor) ? Math.round(minor) : 0;

  const abs = Math.abs(safe);
  const units = Math.floor(abs / minorPerMajor);
  const rest = abs % minorPerMajor;

  // Math.trunc would give -0 for amounts between -1 and 0, and -0 formats as
  // "0", dropping the sign off ₹-0.50.
  const signed = `${safe < 0 ? "-" : ""}${units.toLocaleString(locale)}`;

  return rest === 0 ? `${symbol}${signed}` : `${symbol}${signed}.${String(rest).padStart(digits, "0")}`;
};

/**
 * Axis ticks, in Indian grouping: 1,50,000 reads as 1.5L rather than 150k.
 * Approximate by design — this is the one place rounding a figure is the job.
 */
export const compactMoney = (minor, currency = DEFAULT_CURRENCY) => {
  const { symbol } = spec(currency);
  const value = fromMinor(minor, currency);
  const n = Math.abs(value);

  if (n >= 1e7) return `${symbol}${+(value / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${symbol}${+(value / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${symbol}${+(value / 1e3).toFixed(1)}k`;
  return `${symbol}${Math.round(value)}`;
};

/**
 * Reads an amount off a stored record, whichever shape it is in.
 *
 * Documents written before this change carry only `amount`, a float in major
 * units. Documents written after carry `amountMinor` as the truth and `amount`
 * as a mirror of it, so a client still running the old bundle — a phone with
 * the installed PWA, say — keeps reading a correct number instead of ₹0.
 *
 * The mirror is also the tiebreak. Only an old client writes `amount` without
 * touching `amountMinor`, so if the two disagree the edit came from one, and
 * the mirror is the newer figure. Without that rule an edit made on an old
 * client would be invisible here forever.
 */
export const readMinor = (raw, currency = DEFAULT_CURRENCY) => {
  const stored = raw?.amountMinor;
  const hasStored = Number.isSafeInteger(stored);
  const mirror = raw?.amount === undefined ? null : parseMinor(raw.amount, currency);

  if (hasStored && mirror !== null && mirror !== stored) return mirror;
  if (hasStored) return stored;
  return mirror ?? 0;
};

/** The currency a stored record is in. Older records predate the field. */
export const readCurrency = (raw) =>
  isKnownCurrency(raw?.currency) ? raw.currency : DEFAULT_CURRENCY;
