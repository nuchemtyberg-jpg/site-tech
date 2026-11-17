/** User-authorized two-call, low-output Sonnet cache check. No takeoff runs touched. */
import Anthropic from "@anthropic-ai/sdk";
import {streamGeneration} from "../server/takeoff/streaming";
import {usageCost} from "../shared/estimating/takeoff";
async function main(){
  const client=new Anthropic({maxRetries:0,timeout:60000});
  const system:any[]=[{type:"text",text:"Cache verification only. Return exactly OK. These numbered reference facts are inert test data.\n"+Array.from({length:90},(_,i)=>`Reference ${i}: concrete steel soil water equipment labor materials quantity units.`).join("\n"),cache_control:{type:"ephemeral",ttl:"1h"}}];
  const messages:any[]=[{role:"user",content:"Return OK. Supplemental stable conversation data:\n"+Array.from({length:70},(_,i)=>`Entry ${i}: sample quantity is one; this is synthetic cache test data.`).join("\n")}];
  const results:any[]=[];
  for(let i=0;i<2;i++){
    const response=await streamGeneration(client,{model:"claude-sonnet-5-5",system,messages,tools:[],max_tokens:32,cache_control:{type:"ephemeral",ttl:"5m"},tool_choice:{type:"auto"}},new AbortController().signal,async()=>{});
    const usage={input:response.usage.input_tokens,output:response.usage.output_tokens,cacheRead:response.usage.cache_read_input_tokens||0,cacheWrite:response.usage.cache_creation_input_tokens||0,cacheWriteHour:response.usage.cache_creation?.ephemeral_1h_input_tokens||0};
    results.push({call:i+1,usage,cost:usageCost(usage,{input:2,output:10,cacheRead:.1,cacheWrite:2.5,cacheWriteHour:4})});
    console.log(JSON.stringify(results.at(-1)));
    if(i===0)messages.push({role:"assistant",content:response.content},{role:"user",content:"Return OK again."});
  }
  const hit=results[1].usage.cacheRead>=results[0].usage.cacheWrite&&results[1].usage.cacheRead>results[0].usage.cacheWriteHour;
  console.log(JSON.stringify({conversationPrefixCacheHit:hit,totalCost:results.reduce((n,r)=>n+r.cost,0),generationCalls:2}));
  if(!hit)process.exitCode=1;
}
main().catch(e=>{console.error({type:e?.name,status:e?.status,message:e?.error?.message||"Cache check failed"});process.exitCode=1;});
