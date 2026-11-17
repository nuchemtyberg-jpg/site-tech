import type { TakeoffState } from "@shared/estimating/takeoff";
export type AnthropicOperation = "models.retrieve" | "messages.countTokens" | "messages.create";
export function sanitizeAnthropicError(error: any, operation: AnthropicOperation, state: TakeoffState) {
  const body = error?.error?.error || error?.error;
  const safeNames=["APIConnectionTimeoutError","APIConnectionError","APIUserAbortError","AbortError","TakeoffStreamTimeout"];
  const name=safeNames.includes(error?.name)?error.name:"unknown_error";
  const safeCodes=["ECONNRESET","ECONNREFUSED","ETIMEDOUT","EPIPE","UND_ERR_CONNECT_TIMEOUT","UND_ERR_SOCKET","STREAM_IDLE_TIMEOUT","STREAM_OVERALL_TIMEOUT"];
  const code=safeCodes.includes(error?.code||error?.cause?.code)?(error.code||error.cause.code):null;
  let message = typeof body?.message === "string" ? body.message : name!=="unknown_error"?`${name}${code?` (${code})`:""}: generation connection interrupted.`:"Anthropic request failed without a structured error message.";
  // Only structured provider fields: never serialize SDK errors, headers, request
  // objects, keys or response bodies. Redact echoed request data and credentials.
  const strings: string[] = [];
  const collect = (value: unknown) => {
    if(typeof value==="string" && value.length>=8) strings.push(value);
    else if(Array.isArray(value)) value.forEach(collect);
    else if(value&&typeof value==="object") Object.values(value).forEach(collect);
  };
  collect(state.job); collect(state.messages); collect(state.documents); collect(state.instructions); collect(state.playbook); collect(state.rules);
  for(const text of strings.sort((a,b)=>b.length-a.length)) message=message.split(text).join("[request data redacted]");
  message=message.replace(/sk-ant-[\w-]+/gi,"[credential redacted]")
    .replace(/Bearer\s+\S+/gi,"Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi,"[URL redacted]")
    .replace(/(["'`])[^"'`\n]{100,}\1/g,"[quoted content redacted]").slice(0,2000);
  const identifier=(v:unknown)=>typeof v==="string"&&/^[a-zA-Z0-9_.:-]{1,200}$/.test(v)?v:null;
  return {operation,type:identifier(body?.type)||name,message,code,
    status:Number.isInteger(error?.status)?error.status:null,
    requestId:identifier(error?.request_id || error?.requestID || error?.headers?.get?.("request-id"))};
}
export class RecordedAnthropicError extends Error {
  constructor(public details: ReturnType<typeof sanitizeAnthropicError>) {
    super(`Anthropic rejected ${details.operation==="messages.countTokens"?"the token count":details.operation==="models.retrieve"?"the model lookup":"generation"}: ${details.message} (HTTP ${details.status??"unavailable"}; ${details.type}; request ${details.requestId??"unavailable"})`);
  }
  get status(){return this.details.status;}
}
export async function observedAnthropicCall<T>(operation:AnthropicOperation,state:TakeoffState,runId:number,save:(state:TakeoffState)=>Promise<unknown>,call:()=>Promise<T>) {
  const started=Date.now();
  try {return await call();}
  catch(error) {
    const details=sanitizeAnthropicError(error,operation,state),recorded=new RecordedAnthropicError(details);
    console.error(JSON.stringify({event:"takeoff.anthropic.error",runId,...details,durationMs:Date.now()-started}));
    state.progress.push({at:new Date().toISOString(),message:`${recorded.message} · ${(Date.now()-started)/1000}s`});
    state.progress=state.progress.slice(-300);
    await save(state);
    throw recorded;
  }
}
