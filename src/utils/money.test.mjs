// Money tests.
//
//   node --test src/utils/money.test.mjs
//
// Money is the one part of this app where being approximately right is being
// wrong, and every failure mode here is silent: a rounded display that makes
// rows stop adding up, a parse that turns nonsense into a free ₹0 row, a
// migration that reads ₹1,250 as ₹12.50. None of that surfaces as an error.
import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_AMOUNT_MINOR,
  compactMoney,
  formatMoney,
  fromMinor,
  isValidMinor,
  parseMinor,
  readCurrency,
  readMinor,
  sumMinor,
  toDecimalString,
  toMinor,
} from "./money.js";

test("a decimal string parses exactly, without passing through a float", () => {
  assert.equal(parseMinor("12.35"), 1235);
  assert.equal(parseMinor("0.01"), 1);
  assert.equal(parseMinor("1200"), 120000);
  assert.equal(parseMinor("1200.00"), 120000);
  assert.equal(parseMinor(".5"), 50);
  assert.equal(parseMinor("-12.50"), -1250);
});

test("the obvious *100 is inexact for about a tenth of all 2dp values", () => {
  // The reason the string path exists. 12.35 happens to survive it; 0.07 does
  // not, and neither do 18,351 of the first 200,000 paise values.
  assert.equal(0.07 * 100, 7.000000000000001);
  assert.notEqual(0.29 * 100, 29);

  let inexact = 0;
  for (let paise = 1; paise <= 200_000; paise += 1) {
    if ((paise / 100) * 100 !== paise) inexact += 1;
  }
  assert.equal(inexact, 18_351);

  // Neither path in parseMinor is caught by it: the string never multiplies,
  // and the number path rounds.
  assert.equal(parseMinor("0.07"), 7);
  assert.equal(parseMinor(0.07), 7);
  assert.equal(parseMinor("0.29"), 29);
});

test("grouping, spaces and the symbol are noise", () => {
  assert.equal(parseMinor("1,200.50"), 120050);
  assert.equal(parseMinor(" ₹ 99.99 "), 9999);
});

test("garbage is null, not zero", () => {
  // The old toAmount turned every one of these into 0, so a corrupted row
  // became a ₹0 line that looked like someone meant it.
  for (const bad of ["banana", "", "   ", "12.3.4", "--5", null, undefined, {}, [], NaN]) {
    assert.equal(parseMinor(bad), null, `${JSON.stringify(bad)} should not parse`);
  }
});

test("exponent notation is refused rather than honoured", () => {
  // Number("1e5") is 100000. In an amount box that is a paste accident.
  assert.equal(parseMinor("1e5"), null);
  assert.equal(parseMinor("1E5"), null);
});

test("a third decimal rounds rather than being discarded", () => {
  assert.equal(parseMinor("12.345"), 1235);
  assert.equal(parseMinor("12.344"), 1234);
  assert.equal(parseMinor("0.005"), 1);
  assert.equal(parseMinor("0.004"), 0);
});

test("numbers parse too, and infinities do not", () => {
  assert.equal(parseMinor(12.35), 1235);
  assert.equal(parseMinor(0), 0);
  assert.equal(parseMinor(Infinity), null);
  assert.equal(parseMinor(-Infinity), null);
  assert.equal(parseMinor(Number.NaN), null);
});

test("toMinor falls back where a number is required", () => {
  assert.equal(toMinor("banana"), 0);
  assert.equal(toMinor("banana", -1), -1);
  assert.equal(toMinor("12.35", -1), 1235);
});

test("the bound keeps a whole book inside the safe integer range", () => {
  assert.ok(isValidMinor(MAX_AMOUNT_MINOR));
  assert.ok(!isValidMinor(MAX_AMOUNT_MINOR + 1));
  assert.ok(!isValidMinor(1.5));
  assert.ok(!isValidMinor(Number.NaN));
  // 5,000 entries — the import cap — at the limit, still exact.
  assert.ok(Number.isSafeInteger(MAX_AMOUNT_MINOR * 5000));
});

test("whole amounts format exactly as they did before minor units", () => {
  // These are the old formatter's outputs: `₹${Math.round(v).toLocaleString("en-IN")}`.
  assert.equal(formatMoney(120000), "₹1,200");
  assert.equal(formatMoney(0), "₹0");
  assert.equal(formatMoney(15000000), "₹1,50,000");
  assert.equal(formatMoney(-120000), "₹-1,200");
});

test("paise show up instead of being rounded away", () => {
  // The bug this change exists for: ₹12.50 used to render as ₹13.
  assert.equal(formatMoney(1250), "₹12.50");
  assert.equal(formatMoney(1), "₹0.01");
  assert.equal(formatMoney(-50), "₹-0.50");
});

test("rows add up to the total they are shown under", () => {
  const rows = [50, 50, 50, 50];
  const shown = rows.map((row) => formatMoney(row));
  assert.deepEqual(shown, ["₹0.50", "₹0.50", "₹0.50", "₹0.50"]);
  assert.equal(formatMoney(sumMinor(rows)), "₹2");
});

test("summing is integer addition end to end", () => {
  const book = [1235, 9999, 24950, 4505, 129999, 1875, 64020, 777];
  assert.ok(Number.isSafeInteger(sumMinor(book)));
  assert.equal(sumMinor(book), 237360);
  assert.equal(sumMinor([]), 0);
  assert.equal(sumMinor([1, Number.NaN, 2]), 3);
});

test("compact ticks keep the Indian scale", () => {
  assert.equal(compactMoney(15000000), "₹1.5L");
  assert.equal(compactMoney(2_000_000_000), "₹2Cr");
  assert.equal(compactMoney(150000), "₹1.5k");
  assert.equal(compactMoney(45000), "₹450");
});

test("the machine-readable decimal states its own scale", () => {
  assert.equal(toDecimalString(1250), "12.50");
  assert.equal(toDecimalString(120000), "1200.00");
  assert.equal(toDecimalString(1), "0.01");
  assert.equal(toDecimalString(-1250), "-12.50");
});

test("fromMinor is only for arithmetic that has to leave integers", () => {
  assert.equal(fromMinor(1250), 12.5);
  assert.equal(fromMinor(0), 0);
  assert.equal(fromMinor(undefined), 0);
});

test("a record written before this change reads at its real value", () => {
  // The dangerous misread: ₹1,250 stored as the float 1250 must not come back
  // as ₹12.50.
  assert.equal(readMinor({ amount: 1250 }), 125000);
  assert.equal(readMinor({ amount: 12.5 }), 1250);
  assert.equal(readMinor({ amount: "12.35" }), 1235);
  assert.equal(readMinor({}), 0);
});

test("a record written after this change reads its own field", () => {
  assert.equal(readMinor({ amountMinor: 1235, amount: 12.35 }), 1235);
  assert.equal(readMinor({ amountMinor: 0, amount: 0 }), 0);
});

test("an edit from a client that predates minor units still wins", () => {
  // An old bundle writes `amount` alone and leaves `amountMinor` stale. A
  // disagreement therefore means the mirror is the newer number.
  assert.equal(readMinor({ amountMinor: 1250, amount: 20 }), 2000);
  // Agreement means nothing happened, so the stored field stands.
  assert.equal(readMinor({ amountMinor: 1250, amount: 12.5 }), 1250);
});

test("a corrupt mirror does not override a good stored amount", () => {
  assert.equal(readMinor({ amountMinor: 1250, amount: "banana" }), 1250);
  assert.equal(readMinor({ amountMinor: 1250, amount: null }), 1250);
});

test("currency is read from the record, defaulted only when absent", () => {
  assert.equal(readCurrency({ currency: "INR" }), "INR");
  assert.equal(readCurrency({}), "INR");
  assert.equal(readCurrency({ currency: "ZZZ" }), "INR");
  assert.equal(readCurrency(null), "INR");
});
