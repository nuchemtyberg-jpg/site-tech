import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { observedAnthropicCall, RecordedAnthropicError, sanitizeAnthropicError } from "../server/takeoff/anthropic-errors";
import type { TakeoffState } from "../shared/estimating/takeoff";
import { emptyJob } from "../shared/estimating/model";
const state=()=>({job:emptyJob(),messages:[],documents:[],instructions:"Confidential drawing instructions",playbook:{markdown:"Private playbook contents"},rules:[],progress:[]} as unknown as TakeoffState);
test("real SDK timeout and connection errors retain safe classifications",()=>{
  const timeout=sanitizeAnthropicError(new Anthropic.APIConnectionTimeoutError(),"messages.create",state());
  assert.equal(timeout.type,"APIConnectionTimeoutError");
  const reset=sanitizeAnthropicError(new Anthropic.APIConnectionError({cause:Object.assign(new Error("secret raw transport text"),{code:"ECONNRESET"})}),"messages.create",state());
  assert.equal(reset.type,"APIConnectionError");assert.equal(reset.code,"ECONNRESET");
  assert.doesNotMatch(reset.message,/secret raw/);
});
for(const operation of ["models.retrieve","messages.countTokens","messages.create"] as const) {
  test(`${operation} retains sanitized structured error and persists before throwing`,async()=>{
    const s=state();let saved=false;const logs:string[]=[];const previous=console.error;
    console.error=(message:string)=>logs.push(message);
    try {
      await assert.rejects(observedAnthropicCall(operation,s,33,async()=>{saved=true;},async()=>{
        throw {status:400,request_id:"req_test",error:{error:{type:"invalid_request_error",message:"Your credit balance is too low to access the Anthropic API."}},headers:{authorization:"sk-ant-test-secret"}};
      }),error=>error instanceof RecordedAnthropicError&&error.status===400&&error.details.requestId==="req_test");
      assert.ok(saved);assert.match(s.progress[0].message,/credit balance/);
      assert.equal(JSON.parse(logs[0]).operation,operation);assert.ok(!logs[0].includes("sk-ant"));
    } finally {console.error=previous;}
  });
}
test("redacts echoed document data and credentials; ignores raw SDK message/stack",()=>{
  const s=state();s.job.notes="Secret project quantities";
  const result=sanitizeAnthropicError({status:400,error:{type:"invalid_request_error",message:"Rejected Secret project quantities sk-ant-fake-private Bearer token https://example.test/private"}}, "messages.countTokens",s);
  assert.ok(!result.message.includes("Secret project"));assert.ok(!result.message.includes("sk-ant"));assert.ok(!result.message.includes("example.test"));
  assert.equal(sanitizeAnthropicError({message:"raw request with private content"},"messages.create",s).message,"Anthropic request failed without a structured error message.");
});
