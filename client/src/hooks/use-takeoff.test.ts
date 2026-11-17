import { afterEach, describe, expect, it, vi } from "vitest";
import { takeoffRequest } from "./use-takeoff";
afterEach(()=>vi.unstubAllGlobals());
describe("takeoff HTTP responses",()=>{
  it.each([[502,""],[503,"<html>unavailable</html>"],[200,""],[200,"{\"id\":"]])("reports HTTP %s for incomplete/non-JSON response",async(status,body)=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(body,{status:status as number})));
    await expect(takeoffRequest("/test")).rejects.toThrow(`HTTP ${status}`);
  });
  it("preserves application errors and returns successful JSON",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response('{"message":"Document too large"}',{status:413}))
      .mockResolvedValueOnce(new Response('{"id":42}',{status:201})));
    await expect(takeoffRequest("/test")).rejects.toThrow("HTTP 413: Document too large");
    expect(await takeoffRequest("/test")).toEqual({id:42});
  });
});
