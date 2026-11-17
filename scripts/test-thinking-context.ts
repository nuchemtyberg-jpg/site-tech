import test from "node:test";
import assert from "node:assert/strict";
import { takeoffSystem } from "../server/takeoff/worker";
import { addCheckpointTurn,freshCheckpointConversation,prepareContext,pruneToolResults } from "../server/takeoff/context";
import { emptyJob,ratesSchema } from "../shared/estimating/model";
import { aiSettingsSchema,type TakeoffState } from "../shared/estimating/takeoff";
test("mocked steps, checkpoint updates, pruning and restart preserve system bytes and every assistant block",async()=>{
  let s:TakeoffState={job:emptyJob(),documents:[],settings:aiSettingsSchema.parse({}),instructions:"Site work",trades:[],rules:[],playbook:{id:null,version:0,markdown:""},messages:[],scales:{},sheetIndexes:{},steps:0,cost:.4,budget:25,stepLimit:150,progress:[],usage:{input:0,output:0,cacheRead:0,cacheWrite:0}};
  s.originalRates=ratesSchema.parse(s.job);
  s.systemSnapshot=JSON.stringify(takeoffSystem(s));const frozen=s.systemSnapshot,assistants:any[]=[];
  for(let i=0;i<16;i++){
    s.steps=i;s.job.notes=`Checkpoint ${i}`;s.scales[`1:${i}`]={feetPerPoint:i+1,method:"verified"};
    addCheckpointTurn(s,i===15);
    const out=await prepareContext(s.messages,async messages=>{
      assert.equal(JSON.stringify(takeoffSystem(s)),frozen);
      assert.deepEqual(messages.filter((m:any)=>m.role==="assistant").map((m:any)=>m.content),assistants);
      assert.ok(!JSON.stringify(takeoffSystem(s)).includes(`Checkpoint ${i}`));
      assert.match(JSON.stringify(messages.at(-1)),new RegExp(`Checkpoint ${i}`));
      return 100;
    });
    assert.deepEqual(pruneToolResults(out.messages,0).filter((m:any)=>m.role==="assistant").map((m:any)=>m.content),assistants);
    const blocks=[{type:"thinking",thinking:`opaque ${i}`,signature:`signed-${i}`},{type:"redacted_thinking",data:`redacted-${i}`},{type:"text",text:"Working"},{type:"tool_use",id:`t${i}`,name:"checkpoint_takeoff",input:{job:s.job}}];
    assistants.push(structuredClone(blocks));s.messages.push({role:"assistant",content:structuredClone(blocks)},{role:"user",content:[{type:"tool_result",tool_use_id:`t${i}`,content:"saved"}]});
    s=JSON.parse(JSON.stringify(s)); // durable restart round trip
  }
  const original=structuredClone(s.messages);freshCheckpointConversation(s,"signature failure");
  assert.deepEqual(s.conversationArchives![0].messages,original);
  assert.equal(s.cost,.4);assert.equal(s.budget,25);assert.equal(s.systemSnapshot,frozen);
  assert.equal(s.messages.length,1);assert.match(JSON.stringify(s.messages),/Checkpoint 15/);
});
