import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import {createServer} from "node:http";
import {setTimeout as delay} from "node:timers/promises";
import {streamGeneration,transientGenerationError} from "../server/takeoff/streaming";
test("final assembled message and signed blocks pass through without mutation",async()=>{
  const final={content:[{type:"thinking",thinking:"opaque",signature:"signed"},{type:"tool_use",id:"one",name:"evaluate",input:{formula:"1"}}],usage:{input_tokens:1,output_tokens:2,cache_creation_input_tokens:3,cache_read_input_tokens:4}};
  let listener:any;const phases:string[]=[];
  const client:any={messages:{stream:(_r:any,opts:any)=>({on:(_e:any,fn:any)=>{listener=fn;},abort:()=>{},finalMessage:async()=>{listener({delta:{type:"thinking_delta"}});return final;}})}};
  const result=await streamGeneration(client,{},new AbortController().signal,async p=>{phases.push(p);},{idle:100,overall:500});
  assert.strictEqual(result,final);assert.deepEqual(phases,["Claude is thinking…"]);
});
test("idle timeout aborts without returning partial content",async()=>{
  const client:any={messages:{stream:(_r:any,opts:any)=>({on:()=>{},abort:()=>{},finalMessage:()=>new Promise((_resolve,reject)=>opts.signal.addEventListener("abort",()=>reject(new Error("abort"))))})}};
  await assert.rejects(streamGeneration(client,{},new AbortController().signal,async()=>{},{idle:10,overall:100}),/idle timeout/);
});
test("retry classifier includes network, timeout and overload but not rejected inputs",()=>{
  for(const status of [undefined,429,500,502,503,529])assert.ok(transientGenerationError({status}));
  for(const status of [400,401,403,404])assert.equal(transientGenerationError({status}),false);
});
test("overall deadline still applies while stream events arrive",async()=>{
  let listener:any,timer:any;
  const client:any={messages:{stream:(_r:any,opts:any)=>({
    on:(_e:any,fn:any)=>{listener=fn;},
    abort:()=>clearInterval(timer),
    finalMessage:()=>new Promise((_resolve,reject)=>{
      timer=setInterval(()=>listener({delta:{type:"thinking_delta"}}),3);
      opts.signal.addEventListener("abort",()=>{clearInterval(timer);reject(new Error("aborted"));});
    }),
  })}};
  await assert.rejects(streamGeneration(client,{},new AbortController().signal,async()=>{},{idle:50,overall:25}),/overall timeout/);
});
test("user cancellation aborts a stream without producing a final message",async()=>{
  const abort=new AbortController();
  const client:any={messages:{stream:(_r:any,opts:any)=>({on:()=>{},abort:()=>{},finalMessage:()=>new Promise((_resolve,reject)=>{
    opts.signal.addEventListener("abort",()=>reject(Object.assign(new Error("cancelled"),{name:"APIUserAbortError"})));
    setTimeout(()=>abort.abort(),5);
  })})}};
  await assert.rejects(streamGeneration(client,{},abort.signal,async()=>{},{idle:50,overall:100}),/cancelled/);
});
test("official SDK assembles SSE thinking, tools and usage; ping bytes keep idle deadline alive",async()=>{
  const server=createServer(async(_req,res)=>{
    res.writeHead(200,{"content-type":"text/event-stream","request-id":"test-request"});
    const send=(event:any)=>res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    send({type:"message_start",message:{id:"test",type:"message",role:"assistant",model:"test-model",content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0,cache_creation_input_tokens:20,cache_read_input_tokens:30}}});
    for(let i=0;i<8;i++){await delay(30);send({type:"ping"});}
    send({type:"content_block_start",index:0,content_block:{type:"thinking",thinking:"",signature:""}});
    send({type:"content_block_delta",index:0,delta:{type:"thinking_delta",thinking:"opaque fixture"}});
    send({type:"content_block_delta",index:0,delta:{type:"signature_delta",signature:"signed-fixture"}});
    send({type:"content_block_stop",index:0});
    send({type:"content_block_start",index:1,content_block:{type:"tool_use",id:"tool",name:"evaluate",input:{}}});
    send({type:"content_block_delta",index:1,delta:{type:"input_json_delta",partial_json:'{"formula":"1"}'}});
    send({type:"content_block_stop",index:1});
    send({type:"message_delta",delta:{stop_reason:"tool_use",stop_sequence:null},usage:{output_tokens:5},context_management:{applied_edits:[{type:"clear_tool_uses_20250919",cleared_tool_uses:2,cleared_input_tokens:300}]}});
    send({type:"message_stop"});res.end();
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const port=(server.address() as any).port;
    const client=new Anthropic({apiKey:"local-test-placeholder",baseURL:`http://127.0.0.1:${port}`,maxRetries:0});
    const final=await streamGeneration(client,{model:"test-model",max_tokens:10,messages:[{role:"user",content:"test"}],betas:["context-management-2025-06-27"],context_management:{edits:[{type:"clear_tool_uses_20250919"}]}},new AbortController().signal,async()=>{},{idle:150,overall:3000});
    assert.deepEqual(final.content,[{type:"thinking",thinking:"opaque fixture",signature:"signed-fixture"},{type:"tool_use",id:"tool",name:"evaluate",input:{formula:"1"}}]);
    assert.equal(final.usage.input_tokens,10);assert.equal(final.usage.output_tokens,5);
    assert.equal(final.usage.cache_creation_input_tokens,20);assert.equal(final.usage.cache_read_input_tokens,30);
    assert.equal((final as any).context_management.applied_edits[0].cleared_tool_uses,2);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
