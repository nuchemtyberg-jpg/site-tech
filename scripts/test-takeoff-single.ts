// Single-call takeoff mode with a mocked Anthropic client; no paid requests.
// npx tsx --test scripts/test-takeoff-single.ts
import test from "node:test";
import assert from "node:assert/strict";
import { emptyJob } from "../shared/estimating/model";
import { aiSettingsSchema, type TakeoffState } from "../shared/estimating/takeoff";
import { runSingleCall, buildJob } from "../server/takeoff/single";

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

function mockClient(texts: string[]) {
  const requests: any[] = [];
  return { requests, client: { files: {} as any, messages: { stream: (body: any) => {
    requests.push(structuredClone(body));
    const text = texts.shift()!;
    return { finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text }],
      usage: { input_tokens: 50000, output_tokens: 10000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }) };
  } } as any } };
}
const hooks = (s: TakeoffState) => ({ signal: new AbortController().signal, save: async () => {}, progress: (m: string) => s.progress.push({ at: "", message: m }),
  recordCost: (amount: number) => { s.cost += amount; } });

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
