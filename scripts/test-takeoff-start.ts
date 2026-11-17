/** No model calls: the fixture's pinned preparation is deliberately failed. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db,pool } from "../server/db";
import { files,customers,opportunities,takeoffRuns,takeoffDocumentPreparations,notifications } from "../shared/schema";
import { startRun } from "../server/takeoff/service";
import { pinDocument,getPreparation,cachedJSON,preparedDocument } from "../server/takeoff/preparation";
import { writePrivate } from "../server/takeoff/documents";
import { ObjectStorageService } from "../server/replit_integrations/object_storage/objectStorage";
const tag=`__start-${randomUUID()}`;
async function main() {
  let oid:number|undefined,cid:number|undefined,fid:number|undefined,object:string|undefined,snapshot:string|undefined,key:string|undefined;
  try {
    const [c]=await db.insert(customers).values({name:tag}).returning();cid=c.id;
    const [o]=await db.insert(opportunities).values({name:tag,opportunityNumber:tag,customerId:cid}).returning();oid=o.id;
    object=await writePrivate(Buffer.from("deliberately unreadable PDF"),"pdf","application/pdf");
    const [f]=await db.insert(files).values({name:"invalid.pdf",objectPath:object,contentType:"application/pdf",relatedEntityType:"opportunity",relatedEntityId:oid}).returning();fid=f.id;
    const pinned=await pinDocument(oid,fid,[1]);key=pinned.preparationKey;snapshot=pinned.snapshotPath;
    await db.update(takeoffDocumentPreparations).set({status:"failed",error:"Intentional test failure; must never contact Claude"}).where(eq(takeoffDocumentPreparations.key,key!));
    const input={requestKey:randomUUID(),documents:[{fileId:fid,pages:[1]}],approvedBudget:25,approvedSteps:150};
    const before=performance.now();
    const runs=await Promise.all([startRun(oid,tag,input),startRun(oid,tag,input),startRun(oid,tag,input)]);
    assert.equal(new Set(runs.map(r=>r.id)).size,1);
    assert.equal((await db.select().from(takeoffRuns).where(eq(takeoffRuns.opportunityId,oid))).length,1);
    await assert.rejects(startRun(oid,tag,{...input,instructions:"changed"}),/different selections/);
    assert.equal((await startRun(oid,tag,input)).id,runs[0].id);
    assert.equal((await getPreparation(key!)).sourceGeneration,pinned.sourceGeneration);
    await assert.rejects(preparedDocument(pinned),/Intentional test failure/);
    console.log(`PASS concurrent and repeated start returns one run, changed payload conflicts, pinned generation retained, preparation failure explicit (${Math.round(performance.now()-before)}ms including concurrent starts and retry checks)`);
    const actual=await pinDocument(157,310,Array.from({length:22},(_,i)=>i+1));
    const prep=await preparedDocument(actual);
    assert.equal(prep.manifest.pageCount,22);assert.equal(prep.manifest.pages.length,22);
    for(const page of prep.manifest.pages) {
      assert.ok(Array.isArray(await cachedJSON(page.textPath)));
      assert.ok(Array.isArray(await cachedJSON(page.vectorsPath)));
    }
    assert.equal((await pinDocument(157,310,[1])).preparationKey,actual.preparationKey);
    console.log("PASS exact 22-page source reuses immutable cache; every page text/vector cache readable; peak process+renderer upper bound MiB",prep.manifest.peakRssMiB);
  } finally {
    if(oid) await db.delete(takeoffRuns).where(eq(takeoffRuns.opportunityId,oid));
    await db.delete(notifications).where(eq(notifications.userId,tag));
    if(key) await db.delete(takeoffDocumentPreparations).where(eq(takeoffDocumentPreparations.key,key));
    if(fid) await db.delete(files).where(eq(files.id,fid));
    if(oid) await db.delete(opportunities).where(eq(opportunities.id,oid));
    if(cid) await db.delete(customers).where(eq(customers.id,cid));
    for(const path of [object,snapshot]) if(path) await(await new ObjectStorageService().getObjectEntityFile(path)).delete();
    await pool.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
