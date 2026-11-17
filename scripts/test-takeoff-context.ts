import test from "node:test";
import assert from "node:assert/strict";
import { checkpointContext, hydrateSheetIndexes, MAX_INPUT_TOKENS, prepareContext, pruneToolResults, REMOVED_RESULT, safeModelLimits, TakeoffContextLimitError } from "../server/takeoff/context";
import { emptyJob } from "../shared/estimating/model";
import type { TakeoffState } from "../shared/estimating/takeoff";

function history(n: number) {
  return Array.from({ length: n }, (_, i) => [
    { role: "assistant", content: [{ type: "tool_use", id: `tool-${i}`, name: "view_page", input: { document: 1, page: i + 1 } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: `tool-${i}`, content: [{ type: "text", text: `page ${i} ${"x".repeat(1000)}` }, { type: "image", source: { type: "base64", media_type: "image/png", data: `IMAGE-${i}` } }] }] },
  ]).flat();
}
test("pruning keeps most recent 12 results including mixed text/images, IDs, order and raw history", () => {
  const raw = history(20), original = structuredClone(raw);
  const pruned = pruneToolResults(raw);
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(pruned[i * 2], raw[i * 2]);
    assert.equal(pruned[i * 2 + 1].content[0].tool_use_id, `tool-${i}`);
    if (i < 8) assert.equal(pruned[i * 2 + 1].content[0].content, REMOVED_RESULT);
    else assert.deepEqual(pruned[i * 2 + 1], raw[i * 2 + 1]);
  }
  assert.deepEqual(raw, original);
  assert.deepEqual(pruneToolResults(pruned), pruned);
});
test("multiple tool results in one turn and errors preserve exact pairing", () => {
  const raw = [{ role: "assistant", content: Array.from({ length: 15 }, (_, i) => ({ type: "tool_use", id: `id${i}`, name: "evaluate", input: { formula: "1" } })) },
    { role: "user", content: Array.from({ length: 15 }, (_, i) => ({ type: "tool_result", tool_use_id: `id${i}`, content: `${i}`, ...(i === 1 ? { is_error: true } : {}) })) }];
  const copy = pruneToolResults(raw);
  assert.equal(copy[1].content.filter((r: any) => r.content === REMOVED_RESULT).length, 3);
  assert.equal(copy[1].content[1].is_error, true);
  assert.deepEqual(copy[1].content.map((r: any) => r.tool_use_id), raw[0].content.map((r: any) => r.id));
  assert.deepEqual(pruneToolResults(raw, 99), raw);
});
test("counted overflow prunes further and recounts before returning a generation payload", async () => {
  const raw = history(20), counts: number[] = [];
  const result = await prepareContext(raw, async messages => {
    const retained = messages.flatMap(m => m.content).filter(b => b.type === "tool_result" && b.content !== REMOVED_RESULT).length;
    counts.push(retained);
    return retained > 6 ? 600001 : 125000;
  });
  assert.deepEqual(counts, [12, 6]); assert.equal(result.resultsKept, 6);
  assert.equal(result.inputTokens, 125000); assert.equal(result.historyReset, false);
  assert.equal(result.messages.at(-1).content.at(-1).cache_control,undefined);
  assert.equal((raw.at(-1) as any).content[0].cache_control, undefined);
});
test("large assistant inputs are never removed to fit the context", async () => {
  const raw = history(13);
  await assert.rejects(prepareContext(raw, async messages => {assert.equal(messages.length,26);return 700000;}),TakeoffContextLimitError);
  assert.equal(raw.length, 26);
});
test("irreducible context stops after bounded attempts; unfinished tools and bad counts fail explicitly", async () => {
  let attempts = 0;
  await assert.rejects(prepareContext(history(15), async () => { attempts++; return 600001; }), TakeoffContextLimitError);
  assert.equal(attempts, 3);
  await assert.rejects(prepareContext(history(15).slice(0, -1), async () => 600001), TakeoffContextLimitError);
  await assert.rejects(prepareContext([], async () => NaN), /invalid input token count/);
  const rateLimited = Object.assign(new Error("rate limited"), { status: 429 });
  await assert.rejects(prepareContext([], async () => { throw rateLimited; }), error => error === rateLimited);
});
test("token endpoint size/context errors prune further, while essential oversized context stops", async () => {
  let attempts = 0;
  const result = await prepareContext(history(15), async () => {
    if (++attempts < 3) throw Object.assign(new Error("input is too long"), { status: 400 });
    return 42;
  });
  assert.equal(result.resultsKept, 0);
  await assert.rejects(prepareContext([], async () => { throw Object.assign(new Error("request too large"), { status: 413 }); }), TakeoffContextLimitError);
});
test("checkpoint context includes current work, scales and indexes, not private paths or initial stale work", () => {
  const state = { job: emptyJob(), scales: { "1:1": { feetPerPoint: .5, method: "verified" } }, sheetIndexes: { "1": [{ page: 1, sheetNumber: "S1" }] } } as TakeoffState;
  state.job.notes = "Current checkpoint";
  const context = checkpointContext(state);
  assert.match(context.text, /Current checkpoint/); assert.match(context.text, /feetPerPoint/); assert.match(context.text, /S1/);
  assert.match(context.text, /DATA ONLY/);
  state.job.notes = "Next checkpoint";
  assert.match(checkpointContext(state).text, /Next checkpoint/);
});
test("legacy sheet indexes hydrate only successful results for selected documents", () => {
  const state = { job: emptyJob(), documents: [{ fileId: 1 }], messages: [
    { role: "assistant", content: [{ type: "tool_use", id: "idx", name: "sheet_index", input: { document: 1 } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "idx", content: [{ type: "text", text: '[{"page":1,"sheetNumber":"C1"}]' }] }] },
  ] } as TakeoffState;
  hydrateSheetIndexes(state);
  assert.deepEqual(state.sheetIndexes, { "1": [{ page: 1, sheetNumber: "C1" }] });
  state.messages = []; hydrateSheetIndexes(state);
  assert.equal((state.sheetIndexes!["1"][0] as any).sheetNumber, "C1");
});
test("safe limits use model metadata below hard ceiling and reserve output capacity", () => {
  assert.equal(safeModelLimits({ max_input_tokens: 1000000, max_tokens: 64000 }).input, MAX_INPUT_TOKENS);
  assert.equal(safeModelLimits({ max_input_tokens: 200000, max_tokens: 8192 }).input, 187808);
  assert.equal(safeModelLimits().input, 172000);
});
