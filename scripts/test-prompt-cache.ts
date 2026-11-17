import test from "node:test";
import assert from "node:assert/strict";
import {prepareCachedContext,addCheckpointTurn} from "../server/takeoff/context";
import {takeoffSystem} from "../server/takeoff/worker";
import {TAKEOFF_TOOLS} from "../server/takeoff/tools";
import {emptyJob} from "../shared/estimating/model";
import {aiSettingsSchema,usageCost,type TakeoffState} from "../shared/estimating/takeoff";
test("wire system/tools/prior messages stay byte-identical through steps, budgets, scale changes and restart",async()=>{
  let state:TakeoffState={job:emptyJob(),documents:[],settings:aiSettingsSchema.parse({}),instructions:"test",trades:[],rules:[],playbook:{id:null,version:0,markdown:""},messages:[],scales:{},steps:0,cost:0,budget:25,stepLimit:150,usage:{input:0,output:0,cacheRead:0,cacheWrite:0},progress:[]};
  state.systemSnapshot=JSON.stringify(takeoffSystem(state));state.toolsSnapshot=JSON.stringify(TAKEOFF_TOOLS);
  let previous:any[]=[];const system=state.systemSnapshot,tools=state.toolsSnapshot;
  for(let i=0;i<18;i++){
    state.steps=i;state.cost+=.01;state.scales[`1:${i}`]={feetPerPoint:.5,method:"verified"};addCheckpointTurn(state,i===17);
    const result=await prepareCachedContext(state,async()=>10000);
    assert.equal(state.systemSnapshot,system);assert.equal(state.toolsSnapshot,tools);
    assert.equal(JSON.stringify(result.messages.slice(0,previous.length)),JSON.stringify(previous));
    assert.equal(result.resultsKept,Infinity);
    previous=structuredClone(result.messages);
    state.messages.push({role:"assistant",content:[{type:"thinking",thinking:"opaque",signature:`sig${i}`},{type:"tool_use",id:`t${i}`,name:"evaluate",input:{formula:"1"}}]},{role:"user",content:[{type:"tool_result",tool_use_id:`t${i}`,content:"large geometry"}]});
    // Simulate JSONB object ordering changes; persisted wire strings must survive.
    const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
    state=sort(JSON.parse(JSON.stringify(state)));
  }
  let counts=0;
  const batch=await prepareCachedContext(state,async()=>{counts++;return 250000;});
  assert.equal(state.cacheBatches,undefined);assert.equal(JSON.stringify(batch.messages.slice(0,previous.length)),JSON.stringify(previous));
  const after=await prepareCachedContext(state,async()=>250000);
  assert.equal(JSON.stringify(after.messages),JSON.stringify(batch.messages));
  assert.equal(state.cacheBatches,undefined);
  assert.deepEqual(after.messages.filter(m=>m.role==="assistant"),batch.messages.filter(m=>m.role==="assistant"));
});
test("mixed one-hour and five-minute cache writes billed separately",()=>{
  assert.equal(usageCost({input:100,output:200,cacheRead:300,cacheWrite:1000,cacheWriteHour:400},{input:4,output:20,cacheRead:.2,cacheWrite:5}),.01066);
});
