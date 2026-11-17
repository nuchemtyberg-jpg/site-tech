import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { ratesSchema, importTakeoff, MARKUPS } from "../shared/estimating/model";
import { mergeRates } from "../server/services/rate-merge";
import { parseRateFiles, HEADERS, checkWorkbookSize } from "../server/services/rate-spreadsheet";

const blank = () => ratesSchema.parse({});
const mat = (id: string, key = id, value = "10") => ({ id, key, desc: key, unit: "TON", value, category: "", notes: "" });
const opts = { matchById: false, markupKeys: [] };
async function workbookFile(sheets: Record<string, unknown[][]>) {
  const book = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) book.addWorksheet(name).addRows(rows);
  return { name: "rates.xlsx", data: Buffer.from(await book.xlsx.writeBuffer()).toString("base64") };
}
test("XLSX parses all tabs, notes, formulas, blanks and cached numeric values", async () => {
  const file = await workbookFile({
    Materials: [HEADERS.Materials, ["Stone", "dga_ton", "Aggregate", "TON", 20, "Supplier quote"],
      ["Stone", "dga_cy", "Aggregate by volume", "CY", "dga_ton*1.9", ""],
      ["Concrete", "conc", "Concrete", "CY", { formula: "10*3", result: 30 }, "cached"],
      ["Steel", "steel", "Steel", "LB", "", "not quoted"]],
    Labor: [HEADERS.Labor, ["Operator", 10, "", "union"]],
    Equipment: [HEADERS.Equipment, ["Excavator", "", 100, "", "", "rental"]],
    Markups: [HEADERS.Markups, ["Material tax", 6, "NJ"], ["Overhead", 10, ""], ["Insurance", 2, ""], ["Profit", 20, ""]],
  });
  const parsed = await parseRateFiles([file]);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rates.rates[1].value, "dga_ton*1.9");
  assert.equal(parsed.rates.rates[2].value, "30");
  assert.equal(parsed.rates.rates[3].value, "");
  assert.equal(parsed.rates.laborRates[0].notes, "union");
  assert.equal(parsed.rates.equipRates[0].notes, "rental");
  assert.equal(parsed.rates.markupNotes?.tax, "NJ");
  assert.deepEqual(parsed.markupKeys, [...MARKUPS]);
  const merged = mergeRates(blank(), parsed.rates, { ...opts, markupKeys: parsed.markupKeys, locations: parsed.locations });
  assert.deepEqual(merged.errors, []);
  assert.ok(merged.warnings.some(s => s.includes("no price")));
  assert.equal(merged.counts.new, 6);
  assert.equal(merged.counts.changed, 4);
});
test("CSV preserves strings, leading zeros and formula text; requires explicit tab and headers", async () => {
  const csv = (text: string, tab?: "Materials") => ({ name: "one.csv", data: Buffer.from(text).toString("base64"), tab });
  const parsed = await parseRateFiles([csv('Category,Key,Description,Unit,Price,Source / notes\nStone,stone,"Quoted, washed",TON,0010,Quote 001\nStone,more,More,TON,stone*1.9,\n', "Materials")]);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rates.rates[0].value, "0010");
  assert.equal(parsed.rates.rates[0].desc, "Quoted, washed");
  assert.equal(parsed.rates.rates[1].value, "stone*1.9");
  assert.ok((await parseRateFiles([csv("Key,Price\nstone,2")])).errors.some(s => s.includes("choose a CSV")));
  assert.ok((await parseRateFiles([csv("Key,Price\nstone,2", "Materials")])).errors.some(s => s.includes("missing headers")));
});
test("parser reports row-addressed errors, duplicate tabs/markups and unknown sheets", async () => {
  const file = await workbookFile({
    Materials: [HEADERS.Materials, ["", "bad", "", "EA", { formula: "1+1" }, ""]],
    Markups: [HEADERS.Markups, ["Profit", 1, ""], ["Profit", 2, ""], ["Mystery", 1, ""]],
    Help: [["instructions"]],
  });
  const result = await parseRateFiles([file, file]);
  assert.ok(result.errors.some(s => s.includes("E2") && s.includes("cached")));
  assert.ok(result.errors.some(s => s.includes("duplicate markup")));
  assert.ok(result.errors.some(s => s.includes("unknown default markup")));
  assert.ok(result.errors.some(s => s.includes("duplicate Materials")));
  assert.ok(result.warnings.some(s => s.includes("ignored")));
});
test("bounded parser rejects unreadable, oversized and excessive worksheets", async () => {
  assert.throws(() => checkWorkbookSize(Buffer.from("not zip")), /readable/);
  const huge = { name: "large.csv", tab: "Materials" as const, data: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64") };
  await assert.rejects(parseRateFiles([huge]), /10 MB/);
  const many = await workbookFile({ Materials: [HEADERS.Materials, ...Array.from({ length: 1001 }, () => ["", "x", "", "EA", 1, ""])] });
  assert.ok((await parseRateFiles([many])).errors.some(s => s.includes("1,000")));
});
test("merge updates by key/name without deleting; preserves target IDs and source immutability", () => {
  const current = ratesSchema.parse({ rates: [mat("old", "stone"), mat("untouched")],
    laborRates: [{ id: "old-l", name: "Operator", hr: "10" }], equipRates: [{ id: "old-e", name: "EXCAVATOR", day: "100" }] });
  const incoming = ratesSchema.parse({ rates: [mat("imported", "STONE", "15"), mat("new")],
    laborRates: [{ id: "new-l", name: "operator", hr: "20", notes: "union" }],
    equipRates: [{ id: "new-e", name: "Excavator", day: "120" }] });
  const original = structuredClone(current);
  const result = mergeRates(current, incoming, opts);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rates.rates[0].id, "old");
  assert.equal(result.rates.rates[1].key, "untouched");
  assert.equal(result.rates.laborRates[0].id, "old-l");
  assert.equal(result.rates.equipRates[0].id, "old-e");
  assert.equal(result.counts.changed, 3);
  assert.equal(result.counts.new, 1);
  assert.equal(result.changes[0].before?.value, "10");
  assert.equal(result.changes[0].after.value, "15");
  assert.deepEqual(current, original);
});
test("estimate matching uses ID before name, remaps ID collisions, keeps markups unless opted in", () => {
  const current = ratesSchema.parse({ defaults: { profit: "15" }, laborRates: [{ id: "operator", name: "Old operator", hr: "10" }],
    equipRates: [{ id: "collision", name: "Crane", hr: "10" }] });
  const incoming = ratesSchema.parse({ defaults: { profit: "30" }, rates: [mat("collision", "stone")],
    laborRates: [{ id: "operator", name: "Renamed operator", hr: "20" }], markupNotes: { profit: "quote" } });
  const merged = mergeRates(current, incoming, { ...opts, matchById: true });
  assert.deepEqual(merged.errors, []);
  assert.equal(merged.rates.laborRates.length, 1);
  assert.equal(merged.rates.laborRates[0].id, "operator");
  assert.notEqual(merged.rates.rates[0].id, "collision");
  assert.equal(merged.rates.defaults.profit, "15");
  assert.equal(mergeRates(current, incoming, { matchById: true, markupKeys: [...MARKUPS] }).rates.defaults.profit, "30");
});
test("duplicate keys, ambiguous type names, bad formulas/cycles and unknown units block preview", () => {
  const incoming = ratesSchema.parse({ rates: [mat("a", "STONE"), mat("b", "stone"), mat("c", "bad", "unknown*2"), { ...mat("d", "units"), unit: "bananas" }] });
  const result = mergeRates(blank(), incoming, opts);
  assert.ok(result.errors.some(s => s.includes("duplicate key")));
  assert.ok(result.errors.some(s => s.includes("No rate named")));
  assert.ok(result.errors.some(s => s.includes("unknown unit")));
  const cyclic = mergeRates(blank(), ratesSchema.parse({ rates: [mat("a", "a", "b"), mat("b", "b", "a")] }), opts);
  assert.ok(cyclic.errors.some(s => s.includes("itself")));
  const current = ratesSchema.parse({ laborRates: [{ id: "a", name: "Operator" }, { id: "b", name: "operator" }] });
  assert.ok(mergeRates(current, ratesSchema.parse({ laborRates: [{ id: "c", name: "Operator" }] }), opts).errors.some(s => s.includes("ambiguous")));
});
test("complete merged table resolves references to existing keys and recognizes existing custom units", () => {
  const current = ratesSchema.parse({ rates: [{ ...mat("a", "base", "10"), unit: "custom-unit" }] });
  const incoming = ratesSchema.parse({ rates: [{ ...mat("b", "double", "base*2"), unit: "custom-unit" }] });
  assert.deepEqual(mergeRates(current, incoming, opts).errors, []);
  const unchanged = mergeRates(current, current, opts);
  assert.equal(unchanged.counts.unchanged, 1);
});
test("old takeoff imports keep values, IDs and zero markups; optional metadata does not affect pricing", () => {
  const job = importTakeoff({ format: "nuchem-takeoff", formatVersion: 1, job: { rates: [mat("old")] } });
  assert.equal(job.rates[0].id, "old");
  assert.equal(job.rates[0].value, "10");
  assert.equal(job.defaults.profit, "0");
  const noMetadata = ratesSchema.parse({ rates: [{ id: "old", key: "x", unit: "EA", value: "10", desc: "" }] });
  const withMetadata = structuredClone(noMetadata); withMetadata.rates[0].notes = ""; withMetadata.rates[0].category = "";
  assert.equal(mergeRates(noMetadata, withMetadata, opts).counts.unchanged, 1);
});
