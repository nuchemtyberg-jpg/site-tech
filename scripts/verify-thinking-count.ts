/** Read-only diagnostic. Only countTokens, never generation or requeue. */
import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db,pool } from "../server/db";
import { takeoffRuns } from "../shared/schema";
import { takeoffSystem } from "../server/takeoff/worker";
import { addCheckpointTurn,checkpointContext,freshCheckpointConversation,CONTEXT_BETA,defaultContextManagement } from "../server/takeoff/context";
import { TAKEOFF_TOOLS } from "../server/takeoff/tools";
import { sanitizeAnthropicError } from "../server/takeoff/anthropic-errors";
async function main(){
  const id=Number(process.argv[2]);if(!Number.isSafeInteger(id)||id<=0)throw Error("Supply a run ID");
  const [run]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,id));
  if(!run||run.status!=="failed")throw Error("Expected a failed run");
  const state=structuredClone(run.state),client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,maxRetries:0,timeout:60000});
  // This incident's first signed block preceded scale changes and checkpoints.
  // Reconstruct its historical system solely for compatibility verification.
  // New runs never put the changing checkpoint into system.
  if(state.job.categories.length)throw Error("Cannot reconstruct this legacy run's original job safely");
  const initial=structuredClone(state);initial.scales={};
  const system=state.systemSnapshot?takeoffSystem(state):[...takeoffSystem(initial),checkpointContext(initial)];
  const first=state.messages.slice(0,3) as any[];
  assert.ok(first[1]?.content?.some((b:any)=>b.type==="thinking"));
  const originalAssistant=structuredClone(first[1]);
  state.messages=first;state.job.notes+="\nCount-only checkpoint update test.";
  delete state.checkpointTurnStep;addCheckpointTurn(state);
  const pruned=structuredClone(state.messages) as any[];
  assert.deepEqual(pruned[1],originalAssistant);
  try{
    const result=await client.beta.messages.countTokens({model:state.settings.model,system,tools:TAKEOFF_TOOLS,messages:pruned,betas:[CONTEXT_BETA],context_management:defaultContextManagement() as any});
    console.log(JSON.stringify({test:"prior signed thinking + updated USER checkpoint + server context policy",accepted:true,inputTokens:result.input_tokens,generationRequests:0}));
    const fresh=structuredClone(run.state);freshCheckpointConversation(fresh,"Count-only recovery verification");
    fresh.systemSnapshot ||= JSON.stringify(takeoffSystem(fresh));
    const recovered=await client.messages.countTokens({model:fresh.settings.model,system:takeoffSystem(fresh),tools:TAKEOFF_TOOLS,messages:fresh.messages as any});
    console.log(JSON.stringify({test:"fresh checkpoint conversation",accepted:true,inputTokens:recovered.input_tokens,costPreserved:fresh.cost,generationRequests:0}));
  }catch(error){console.log(JSON.stringify(sanitizeAnthropicError(error,"messages.countTokens",state)));process.exitCode=1;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());
