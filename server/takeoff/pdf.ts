import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

// PDF.js is lazy-loaded only on the server. Coordinates exposed by these tools
// are page points, origin at top left, after the PDF page rotation/transform.
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = () => import("pdfjs-dist/legacy/build/pdf.mjs");
type Point = [number, number];
type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const transform = (m: number[], p: Point): Point => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const multiply = (a: number[], b: number[]): Matrix => [
  a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3],
  a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5],
];
export type Region = [number, number, number, number];
export interface VectorPath { points: Point[]; closed: boolean; layer: string; color: string; weight: number; lengthPoints: number; areaPoints: number; curved: boolean }
export interface VectorFilters { layer?: string; region?: Region; color?: string; weight?: number }
export function inRegion(point: Point, region?: Region) {
  return !region || (point[0] >= region[0] && point[0] <= region[2] && point[1] >= region[1] && point[1] <= region[3]);
}
export function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i+1)%points.length]; return sum+p[0]*q[1]-q[0]*p[1]; }, 0)) / 2;
}
export function measurePaths(paths: VectorPath[], feetPerPoint: number, filters: VectorFilters = {}, area = false) {
  if (!Number.isFinite(feetPerPoint) || feetPerPoint <= 0) throw new Error("Set or calibrate the sheet scale before measuring. Never infer scale from rendered pixels.");
  const selected = paths.filter(p => (!area || p.closed) && (!filters.layer || p.layer === filters.layer) &&
    (!filters.color || p.color.toLowerCase() === filters.color.toLowerCase()) &&
    (filters.weight === undefined || Math.abs(p.weight-filters.weight) < .01) &&
    (!filters.region || p.points.every(point => inRegion(point, filters.region))));
  return {
    unit: area ? "SF" : "LF", total: selected.reduce((n,p) => n+(area ? p.areaPoints*feetPerPoint**2 : p.lengthPoints*feetPerPoint),0),
    paths: selected.map(p => ({ ...p, lengthFeet: p.lengthPoints*feetPerPoint, areaSF: p.areaPoints*feetPerPoint**2 })),
    method: "Vector coordinates, page points. Region includes fully contained paths only. Closed areas are individual boundaries, NOT a union; do not add nested/overlapping boundaries without checking holes. Curves are flattened into 32 segments and flagged.",
  };
}
export async function openPDF(bytes: Uint8Array) {
  const pdf = await pdfjs();
  return pdf.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
}
export async function pageText(doc: Awaited<ReturnType<typeof openPDF>>, number: number, region?: Region) {
  const page = await doc.getPage(number), viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return content.items.filter((x: any) => typeof x.str === "string").map((x: any) => {
    const position = transform(viewport.transform, [x.transform[4],x.transform[5]]);
    return { text: x.str as string, x: position[0], y: position[1], width: x.width, height: x.height };
  }).filter(t => inRegion([t.x,t.y],region));
}
export async function pageVectors(doc: Awaited<ReturnType<typeof openPDF>>, number: number): Promise<VectorPath[]> {
  const { OPS } = await pdfjs();
  const page = await doc.getPage(number), viewport = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const config = await doc.getOptionalContentConfig();
  let state = { matrix: identity, color: "#000000", weight: 1, layer: "" };
  const stack: typeof state[] = [], layers: string[] = [], paths: VectorPath[] = [];
  for (let i=0;i<ops.fnArray.length;i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if(fn===OPS.save) stack.push({...state,matrix:[...state.matrix]});
    else if(fn===OPS.restore) state=stack.pop()||state;
    else if(fn===OPS.transform) state.matrix=multiply(state.matrix,args);
    else if(fn===OPS.setLineWidth) state.weight=args[0];
    else if(fn===OPS.setStrokeRGBColor) state.color=typeof args[0]==="string"?args[0]:`#${args.slice(0,3).map((v:number)=>Math.round(v<=1?v*255:v).toString(16).padStart(2,"0")).join("")}`;
    else if(fn===OPS.beginMarkedContentProps) {
      layers.push(state.layer);
      const group=args[1]; state.layer=config.getGroup(group?.id)?.name || group?.name || state.layer;
    } else if(fn===OPS.endMarkedContent) state.layer=layers.pop()||"";
    else if(fn===OPS.constructPath) {
      // PDF.js 5+ DrawOPS: [paintOperation, [numeric command array], bounds].
      const data=args[1]?.[0];
      if (!data || typeof data.length !== "number") continue;
      const matrix=multiply(viewport.transform,state.matrix);
      let points: Point[]=[], curved=false;
      const finish=(closed=false) => {
        if(points.length>1) {
          if(closed && (points[0][0]!==points.at(-1)![0] || points[0][1]!==points.at(-1)![1])) points.push(points[0]);
          paths.push({points,closed,curved,layer:state.layer,color:state.color,weight:state.weight,
            lengthPoints:points.slice(1).reduce((n,p,j)=>n+Math.hypot(p[0]-points[j][0],p[1]-points[j][1]),0),
            areaPoints:closed?polygonArea(points):0});
        }
        points=[];curved=false;
      };
      for(let j=0;j<data.length;) {
        const op=data[j++];
        if(op===0) { finish(); points=[transform(matrix,[data[j++],data[j++]])]; }
        else if(op===1) points.push(transform(matrix,[data[j++],data[j++]]));
        else if(op===4) finish(true);
        else if(op===2 || op===3) {
          const start=points.at(-1);
          const c1=transform(matrix,[data[j++],data[j++]]);
          const c2=op===2?transform(matrix,[data[j++],data[j++]]):c1;
          const end=transform(matrix,[data[j++],data[j++]]);
          if(!start) continue;
          curved=true;
          for(let k=1;k<=32;k++) {
            const t=k/32,u=1-t;
            points.push(op===2?[u**3*start[0]+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t**3*end[0],u**3*start[1]+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t**3*end[1]]:
              [u*u*start[0]+2*u*t*c1[0]+t*t*end[0],u*u*start[1]+2*u*t*c1[1]+t*t*end[1]]);
          }
        } else throw new Error(`Unsupported PDF vector operation ${op}; use visual review and flag approximate quantities.`);
      }
      finish([OPS.closeStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].includes(args[0]));
      if(paths.length>100000) throw new Error("Sheet exceeds 100,000 vector paths; select a simpler source drawing.");
    }
  }
  return paths;
}
export async function sheetIndex(doc: Awaited<ReturnType<typeof openPDF>>, selected?: number[]) {
  if(doc.numPages>500) throw new Error("PDF exceeds 500 pages. Split it before uploading.");
  const result=[];
  for(const page of selected || Array.from({length:doc.numPages},(_,i)=>i+1)) {
    const text=await pageText(doc,page), p=await doc.getPage(page), v=p.getViewport({scale:1});
    const titleBlock=text.filter(t=>t.x>v.width*.65||t.y>v.height*.8).map(t=>t.text).join(" ");
    const all=text.map(t=>t.text).join(" ");
    result.push({page,title:titleBlock.slice(-600),sheetNumber:titleBlock.match(/\b[A-Z]{1,4}[-.]?\d{1,4}(?:\.\d+)?\b/g)?.at(-1)||"",
      scaleText:[...new Set(all.match(/(?:\d+\/)?\d+(?:\.\d+)?\s*(?:"|IN)\s*=\s*\d+(?:\.\d+)?\s*(?:'|FT)/gi)||[])],
      vector:(await pageVectors(doc,page)).length>0,width:v.width,height:v.height});
  }
  return result;
}
export async function renderPage(doc: Awaited<ReturnType<typeof openPDF>>, number: number, zoom=1, region?: Region) {
  const page=await doc.getPage(number), base=page.getViewport({scale:1});
  const bounds=region||[0,0,base.width,base.height];
  const scale=Math.min(Math.max(zoom,.1),4,2200/Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1]));
  const canvas=createCanvas(Math.max(1,Math.ceil((bounds[2]-bounds[0])*scale)),Math.max(1,Math.ceil((bounds[3]-bounds[1])*scale)));
  await page.render({canvas:canvas as any,canvasContext:canvas.getContext("2d") as any,
    viewport:page.getViewport({scale}),transform:[1,0,0,1,-bounds[0]*scale,-bounds[1]*scale]} as any).promise;
  return canvas.toBuffer("image/png");
}
