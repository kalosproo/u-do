// Expense-book tests.
//
//   node --test src/utils/financeReport.test.mjs
//
// The failure that matters here is the quiet one. A migration that reads
// ₹1,250 as ₹12.50, a merge that resurrects a deleted row, a total that
// disagrees with the rows under it — none of those throw, and none of them
// look wrong until someone reconciles against a bank statement.
import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_TITLE_LENGTH,
  amountMinorOf,
  buildExpense,
  expensesToCSV,
  mergeExpenses,
  netBalance,
  normalizeExpense,
  spendByCategory,
  totalIncome,
  totalSpend,
} from "./financeReport.js";
import { formatMoney } from "./money.js";

const old = (over = {}) => ({
  id: "a",
  title: "Tea",
  amount: 12.5,
  type: "expense",
  category: "Food",
  date: "2026-09-01",
  ...over,
});

test("a record from before minor units keeps its value", () => {
  const entry = normalizeExpense(old());
  assert.equal(entry.amountMinor, 1250);
  assert.equal(entry.amount, 12.5);
  assert.equal(entry.currency, "INR");
});

test("a whole-rupee record is not read as paise", () => {
  // The migration's one catastrophic misread: ₹1,250 stored as the float 1250.
  const entry = normalizeExpense(old({ amount: 1250 }));
  assert.equal(entry.amountMinor, 125000);
  assert.equal(formatMoney(entry.amountMinor), "₹1,250");
});

test("normalising is idempotent", () => {
  const once = normalizeExpense(old());
  const twice = normalizeExpense(once);
  assert.deepEqual(twice, once);
});

test("an unreadable amount becomes zero rather than NaN", () => {
  assert.equal(normalizeExpense(old({ amount: "banana" })).amountMinor, 0);
  assert.equal(normalizeExpense(old({ amount: undefined })).amountMinor, 0);
});

test("stored fields are bounded and defaulted", () => {
  const entry = normalizeExpense(old({ title: "x".repeat(400), category: "", date: "nonsense" }));
  assert.equal(entry.title.length, MAX_TITLE_LENGTH);
  assert.equal(entry.category, "General");
  assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
});

test("an unknown currency falls back rather than being stored", () => {
  assert.equal(normalizeExpense(old({ currency: "ZZZ" })).currency, "INR");
});

test("totals are integers, and the rows add up to them", () => {
  const book = [
    normalizeExpense(old({ id: "1", amount: 0.5 })),
    normalizeExpense(old({ id: "2", amount: 0.5 })),
    normalizeExpense(old({ id: "3", amount: 0.5 })),
    normalizeExpense(old({ id: "4", amount: 0.5 })),
  ];

  assert.deepEqual(book.map((e) => formatMoney(e.amountMinor)), [
    "₹0.50", "₹0.50", "₹0.50", "₹0.50",
  ]);
  assert.equal(totalSpend(book), 200);
  assert.equal(formatMoney(totalSpend(book)), "₹2");
  assert.ok(Number.isSafeInteger(totalSpend(book)));
});

test("income, spend and net stay in minor units", () => {
  const book = [
    normalizeExpense(old({ id: "1", amount: 100, type: "income", category: "Salary" })),
    normalizeExpense(old({ id: "2", amount: 12.35 })),
  ];

  assert.equal(totalIncome(book), 10000);
  assert.equal(totalSpend(book), 1235);
  assert.equal(netBalance(book), 8765);
  assert.equal(formatMoney(netBalance(book)), "₹87.65");
});

test("category totals are named for their unit", () => {
  const book = [
    normalizeExpense(old({ id: "1", amount: 10, category: "Food" })),
    normalizeExpense(old({ id: "2", amount: 5.5, category: "Food" })),
    normalizeExpense(old({ id: "3", amount: 1, category: "Travel" })),
    normalizeExpense(old({ id: "4", amount: 99, type: "income", category: "Salary" })),
  ];

  assert.deepEqual(spendByCategory(book), [
    { category: "Food", amountMinor: 1550 },
    { category: "Travel", amountMinor: 100 },
  ]);
});

test("buildExpense is the only gate on a new amount", () => {
  assert.throws(() => buildExpense({ title: "x", amount: "banana" }), /plain digits/);
  assert.throws(() => buildExpense({ title: "x", amount: "0" }), /more than zero/);
  assert.throws(() => buildExpense({ title: "x", amount: "-5" }), /more than zero/);
  assert.throws(() => buildExpense({ title: "x", amount: "1e5" }), /plain digits/);
  assert.throws(() => buildExpense({ title: "x", amount: "99999999999" }), /too large/);

  const entry = buildExpense({ title: " Tea ", amount: "12.35", type: "expense", category: "Food" });
  assert.equal(entry.amountMinor, 1235);
  assert.equal(entry.amount, 12.35);
  assert.equal(entry.currency, "INR");
  assert.equal(entry.title, "Tea");
});

test("amountMinorOf reads either shape off a raw record", () => {
  assert.equal(amountMinorOf({ amount: 12.5 }), 1250);
  assert.equal(amountMinorOf({ amountMinor: 1250, amount: 12.5 }), 1250);
  // An edit made on a client that predates minor units.
  assert.equal(amountMinorOf({ amountMinor: 1250, amount: 20 }), 2000);
});

test("the CSV states its scale and its currency", () => {
  const csv = expensesToCSV([normalizeExpense(old({ amount: 12.5 }))]);
  const [header, row] = csv.split("\n");

  assert.equal(header, '"Date","Title","Category","Type","Currency","Amount"');
  assert.ok(row.endsWith('"INR","12.50"'), row);
});

test("a title with a comma still occupies one column", () => {
  const csv = expensesToCSV([normalizeExpense(old({ title: 'Tea, "good"' }))]);
  assert.ok(csv.includes('"Tea, ""good"""'), csv);
});

test("merging still prefers the newer copy and honours deletes", () => {
  const remote = [{ ...old(), updatedAt: "2026-09-02T00:00:00.000Z", amount: 12.5 }];
  const cached = [{ ...old(), updatedAt: "2026-09-03T00:00:00.000Z", amount: 20 }];

  const merged = mergeExpenses(remote, cached);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].amountMinor, 2000);

  // Synced locally, gone from the server: deleted on another device.
  assert.equal(mergeExpenses([], [{ ...old(), id: "gone" }]).length, 0);
  // Never synced: still in flight, so it survives.
  assert.equal(mergeExpenses([], [{ ...old(), id: "new", __pendingSync: true }]).length, 1);
});

test("labels are capped in the unit the rules count, without halving an emoji", async () => {
  const { clipLabel } = await import("./financeReport.js");

  // Measured against the emulator: 120 Devanagari characters are accepted.
  assert.equal(clipLabel("क".repeat(200), 120).length, 120);

  // 😀 is two UTF-16 units. A cut at 120 lands cleanly after 60 of them...
  assert.equal(clipLabel("😀".repeat(80), 120), "😀".repeat(60));

  // ...but one unit later it would split the 61st in half. That half is dropped.
  const clipped = clipLabel(`a${"😀".repeat(80)}`, 120);
  assert.equal(clipped, `a${"😀".repeat(59)}`);
  assert.ok(clipped.length <= 120);

  assert.equal(clipLabel("  padded  ", 120), "padded");
  assert.equal(clipLabel(null, 120), "");
});
