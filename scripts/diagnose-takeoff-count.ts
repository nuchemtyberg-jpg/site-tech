/** Explicitly count-only: never execute the worker or messages.create. */
import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db,pool } from "../server/db";
import { takeoffRuns } from "../shared/schema";
import { takeoffSystem } from "../server/takeoff/worker";
import { addCheckpointTurn,prepareContext } from "../server/takeoff/context";
import { TAKEOFF_TOOLS } from "../server/takeoff/tools";
import { observedAnthropicCall,RecordedAnthropicError } from "../server/takeoff/anthropic-errors";
async function main() {
  const id=Number(process.argv[2]);if(!Number.isSafeInteger(id)||id<=0) throw new Error("Supply a run ID");
  const [run]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,id));
  if(!run||run.status!=="failed") throw new Error("Diagnostic requires an existing failed run.");
  const state=structuredClone(run.state);
  if(state.steps!==0) throw new Error("This first-request diagnostic requires step 0.");
  state.systemSnapshot ||= JSON.stringify(takeoffSystem(state));
  addCheckpointTurn(state);
  const save=async()=>{
    await db.update(takeoffRuns).set({state,updatedAt:new Date()})
      .where(and(eq(takeoffRuns.id,id),eq(takeoffRuns.status,"failed")));
  };
  const client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,maxRetries:0,timeout:60000});
  try {
    const result=await prepareContext(state.messages,async messages=>{
      const count=await observedAnthropicCall("messages.countTokens",state,id,save,()=>client.messages.countTokens({
        model:state.settings.model,system:takeoffSystem(state),tools:TAKEOFF_TOOLS,messages,
      }));
      return count.input_tokens;
    },state.modelLimits?.input||172000);
    console.log(JSON.stringify({operation:"messages.countTokens",success:true,inputTokens:result.inputTokens,generationRequests:0}));
    state.progress.push({at:new Date().toISOString(),message:`Count-only diagnostic succeeded: ${result.inputTokens} input tokens. No generation requested; run remains failed until explicitly retried.`});
    await save();
  } catch(error) {
    if(error instanceof RecordedAnthropicError) {
      await db.update(takeoffRuns).set({error:error.message}).where(and(eq(takeoffRuns.id,id),eq(takeoffRuns.status,"failed")));
      console.log(JSON.stringify(error.details));
    } else throw error;
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Diagnostic failed");process.exitCode=1}).finally(()=>pool.end());
