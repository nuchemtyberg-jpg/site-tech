import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { RATE_TABS, type RateTab } from "@shared/estimating/rate-import";
import { ratesSchema, type EstimateRates, type MarkupKey } from "@shared/estimating/model";

export const HEADERS: Record<RateTab, string[]> = {
  Materials: ["Category", "Key", "Description", "Unit", "Price", "Source / notes"],
  Labor: ["Labor type", "Hourly rate", "Day rate (8 hrs)", "Notes"],
  Equipment: ["Equipment type", "Hour", "Day", "Week", "Month", "Notes"],
  Markups: ["Default markup", "Percent", "Notes"],
};
export interface ParsedRates {
  rates: EstimateRates;
  markupKeys: MarkupKey[];
  errors: string[];
  warnings: string[];
  locations: Record<string, string>;
}
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

// Reject oversized inflated ZIPs before ExcelJS materializes worksheet XML.
export function checkWorkbookSize(bytes: Buffer) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error("Not a readable XLSX workbook.");
  const count = bytes.readUInt16LE(end + 10), offset = bytes.readUInt32LE(end + 16);
  if (count > 5000 || bytes.readUInt16LE(end + 4) || offset >= end) throw new Error("Workbook ZIP is too large or unsupported.");
  let pos = offset, inflated = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || bytes.readUInt32LE(pos) !== 0x02014b50) throw new Error("Invalid workbook ZIP directory.");
    inflated += bytes.readUInt32LE(pos + 24);
    if (inflated > 40 * 1024 * 1024) throw new Error("Workbook expands beyond 40 MB; split it into smaller files.");
    pos += 46 + bytes.readUInt16LE(pos + 28) + bytes.readUInt16LE(pos + 30) + bytes.readUInt16LE(pos + 32);
  }
  if (pos > end) throw new Error("Invalid workbook ZIP directory.");
}

export async function parseRateFiles(files: { name: string; data: string; tab?: RateTab }[]): Promise<ParsedRates> {
  const result: ParsedRates = { rates: ratesSchema.parse({}), markupKeys: [], errors: [], warnings: [], locations: {} };
  let totalBytes = 0, rowsRead = 0;
  const seenTabs = new Set<RateTab>();
  for (const file of files) {
    const bytes = Buffer.from(file.data, "base64");
    totalBytes += bytes.length;
    if (totalBytes > 10 * 1024 * 1024) throw new Error("Files exceed the combined 10 MB limit.");
    const workbook = new ExcelJS.Workbook();
    const csv = /\.csv$/i.test(file.name);
    if (!csv && !/\.xlsx$/i.test(file.name)) { result.errors.push(`${file.name}: use XLSX or CSV.`); continue; }
    if (csv && !file.tab) { result.errors.push(`${file.name}: choose a CSV tab type.`); continue; }
    try {
      if (csv) await workbook.csv.read(Readable.from(bytes), { map: value => value, parserOptions: { maxRows: 4002 } });
      else { checkWorkbookSize(bytes); await workbook.xlsx.load(bytes as any); }
    } catch (error) { result.errors.push(`${file.name}: ${error instanceof Error ? error.message : "Unreadable spreadsheet"}`); continue; }
    for (const sheet of workbook.worksheets) {
      const tab = csv ? file.tab : RATE_TABS.find(t => norm(t) === norm(sheet.name));
      if (!tab) { result.warnings.push(`${file.name} / ${sheet.name}: ignored unrecognized tab.`); continue; }
      if (seenTabs.has(tab)) { result.errors.push(`${file.name}: duplicate ${tab} tab. Supply one file/tab per rate kind.`); continue; }
      seenTabs.add(tab);
      if (sheet.rowCount > 1001 || sheet.columnCount > 30) { result.errors.push(`${tab}: maximum 1,000 data rows and 30 columns.`); continue; }
      const cellText = (cell: ExcelJS.Cell): string => {
        let v = cell.value;
        if (v !== null && typeof v === "object") {
          if ("formula" in v || "sharedFormula" in v) {
            if (v.result == null) { result.errors.push(`${file.name} / ${tab} ${cell.address}: formula has no cached value. Recalculate and save the workbook.`); return ""; }
            v = v.result;
          } else if ("richText" in v) return v.richText.map(t => t.text).join("");
          else if ("text" in v) return v.text;
        }
        if (v === null || v === undefined) return "";
        if (typeof v === "number" && Number.isFinite(v)) return String(v);
        if (typeof v === "string") return v.trim();
        result.errors.push(`${file.name} / ${tab} ${cell.address}: unsupported cell value.`);
        return "";
      };
      const positions = new Map<string, number>();
      sheet.getRow(1).eachCell(cell => {
        const header = norm(cellText(cell));
        if (positions.has(header)) result.errors.push(`${tab}: duplicate header "${cellText(cell)}".`);
        positions.set(header, Number(cell.col));
      });
      const missing = HEADERS[tab].filter(h => !positions.has(norm(h)));
      if (missing.length) { result.errors.push(`${tab}: missing headers ${missing.join(", ")}.`); continue; }
      for (let n = 2; n <= sheet.rowCount; n++) {
        if (++rowsRead > 4000) throw new Error("Maximum 4,000 spreadsheet data rows.");
        const values = HEADERS[tab].map(h => cellText(sheet.getRow(n).getCell(positions.get(norm(h))!)));
        if (values.every(v => !v)) continue;
        const id = randomUUID(), where = `${file.name} / ${tab} row ${n}`;
        result.locations[id] = where;
        if (tab === "Materials") {
          const [category, key, desc, unit, value, notes] = values;
          result.rates.rates.push({ id, category, key, desc, unit, value, notes });
        } else if (tab === "Labor") {
          const [name, hr, day, notes] = values;
          result.rates.laborRates.push({ id, name, hr, day, notes });
        } else if (tab === "Equipment") {
          const [name, hr, day, wk, mo, notes] = values;
          result.rates.equipRates.push({ id, name, hr, day, wk, mo, notes });
        } else {
          const [label, value, notes] = values;
          const keys: Record<string, MarkupKey> = { "material tax": "tax", overhead: "oh", insurance: "ins", profit: "profit" };
          const key = keys[norm(label)];
          if (!key) { result.errors.push(`${where}: unknown default markup "${label}".`); continue; }
          if (result.markupKeys.includes(key)) { result.errors.push(`${where}: duplicate markup "${label}".`); continue; }
          result.markupKeys.push(key); result.rates.defaults[key] = value;
          result.rates.markupNotes ??= { tax: "", oh: "", ins: "", profit: "" };
          result.rates.markupNotes[key] = notes;
          result.locations[`defaults:${key}`] = where;
        }
      }
    }
  }
  if (!seenTabs.size) result.errors.push("No Materials, Labor, Equipment or Markups tabs found.");
  return result;
}
