import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight,
  Pencil,
  Highlighter,
  Type,
  Eraser,
  RotateCcw
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  onClose?: () => void;
}

type MarkupTool = "none" | "draw" | "highlight" | "text" | "eraser";

interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  tool: "draw" | "highlight";
}

interface TextAnnotation {
  x: number;
  y: number;
  text: string;
  page: number;
}

export function PDFViewer({ url }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [activeTool, setActiveTool] = useState<MarkupTool>("none");
  const [paths, setPaths] = useState<Map<number, DrawPath[]>>(new Map());
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const lastTouchDistance = useRef<number | null>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const zoomIn = () => setScale(s => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));
  const prevPage = () => setPageNumber(p => Math.max(p - 1, 1));
  const nextPage = () => setPageNumber(p => Math.min(p + 1, numPages));

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistance.current = distance;
    } else if (e.touches.length === 1 && activeTool !== "none") {
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (touch.clientX - rect.left) / scale;
        const y = (touch.clientY - rect.top) / scale;
        setIsDrawing(true);
        setCurrentPath([{ x, y }]);
      }
    }
  }, [activeTool, scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance.current) {
      e.preventDefault();
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = distance - lastTouchDistance.current;
      if (Math.abs(delta) > 10) {
        setScale(s => Math.max(0.5, Math.min(3, s + delta * 0.005)));
        lastTouchDistance.current = distance;
      }
    } else if (e.touches.length === 1 && isDrawing && activeTool !== "none" && activeTool !== "text") {
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (touch.clientX - rect.left) / scale;
        const y = (touch.clientY - rect.top) / scale;
        setCurrentPath(prev => [...prev, { x, y }]);
      }
    }
  }, [isDrawing, activeTool, scale]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = null;
    if (isDrawing && currentPath.length > 0 && (activeTool === "draw" || activeTool === "highlight")) {
      const newPath: DrawPath = {
        points: currentPath,
        color: activeTool === "highlight" ? "rgba(255, 255, 0, 0.4)" : "#f97316",
        width: activeTool === "highlight" ? 20 : 3,
        tool: activeTool
      };
      setPaths(prev => {
        const updated = new Map(prev);
        const existing = updated.get(pageNumber) || [];
        updated.set(pageNumber, [...existing, newPath]);
        return updated;
      });
    }
    setIsDrawing(false);
    setCurrentPath([]);
  }, [isDrawing, currentPath, activeTool, pageNumber]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === "none") return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      
      if (activeTool === "text") {
        const text = prompt("Enter text:");
        if (text) {
          setTextAnnotations(prev => [...prev, { x, y, text, page: pageNumber }]);
        }
      } else if (activeTool === "eraser") {
        setPaths(prev => {
          const updated = new Map(prev);
          updated.set(pageNumber, []);
          return updated;
        });
        setTextAnnotations(prev => prev.filter(t => t.page !== pageNumber));
      } else {
        setIsDrawing(true);
        setCurrentPath([{ x, y }]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || activeTool === "none" || activeTool === "text") return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      setCurrentPath(prev => [...prev, { x, y }]);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentPath.length > 0 && (activeTool === "draw" || activeTool === "highlight")) {
      const newPath: DrawPath = {
        points: currentPath,
        color: activeTool === "highlight" ? "rgba(255, 255, 0, 0.4)" : "#f97316",
        width: activeTool === "highlight" ? 20 : 3,
        tool: activeTool
      };
      setPaths(prev => {
        const updated = new Map(prev);
        const existing = updated.get(pageNumber) || [];
        updated.set(pageNumber, [...existing, newPath]);
        return updated;
      });
    }
    setIsDrawing(false);
    setCurrentPath([]);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scale, scale);

    const pagePaths = paths.get(pageNumber) || [];
    for (const path of pagePaths) {
      if (path.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    }

    if (currentPath.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = activeTool === "highlight" ? "rgba(255, 255, 0, 0.4)" : "#f97316";
      ctx.lineWidth = activeTool === "highlight" ? 20 : 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }

    const pageTexts = textAnnotations.filter(t => t.page === pageNumber);
    for (const t of pageTexts) {
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#f97316";
      ctx.fillText(t.text, t.x, t.y);
    }

    ctx.restore();
  }, [paths, currentPath, textAnnotations, pageNumber, scale, activeTool]);

  const clearAllMarkups = () => {
    setPaths(new Map());
    setTextAnnotations([]);
  };

  const pageWidth = containerWidth > 0 ? Math.min(containerWidth - 32, 800) : 600;

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-gray-800 border-b flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={zoomOut} data-testid="button-zoom-out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={zoomIn} data-testid="button-zoom-in">
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={prevPage} disabled={pageNumber <= 1} data-testid="button-prev-page">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm min-w-[4rem] text-center">{pageNumber} / {numPages}</span>
          <Button variant="ghost" size="icon" onClick={nextPage} disabled={pageNumber >= numPages} data-testid="button-next-page">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button 
            variant={activeTool === "draw" ? "default" : "ghost"} 
            size="icon" 
            onClick={() => setActiveTool(activeTool === "draw" ? "none" : "draw")}
            data-testid="button-tool-draw"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button 
            variant={activeTool === "highlight" ? "default" : "ghost"} 
            size="icon" 
            onClick={() => setActiveTool(activeTool === "highlight" ? "none" : "highlight")}
            data-testid="button-tool-highlight"
          >
            <Highlighter className="w-4 h-4" />
          </Button>
          <Button 
            variant={activeTool === "text" ? "default" : "ghost"} 
            size="icon" 
            onClick={() => setActiveTool(activeTool === "text" ? "none" : "text")}
            data-testid="button-tool-text"
          >
            <Type className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setActiveTool("eraser")}
            data-testid="button-tool-eraser"
          >
            <Eraser className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={clearAllMarkups}
            data-testid="button-clear-all"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div 
        className="flex-1 overflow-auto flex justify-center p-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
          className="relative"
          style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
        >
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="p-8 text-center">Loading PDF...</div>}
            error={<div className="p-8 text-center text-red-500">Failed to load PDF</div>}
          >
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
          <canvas
            ref={canvasRef}
            width={pageWidth * scale}
            height={(pageWidth * 1.4) * scale}
            className="absolute top-0 left-0 pointer-events-auto"
            style={{ width: pageWidth, height: pageWidth * 1.4 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
      </div>
    </div>
  );
}
