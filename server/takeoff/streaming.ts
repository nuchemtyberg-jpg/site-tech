import type Anthropic from "@anthropic-ai/sdk";

export const GENERATION_TIMEOUT_MS=15*60*1000;
export const IDLE_TIMEOUT_MS=120000;
/** Stream transport bytes (including SSE pings) reset the idle deadline.
 * Only finalMessage is returned; partial content never enters durable history. */
export async function streamGeneration(client:Anthropic,request:any,signal:AbortSignal,
  progress:(phase:string)=>Promise<void>,limits={overall:GENERATION_TIMEOUT_MS,idle:IDLE_TIMEOUT_MS}) {
  const controller=new AbortController();
  let timeoutError:Error|undefined,idle:ReturnType<typeof setTimeout>,stream:any;
  const expire=(kind:string)=>{
    timeoutError=Object.assign(new Error(`Generation ${kind} timeout`),{name:"TakeoffStreamTimeout",code:kind==="idle"?"STREAM_IDLE_TIMEOUT":"STREAM_OVERALL_TIMEOUT"});
    controller.abort();stream?.abort();
  };
  const reset=()=>{clearTimeout(idle);idle=setTimeout(()=>expire("idle"),limits.idle);};
  const overall=setTimeout(()=>expire("overall"),limits.overall);
  const cancel=()=>{controller.abort();stream?.abort();};
  signal.addEventListener("abort",cancel,{once:true});
  let updates=Promise.resolve(),lastUpdate=0;
  try {
    if(signal.aborted) controller.abort();
    reset();
    const transport=typeof client.withOptions==="function"?client.withOptions({fetch:async(input,init)=>{
      const response=await fetch(input,init);
      reset();
      if(!response.body||!response.headers.get("content-type")?.includes("text/event-stream"))return response;
      const body=response.body.pipeThrough(new TransformStream({transform(chunk,out){reset();out.enqueue(chunk);}}));
      return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
    }}):client;
    const api=request.context_management?(transport.beta?.messages||transport.messages):transport.messages;
    stream=(api as any).stream(request,{signal:controller.signal,timeout:limits.overall});
    stream.on("streamEvent",(event:any)=>{
      reset();
      if(Date.now()-lastUpdate<10000)return;
      lastUpdate=Date.now();
      const thinking=event.content_block?.type==="thinking"||event.delta?.type==="thinking_delta";
      updates=updates.then(()=>progress(thinking?"Claude is thinking…":"Claude is writing…")).catch(()=>{cancel();});
    });
    const message=await stream.finalMessage();
    await updates;
    if(timeoutError)throw timeoutError;
    if(controller.signal.aborted)throw Object.assign(new Error("Generation aborted"),{name:"APIUserAbortError"});
    return message as Anthropic.Message;
  } catch(error) {throw timeoutError||error;}
  finally {clearTimeout(idle!);clearTimeout(overall);signal.removeEventListener("abort",cancel);}
}
export function transientGenerationError(error:any) {
  const status=error?.status;
  return !status||status===429||status>=500;
}
