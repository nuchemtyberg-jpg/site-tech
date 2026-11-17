/** Authorized cheap synthetic signed-thinking/context-edit check; cap $0.25.
 * No project run is created, resumed or modified. */
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import {streamGeneration} from "../server/takeoff/streaming";
import {CONTEXT_BETA} from "../server/takeoff/context";
import {usageCost} from "../shared/estimating/takeoff";
async function main(){
  const client=new Anthropic({maxRetries:0,timeout:60000});
  const tools:any[]=[{name:"lookup",description:"Get synthetic candidates or constraints. Request one kind at a time.",input_schema:{type:"object",properties:{kind:{type:"string",enum:["candidates","constraints"]}},required:["kind"]}}];
  const messages:any[]=[{role:"user",content:"Find the cheapest feasible candidate. First lookup candidates. On the next response lookup constraints. Make only one lookup per response, and provide a short progress update before each. After both lookups compare candidates and give only the winning candidate and cost. No other tools are needed."}];
  const system:any[]=[{type:"text",text:"You solve synthetic constrained optimization tests. Be careful about feasibility. Use tools to obtain missing facts and retain what you learn. "+Array.from({length:50},(_,i)=>`Rule ${i}: do not assume missing facts; check stated limits.`).join("\n"),cache_control:{type:"ephemeral",ttl:"1h"}}];
  const context_management:any={edits:[{type:"clear_thinking_20251015",keep:"all"},{type:"clear_tool_uses_20250919",trigger:{type:"tool_uses",value:1},keep:{type:"tool_uses",value:1},clear_at_least:{type:"input_tokens",value:1}}]};
  let spent=0,signed=0,cleared=false;
  for(let step=1;step<=3;step++){
    const base:any={model:"claude-opus-5-5",system,tools,messages,betas:[CONTEXT_BETA],context_management,thinking:{type:"adaptive",display:"summarized"},output_config:{effort:"high"}};
    const counted=await client.beta.messages.countTokens(base);
    const reserve=counted.input_tokens*8*1.05/1e6+1024*20/1e6;
    assert.ok(spent+reserve<=.25,"No call may exceed the $0.25 test cap");
    const response:any=await streamGeneration(client,{...base,max_tokens:1024,cache_control:{type:"ephemeral",ttl:"1h"}},new AbortController().signal,async()=>{});
    const u=response.usage,usage={input:u.input_tokens,output:u.output_tokens,cacheRead:u.cache_read_input_tokens||0,cacheWrite:u.cache_creation_input_tokens||0,cacheWriteHour:u.cache_creation?.ephemeral_1h_input_tokens||0};
    spent+=usageCost(usage,{input:4,output:20,cacheRead:.2,cacheWrite:5});
    const signedBefore=signed;
    signed+=response.content.filter((b:any)=>b.type==="thinking"&&b.signature).length;
    const edits=response.context_management?.applied_edits||[];
    if(signedBefore>0&&edits.some((e:any)=>e.cleared_tool_uses>0))cleared=true;
    console.log(JSON.stringify({step,cost:spent,usage,signedBlocks:signed,signedBlocksBeforeRequest:signedBefore,counted,edits}));
    messages.push({role:"assistant",content:response.content});
    if(step<3) {
      const calls=response.content.filter((b:any)=>b.type==="tool_use");
      assert.ok(calls.length,"Expected lookup tool");
      messages.push({role:"user",content:[...calls.map((c:any)=>({type:"tool_result",tool_use_id:c.id,content:JSON.stringify(c.input.kind==="candidates"
        ?{candidates:[{name:"A",cost:9,capacity:2},{name:"B",cost:12,capacity:4},{name:"C",cost:15,capacity:7}],notes:Array.from({length:600},(_,i)=>`Reference ${i}: synthetic test evidence only.`)}
        :{minimumCapacity:3,maximumCost:13})})),{type:"text",text:"Checkpoint: retain what you learned, request the next missing data or give the final result."}]});
    }
  }
  assert.ok(signed>0,"Need real signed thinking blocks");assert.ok(cleared,"Need successful generation with prior thinking and actual server-side clearing");
  console.log(JSON.stringify({success:true,totalCost:spent,signedBlocks:signed,serverClearingAccepted:true}));
}
main().catch(e=>{console.error({message:e?.error?.error?.message||e.message,status:e.status});process.exitCode=1;});
