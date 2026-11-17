import test from "node:test";
import assert from "node:assert/strict";
import {prepareContext,TakeoffContextLimitError,defaultContextManagement,safeModelLimits,checkpointContext,hydrateSheetIndexes} from "../server/takeoff/context";
import {emptyJob} from "../shared/estimating/model";
import type {TakeoffState} from "../shared/estimating/takeoff";
test("server-edited token count never triggers client-side history mutation",async()=>{
  const raw=Array.from({length:30},(_,i)=>[{role:"assistant",content:[{type:"thinking",thinking:"opaque",signature:`sig${i}`},{type:"tool_use",id:`t${i}`,name:"view_page",input:{page:i}}]},{role:"user",content:[{type:"tool_result",tool_use_id:`t${i}`,content:[{type:"text",text:"evidence"},{type:"image",source:{data:"image"}}]}]}]).flat();
  const before=JSON.stringify(raw);
  const result=await prepareContext(raw,async sent=>{assert.equal(JSON.stringify(sent),before);return 1000;});
  assert.equal(JSON.stringify(result.messages),before);assert.equal(JSON.stringify(raw),before);
  assert.equal(result.resultsKept,Infinity);
});
test("oversized server-edited context fails once without rewriting signed prefixes",async()=>{
  let attempts=0;const history=[{role:"user",content:"original"}];
  await assert.rejects(prepareContext(history,async()=>{attempts++;return 700000;}),TakeoffContextLimitError);
  assert.equal(attempts,1);assert.deepEqual(history,[{role:"user",content:"original"}]);
  await assert.rejects(prepareContext([],async()=>NaN),/invalid input token count/);
  const error=Object.assign(new Error("rate limited"),{status:429});
  await assert.rejects(prepareContext([],async()=>{throw error;}),e=>e===error);
});
test("production editing clears tool results in substantial batches and preserves thinking for cache reuse",()=>{
  const policy=defaultContextManagement();
  assert.equal(policy.edits[0].type,"clear_thinking_20251015");assert.equal(policy.edits[0].keep,"all");
  assert.equal(policy.edits[1].trigger!.value,400000);assert.equal(policy.edits[1].clear_at_least!.value,50000);
});
test("checkpoint data, legacy index recovery and conservative limits remain available",()=>{
  const state={job:emptyJob(),documents:[{fileId:1}],scales:{"1:1":{feetPerPoint:.5,method:"verified"}},messages:[
    {role:"assistant",content:[{type:"tool_use",id:"idx",name:"sheet_index",input:{document:1}}]},
    {role:"user",content:[{type:"tool_result",tool_use_id:"idx",content:'[{"page":1,"sheetNumber":"C1"}]'}]},
  ]} as TakeoffState;
  hydrateSheetIndexes(state);assert.match(checkpointContext(state).text,/C1/);assert.match(checkpointContext(state).text,/feetPerPoint/);
  assert.equal(safeModelLimits().input,172000);assert.equal(safeModelLimits({max_input_tokens:1000000}).input,600000);
});
