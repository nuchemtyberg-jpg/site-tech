// Single-call and sectioned takeoff modes with a mocked Anthropic client; no paid requests.
// npx tsx --test scripts/test-takeoff-single.ts
import test from "node:test";
import assert from "node:assert/strict";
import { emptyJob } from "../shared/estimating/model";
import { aiSettingsSchema, type TakeoffState } from "../shared/estimating/takeoff";
import { PDFDocument } from "pdf-lib";
import { runSingleCall, buildJob, normalizePlan, mergeOutputs, PLANNER_MODEL } from "../server/takeoff/single";

function state(): TakeoffState {
  const job = { ...emptyJob(), laborRates: [{ id: "lab1", name: "Laborer", hr: "50", day: "400" }], rates: [{ id: "r1", key: "stone", desc: "3/4 stone", unit: "TON", value: "40" }] };
  return { documents: [], instructions: "", trades: [], settings: aiSettingsSchema.parse({ mode: "single" }),
    playbook: { id: null, version: 0, markdown: "" }, rules: [], job, messages: [], scales: {},
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0, steps: 0, budget: 25, stepLimit: 1, progress: [] } as any;
}
const line = (ref: string) => ({ desc: "Stone base", size: "", calc: "sf", n: "1", l: "100", w: "20", d: "", wt: "", qty: "", unit: "SF", ref, flag: "",
  res: { mat: [{ desc: "Stone", calc: "qty", n: "", l: "", w: "", d: "", wt: "", qty: "qty/100", unit: "TON", waste: "", cost: "stone" }],
    lab: [{ desc: "Spread", ltype: "lab1", etype: "", crew: "2", dur: "1", basis: "day", rate: "" }], eq: [], sub: [] } });
const output = (ref: string) => JSON.stringify({ categories: [{ name: "Site work", items: [line(ref)] }],
  newRates: [{ key: "fabric", desc: "Filter fabric", unit: "SY", value: "2.5", category: "", notes: "" }], summary: "Base course", questions: ["Confirm depth?"] });

function mockClient(texts: string[], plan?: unknown) {
  const requests: any[] = [], planner: any[] = [];
  return { requests, planner, client: { files: {} as any, messages: {
    create: async (body: any) => { planner.push(body); return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(plan) }],
      usage: { input_tokens: 4000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }; },
    stream: (body: any) => {
    requests.push(structuredClone(body));
    const text = texts.shift()!;
    return { finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text }],
      usage: { input_tokens: 50000, output_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) };
  } } as any } };
}
const hooks = (s: TakeoffState, io?: any) => ({ signal: new AbortController().signal, save: async () => {}, progress: (m: string) => s.progress.push({ at: "", message: m }),
  recordCost: (amount: number) => { s.cost += amount; }, io });

async function sixPagePdf() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 6; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}
async function sectionedState() {
  const s = state(); s.settings = aiSettingsSchema.parse({ mode: "sectioned" });
  s.documents = [{ fileId: 7, name: "set.pdf", contentType: "application/pdf", objectPath: "", snapshotPath: "/x", sha256: "", pages: [1, 2, 3, 4, 5, 6] }];
  const bytes = await sixPagePdf();
  return { s, io: { read: async () => bytes, sheets: async () => [1, 2, 3, 4, 5, 6].map(page => ({ document: 7, page, sheetNumber: `C-10${page}` })) } };
}
const pageCount = async (req: any) => (await PDFDocument.load(Buffer.from(req.messages[0].content.find((b: any) => b.type === "document").source.data, "base64"))).getPageCount();

test("one request produces a validated job with server IDs and appended rates", async () => {
  const s = state(), { client, requests } = mockClient([output("C-101 plan, 100x20 ft")]);
  await runSingleCall(client, s, hooks(s));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].output_config.format.type, "json_schema");
  assert.equal(requests[0].output_config.effort, "high");
  assert.equal(s.job.categories.length, 1);
  assert.ok(s.job.categories[0].items[0].id.length > 10);
  assert.deepEqual(s.job.rates.map(r => r.key), ["stone", "fabric"]);
  assert.equal(s.summary, "Base course");
  assert.equal(s.steps, 1);
  assert.ok(Math.abs(s.cost - (50000 * 4 + 10000 * 20) / 1e6) < 1e-9);
  assert.equal(s.pendingCall, undefined);
});

test("a rejected takeoff is sent back once for correction", async () => {
  const s = state(), { client, requests } = mockClient([output(""), output("C-101")]);
  await runSingleCall(client, s, hooks(s));
  assert.equal(requests.length, 2);
  assert.match(requests[1].messages.at(-1).content, /cite sheet/);
  assert.equal(s.steps, 2);
});

test("a second failure ends the run with the validation error", async () => {
  const s = state(), { client } = mockClient([output(""), output("")]);
  await assert.rejects(runSingleCall(client, s, hooks(s)), /failed validation/);
});

test("buildJob never lets Claude set markups or reuse IDs", () => {
  const job = buildJob(state().job, JSON.parse(output("x")));
  const item = job.categories[0].items[0];
  assert.equal(item.tax + item.oh + item.ins + item.profit + item.priceOverride, "");
  assert.notEqual(item.res.mat[0].id, item.res.lab[0].id);
});

test("sectioned: planner splits sheets, sections run with only their pages plus shared sheets, results merge", async () => {
  const { s, io } = await sectionedState();
  const plan = { shared: [{ document: 7, page: 1 }], sections: [
    { name: "Earthwork", scope: "Grading and excavation only", pages: [{ document: 7, page: 2 }, { document: 7, page: 3 }] },
    { name: "Storm", scope: "Storm drainage only", pages: [{ document: 7, page: 4 }, { document: 7, page: 5 }, { document: 7, page: 6 }] }] };
  const { client, requests, planner } = mockClient([output("C-102"), output("C-104")], plan);
  await runSingleCall(client, s, hooks(s, io));
  assert.equal(planner.length, 1);
  assert.equal(planner[0].model, PLANNER_MODEL);
  assert.equal(requests.length, 2);
  assert.deepEqual(await Promise.all(requests.map(pageCount)), [3, 4]);
  assert.match(requests[0].messages[0].content.at(-1).text, /ONLY this section/);
  assert.equal(s.job.categories.length, 2);
  assert.deepEqual(s.job.categories.map(c => c.name), ["Site work", "Site work (Storm)"]);
  assert.deepEqual(s.job.rates.map(r => r.key), ["stone", "fabric"]);
  assert.equal(s.pendingCall, undefined);
});

test("sectioned: a failed section keeps finished sections, and Retry only re-runs the failed one", async () => {
  const { s, io } = await sectionedState();
  const plan = { shared: [], sections: [
    { name: "A", scope: "a", pages: [1, 2, 3].map(page => ({ document: 7, page })) },
    { name: "B", scope: "b", pages: [4, 5, 6].map(page => ({ document: 7, page })) }] };
  const first = mockClient([output("C-1"), output(""), output("")], plan);
  await assert.rejects(runSingleCall(first.client, s, hooks(s, io)), /failed validation/);
  assert.deepEqual(Object.keys(s.sectionOutputs!).sort(), ["A"]);
  assert.ok(s.pendingCall && s.pendingCall.reservation > 0, "failed section's reservation is kept as possible spend");
  delete s.pendingCall;
  const retry = mockClient([output("C-4")], plan);
  await runSingleCall(retry.client, s, hooks(s, io));
  assert.equal(retry.planner.length, 0, "plan is reused");
  assert.equal(retry.requests.length, 1);
  assert.equal(s.job.categories.length, 2);
});

test("sectioned: planner failure falls back to one request with every page", async () => {
  const { s, io } = await sectionedState();
  const { client, requests } = mockClient([output("C-1")], "not json");
  await runSingleCall(client, s, hooks(s, io));
  assert.equal(requests.length, 1);
  assert.equal(await pageCount(requests[0]), 6);
  assert.ok(s.progress.some(p => /Section planning failed/.test(p.message)));
});

test("normalizePlan drops unselected pages and puts unassigned sheets in an Other scope section", () => {
  const selected = [1, 2, 3, 4].map(page => ({ document: 1, page }));
  const plan = normalizePlan({ shared: [{ document: 1, page: 1 }], sections: [
    { name: "Paving", scope: "x", pages: [{ document: 1, page: 2 }, { document: 9, page: 1 }] },
    { name: "Paving", scope: "y", pages: [{ document: 1, page: 3 }] }, { name: "Empty", scope: "z", pages: [] }] }, selected);
  assert.deepEqual(plan.sections.map(x => x.name), ["Paving", "Paving 2", "Other scope"]);
  assert.deepEqual(plan.sections[2].pages, [{ document: 1, page: 4 }]);
});

test("mergeOutputs keeps the first definition of a duplicate new rate key", () => {
  const a = JSON.parse(output("x")), b = JSON.parse(output("y"));
  b.newRates[0].value = "99";
  const merged = mergeOutputs([{ section: "A", out: a }, { section: "B", out: b }]);
  assert.equal(merged.newRates.length, 1);
  assert.equal(merged.newRates[0].value, "2.5");
  assert.deepEqual(merged.questions, ["[A] Confirm depth?", "[B] Confirm depth?"]);
});
