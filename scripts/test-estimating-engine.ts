import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { computeJob, deriveRates, measure, refreshRates } from "../shared/estimating/engine";
import { evaluate, makeResolver, sizeWeight } from "../shared/estimating/formulas";
import { importTakeoff, jobSchema, emptyJob, newLine, newCategory, ratesSchema } from "../shared/estimating/model";

test("Eyes on 9 matches source and screenshot to the cent without rounding intermediate values", () => {
  const raw = JSON.parse(fs.readFileSync("attached_assets/1_Eyes_on_9_—_Site_Work_-_takeoff_file_1794871558100.json", "utf8"));
  const html = fs.readFileSync("attached_assets/0_Takeoff_form_source_1794871558073.html", "utf8");
  const source = html.slice(html.indexOf("const $ ="), html.indexOf("/* ---------- data shapes"));
  const context = vm.createContext({ job: raw.job });
  vm.runInContext(`${source}; result = computeJob(job);`, context, { timeout: 2000 });
  const result = computeJob(importTakeoff(raw));
  assert.equal(result.total.sell.toFixed(2), "765591.76");
  assert.equal(result.total.cost.toFixed(2), "614435.52");
  assert.equal(result.total.sell, context.result.total.sell);
  assert.equal(result.total.cost, context.result.total.cost);
  assert.equal(Object.keys(result.warnings).length, 15);
  assert.deepEqual(result.errs, {});
  for (const category of raw.job.categories) assert.equal(result.cats[category.id].sell, context.result.cats[category.id].sell);
});
test("safe formulas, rate dependencies, dimensions, feet/inches and errors", () => {
  assert.equal(evaluate(`45'-6"`, () => 0), 45.5);
  assert.equal(evaluate("[$1,000 + 2^3] × 2 ÷ 4 − 1", () => 0), 503);
  assert.throws(() => evaluate("1/0", () => 0), /zero/);
  assert.throws(() => evaluate("process.exit()", () => 0));
  assert.throws(() => evaluate("(".repeat(100) + "2" + ")".repeat(100), () => 0), /deep/);
  const r = makeResolver({ rates: [{ id: "a", key: "dga_ton", value: "20", desc: "", unit: "" }, { id: "b", key: "stone", value: "dga_ton*1.9", desc: "", unit: "" }] });
  assert.equal(r.ev("stone*qty", { qty: 4 }).v, 152);
  assert.ok(r.ev("missing").err);
  const cycle = makeResolver({ rates: [{ id: "a", key: "a", value: "b", desc: "", unit: "" }, { id: "b", key: "b", value: "a", desc: "", unit: "" }] });
  assert.match(cycle.ev("a").err!, /itself/);
  for (const [calc, expected] of Object.entries({ ea: 2, lf: 20, lbs: 1000, tons: .5, sf: 60, sy: 60 / 9, cy: 120 / 27 })) {
    assert.equal(measure(calc, { n: 2, l: 10, w: 3, d: 2, wt: 50 }).q, expected);
  }
});
test("steel shapes and nearest filled rate with deterministic shorter-period ties", () => {
  assert.equal(sizeWeight("HP12x53"), 53);
  assert.equal(sizeWeight("W12×26"), 26);
  assert.equal(sizeWeight("PIPE 10x0.5"), 10.69 * 9.5 * .5);
  assert.equal(sizeWeight("PLATE 1/2x12"), 3.4 * .5 * 12);
  assert.deepEqual(deriveRates({ hr: 10, day: null, wk: null, mo: 8000 }), { hr: 10, day: 80, wk: 2000, mo: 8000 });
  assert.deepEqual(deriveRates({ hr: null, day: 800 }, ["hr", "day"]), { hr: 100, day: 800 });
});
test("markup inheritance, zero quantities, waste, manual overrides and exclusions", () => {
  const job = emptyJob(), cat = newCategory(), line = newLine();
  job.defaults = { tax: "10", oh: "10", ins: "10", profit: "10" };
  line.res.mat.push({ id: "material", desc: "", calc: "qty", qty: "", unit: "", n: "", l: "", w: "", d: "", wt: "", waste: "10", cost: "100" });
  line.res.sub.push({ id: "sub", desc: "", qty: "", unit: "", cost: "5" });
  line.res.lab.push({ id: "lab", desc: "", ltype: "", etype: "", crew: "", dur: "2", basis: "", rate: "5" });
  cat.items = [line]; job.categories = [cat];
  let result = computeJob(job);
  assert.equal(result.total.mat.toFixed(2), "110.00");
  assert.equal(result.total.cost.toFixed(2), "136.00");
  assert.equal(result.items[line.id].unitPrice, result.total.sell);
  line.priceOverride = "200";
  result = computeJob(job);
  assert.equal(result.total.sell, 200);
  assert.equal(result.total.profit, 200 - result.total.cost - result.total.oh - result.total.ins);
  cat.tax = "0"; line.tax = "5";
  assert.equal(computeJob(job).items[line.id].eff.tax, 5);
  line.excluded = true; assert.equal(computeJob(job).total.sell, 0);
  assert.equal(computeJob(job).cats[cat.id].exSell, 200);
  line.excluded = false; cat.excluded = true;
  assert.equal(computeJob(job).total.sell, 0);
  assert.equal(computeJob(job).cats[cat.id].sell, 200);
});
test("imports reject unknown versions and malformed arrays; rate refresh preserves removed types", () => {
  assert.throws(() => importTakeoff({ format: "nuchem-takeoff", formatVersion: 2, job: {} }));
  assert.throws(() => jobSchema.parse({ categories: "invalid" }));
  const job = emptyJob(); job.laborRates = [{ id: "old", name: "Old", hr: "10", day: "" }];
  const company = ratesSchema.parse({ laborRates: [{ id: "new", name: "New", hr: "20" }] });
  const changed = refreshRates(job, company);
  assert.deepEqual(changed.laborRates.map(r => r.id), ["new", "old"]);
  assert.equal(job.laborRates.length, 1);
});

test("refresh matches IDs before names, repoints imported rows and preserves markups unless opted in", () => {
  const job = emptyJob(), cat = newCategory(), line = newLine();
  job.defaults.profit = "17";
  job.laborRates = [{ id: "imported", name: "Operator", hr: "10", day: "" }];
  job.equipRates = [{ id: "importedEq", name: "EXCAVATOR", hr: "", day: "80", wk: "", mo: "" }];
  line.res.lab.push({ id: "l", desc: "", ltype: "imported", etype: "", crew: "1", dur: "1", basis: "hr", rate: "" });
  line.res.eq.push({ id: "e", desc: "", ltype: "", etype: "importedEq", crew: "1", dur: "1", basis: "day", rate: "" });
  cat.items = [line]; job.categories = [cat];
  const company = ratesSchema.parse({ defaults: { profit: "30" },
    laborRates: [{ id: "company", name: "operator", hr: "20" }],
    equipRates: [{ id: "companyEq", name: "Excavator", day: "100" }] });
  const refreshed = refreshRates(job, company);
  assert.equal(refreshed.categories[0].items[0].res.lab[0].ltype, "company");
  assert.equal(refreshed.categories[0].items[0].res.eq[0].etype, "companyEq");
  assert.equal(refreshed.defaults.profit, "17");
  assert.equal(computeJob(refreshed).total.lab, 20);
  assert.equal(computeJob(refreshed).total.eq, 100);
  assert.equal(refreshRates(job, company, { replaceDefaultMarkups: true }).defaults.profit, "30");
  assert.equal(job.categories[0].items[0].res.lab[0].ltype, "imported");
  company.laborRates.push({ id: "imported", name: "Different name", hr: "50", day: "" });
  assert.equal(refreshRates(job, company).categories[0].items[0].res.lab[0].ltype, "imported");
});

test("invalid formula fields count as zero, not blank-field defaults", () => {
  const job = emptyJob(), cat = newCategory(), line = newLine();
  line.res.mat.push({ id: "m", desc: "", calc: "qty", qty: "1/0", unit: "", n: "", l: "", w: "", d: "", wt: "", waste: "", cost: "100" });
  line.res.lab.push({ id: "l", desc: "", ltype: "", etype: "", crew: "bad", dur: "2", basis: "hr", rate: "30" });
  line.res.sub.push({ id: "s", desc: "", qty: "(", unit: "", cost: "40" });
  cat.items = [line]; job.categories = [cat];
  const result = computeJob(job);
  assert.equal(result.total.cost, 0);
  assert.equal(Object.keys(result.errs).length, 3);
  line.priceOverride = "bad";
  assert.equal(computeJob(job).items[line.id].overridden, true);
  assert.equal(computeJob(job).total.sell, 0);
});
