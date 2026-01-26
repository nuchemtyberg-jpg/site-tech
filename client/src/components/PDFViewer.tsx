import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { 
  ZoomIn, 
  ZoomOut, 
  Pencil,
  Highlighter,
  Type,
  Eraser,
  RotateCcw,
  Square,
  ArrowRight,
  Minus,
  Undo2,
  Redo2,
  Save,
  X,
  Share2,
  Download,
  Move,
  FileDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PDFDocument, rgb } from "pdf-lib";

// Detect if running on iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

interface PDFViewerProps {
  url: string;
  fileName: string;
  onClose: () => void;
  onShare: () => void;
}

type MarkupTool = "none" | "pen" | "highlighter" | "text" | "eraser" | "rectangle" | "arrow" | "line" | "select";

interface DrawPath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  tool: "pen" | "highlighter";
  page: number;
}

interface ShapeAnnotation {
  id: string;
  type: "rectangle" | "arrow" | "line";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  width: number;
  page: number;
}

interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  page: number;
}

type Annotation = DrawPath | ShapeAnnotation | TextAnnotation;

const COLORS = ["#f97316", "#ef4444", "#22c55e", "#3b82f6", "#8b5cf6", "#000000"];
const THICKNESSES = [2, 4, 6, 8];

export function PDFViewer({ url, fileName, onClose, onShare }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<MarkupTool>("none");
  const [selectedColor, setSelectedColor] = useState("#f97316");
  const [selectedThickness, setSelectedThickness] = useState(4);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showThicknessPicker, setShowThicknessPicker] = useState(false);
  
  const storageKey = `pdf-annotations-${encodeURIComponent(url)}`;
  
  const loadSavedAnnotations = (): { paths: DrawPath[]; shapes: ShapeAnnotation[]; texts: TextAnnotation[] } => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          paths: parsed.paths || [],
          shapes: parsed.shapes || [],
          texts: parsed.texts || []
        };
      }
    } catch (e) {
      console.error("Failed to load annotations:", e);
    }
    return { paths: [], shapes: [], texts: [] };
  };
  
  const savedData = loadSavedAnnotations();
  const initialState: Annotation[] = [...savedData.paths, ...savedData.shapes, ...savedData.texts];
  const [paths, setPaths] = useState<DrawPath[]>(savedData.paths);
  const [shapes, setShapes] = useState<ShapeAnnotation[]>(savedData.shapes);
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>(savedData.texts);
  const [history, setHistory] = useState<Annotation[][]>([initialState]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isRestoringRef = useRef(false);
  
  const pathsRef = useRef(paths);
  const shapesRef = useRef(shapes);
  const textsRef = useRef(textAnnotations);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  
  useEffect(() => { pathsRef.current = paths; }, [paths]);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { textsRef.current = textAnnotations; }, [textAnnotations]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [currentShape, setCurrentShape] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState({ x: 0, y: 0 });
  const lastTouchDistance = useRef<number | null>(null);
  const lastTapTime = useRef<number>(0);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const applyAnnotationChange = useCallback((
    change: {
      paths?: DrawPath[] | ((prev: DrawPath[]) => DrawPath[]);
      shapes?: ShapeAnnotation[] | ((prev: ShapeAnnotation[]) => ShapeAnnotation[]);
      texts?: TextAnnotation[] | ((prev: TextAnnotation[]) => TextAnnotation[]);
    }
  ) => {
    if (isRestoringRef.current) return;
    
    const currentPaths = pathsRef.current;
    const currentShapes = shapesRef.current;
    const currentTexts = textsRef.current;
    const currentHistoryIndex = historyIndexRef.current;
    
    const newPaths = change.paths !== undefined 
      ? (typeof change.paths === 'function' ? change.paths(currentPaths) : change.paths)
      : currentPaths;
    const newShapes = change.shapes !== undefined
      ? (typeof change.shapes === 'function' ? change.shapes(currentShapes) : change.shapes)
      : currentShapes;
    const newTexts = change.texts !== undefined
      ? (typeof change.texts === 'function' ? change.texts(currentTexts) : change.texts)
      : currentTexts;
    
    const newState: Annotation[] = [...newPaths, ...newShapes, ...newTexts];
    
    pathsRef.current = newPaths;
    shapesRef.current = newShapes;
    textsRef.current = newTexts;
    
    setHistory(prev => {
      const newHistory = prev.slice(0, currentHistoryIndex + 1);
      newHistory.push(newState);
      historyRef.current = newHistory;
      return newHistory;
    });
    
    const newIndex = currentHistoryIndex + 1;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    
    setPaths(newPaths);
    setShapes(newShapes);
    setTextAnnotations(newTexts);
    setHasUnsavedChanges(true);
  }, []);

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx > 0) {
      isRestoringRef.current = true;
      const prevState = hist[idx - 1];
      const newPaths = prevState.filter((a): a is DrawPath => 'points' in a);
      const newShapes = prevState.filter((a): a is ShapeAnnotation => 'startX' in a && 'type' in a);
      const newTexts = prevState.filter((a): a is TextAnnotation => 'text' in a && !('points' in a));
      
      pathsRef.current = newPaths;
      shapesRef.current = newShapes;
      textsRef.current = newTexts;
      historyIndexRef.current = idx - 1;
      
      setPaths(newPaths);
      setShapes(newShapes);
      setTextAnnotations(newTexts);
      setHistoryIndex(idx - 1);
      
      setTimeout(() => { isRestoringRef.current = false; }, 0);
    }
  }, []);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx < hist.length - 1) {
      isRestoringRef.current = true;
      const nextState = hist[idx + 1];
      const newPaths = nextState.filter((a): a is DrawPath => 'points' in a);
      const newShapes = nextState.filter((a): a is ShapeAnnotation => 'startX' in a && 'type' in a);
      const newTexts = nextState.filter((a): a is TextAnnotation => 'text' in a && !('points' in a));
      
      pathsRef.current = newPaths;
      shapesRef.current = newShapes;
      textsRef.current = newTexts;
      historyIndexRef.current = idx + 1;
      
      setPaths(newPaths);
      setShapes(newShapes);
      setTextAnnotations(newTexts);
      setHistoryIndex(idx + 1);
      
      setTimeout(() => { isRestoringRef.current = false; }, 0);
    }
  }, []);

  const clearAll = useCallback(() => {
    applyAnnotationChange({ paths: [], shapes: [], texts: [] });
  }, [applyAnnotationChange]);

  const saveAnnotations = useCallback(() => {
    try {
      const data = { paths, shapes, texts: textAnnotations };
      localStorage.setItem(storageKey, JSON.stringify(data));
      setHasUnsavedChanges(false);
    } catch (e) {
      console.error("Failed to save annotations:", e);
    }
  }, [paths, shapes, textAnnotations, storageKey]);

  useEffect(() => {
    if (paths.length > 0 || shapes.length > 0 || textAnnotations.length > 0) {
      setHasUnsavedChanges(true);
    }
  }, [paths, shapes, textAnnotations]);

  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 };
  };

  const exportAnnotatedPdf = useCallback(async () => {
    try {
      const response = await fetch(url);
      const existingPdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      const scaleX = width / canvasWidth;
      const scaleY = height / canvasHeight;

      for (const path of paths) {
        if (path.points.length < 2) continue;
        const color = hexToRgb(path.color.replace(/[0-9a-f]{2}$/i, ''));
        const opacity = path.tool === 'highlighter' ? 0.4 : 1;
        
        for (let i = 1; i < path.points.length; i++) {
          const x1 = path.points[i - 1].x * scaleX;
          const y1 = height - (path.points[i - 1].y * scaleY);
          const x2 = path.points[i].x * scaleX;
          const y2 = height - (path.points[i].y * scaleY);
          
          firstPage.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: path.width * scaleX,
            color: rgb(color.r, color.g, color.b),
            opacity
          });
        }
      }

      for (const shape of shapes) {
        const color = hexToRgb(shape.color);
        const x1 = shape.startX * scaleX;
        const y1 = height - (shape.startY * scaleY);
        const x2 = shape.endX * scaleX;
        const y2 = height - (shape.endY * scaleY);

        if (shape.type === 'rectangle') {
          firstPage.drawRectangle({
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
            borderColor: rgb(color.r, color.g, color.b),
            borderWidth: shape.width * scaleX
          });
        } else if (shape.type === 'line' || shape.type === 'arrow') {
          firstPage.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: shape.width * scaleX,
            color: rgb(color.r, color.g, color.b)
          });
        }
      }

      for (const text of textAnnotations) {
        const color = hexToRgb(text.color);
        const x = text.x * scaleX;
        const y = height - (text.y * scaleY);
        
        firstPage.drawText(text.text, {
          x,
          y,
          size: text.fontSize * scaleX,
          color: rgb(color.r, color.g, color.b)
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName.replace('.pdf', '-annotated.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error("Failed to export annotated PDF:", e);
    }
  }, [url, fileName, paths, shapes, textAnnotations]);

  const zoomIn = () => setScale(s => Math.min(s * 1.25, 6));
  const zoomOut = () => setScale(s => Math.max(s / 1.25, 0.5));
  const resetZoom = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

  const getEventPosition = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left - position.x) / scale,
      y: (clientY - rect.top - position.y) / scale
    };
  }, [scale, position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === "none" || activeTool === "select") {
      setIsPanning(true);
      setLastPanPosition({ x: e.clientX, y: e.clientY });
      return;
    }
    
    const pos = getEventPosition(e);
    
    if (activeTool === "text") {
      const text = prompt("Enter text annotation:");
      if (text) {
        const newText: TextAnnotation = {
          id: generateId(),
          x: pos.x,
          y: pos.y,
          text,
          color: selectedColor,
          fontSize: 16,
          page: 1
        };
        applyAnnotationChange({ texts: prev => [...prev, newText] });
      }
      return;
    }
    
    if (activeTool === "eraser") {
      const threshold = 20 / scale;
      const currentPaths = pathsRef.current;
      const currentShapes = shapesRef.current;
      const currentTexts = textsRef.current;
      
      const newPaths = currentPaths.filter(path => {
        return !path.points.some(point => 
          Math.abs(point.x - pos.x) < threshold && Math.abs(point.y - pos.y) < threshold
        );
      });
      const newShapes = currentShapes.filter(shape => {
        const minX = Math.min(shape.startX, shape.endX);
        const maxX = Math.max(shape.startX, shape.endX);
        const minY = Math.min(shape.startY, shape.endY);
        const maxY = Math.max(shape.startY, shape.endY);
        return !(pos.x >= minX - threshold && pos.x <= maxX + threshold && 
                 pos.y >= minY - threshold && pos.y <= maxY + threshold);
      });
      const newTexts = currentTexts.filter(text => {
        return !(Math.abs(text.x - pos.x) < threshold * 3 && Math.abs(text.y - pos.y) < threshold);
      });
      
      if (newPaths.length !== currentPaths.length || newShapes.length !== currentShapes.length || newTexts.length !== currentTexts.length) {
        applyAnnotationChange({ paths: newPaths, shapes: newShapes, texts: newTexts });
      }
      return;
    }
    
    if (activeTool === "pen" || activeTool === "highlighter") {
      setIsDrawing(true);
      setCurrentPath([pos]);
    } else if (activeTool === "rectangle" || activeTool === "arrow" || activeTool === "line") {
      setIsDrawing(true);
      setCurrentShape({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPosition.x;
      const dy = e.clientY - lastPanPosition.y;
      setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPosition({ x: e.clientX, y: e.clientY });
      return;
    }
    
    if (!isDrawing) return;
    
    const pos = getEventPosition(e);
    
    if (activeTool === "pen" || activeTool === "highlighter") {
      setCurrentPath(prev => [...prev, pos]);
    } else if (currentShape) {
      setCurrentShape(prev => prev ? { ...prev, endX: pos.x, endY: pos.y } : null);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    
    if (!isDrawing) return;
    
    if ((activeTool === "pen" || activeTool === "highlighter") && currentPath.length > 1) {
      const newPath: DrawPath = {
        id: generateId(),
        points: currentPath,
        color: activeTool === "highlighter" ? `${selectedColor}66` : selectedColor,
        width: activeTool === "highlighter" ? selectedThickness * 4 : selectedThickness,
        tool: activeTool,
        page: 1
      };
      applyAnnotationChange({ paths: prev => [...prev, newPath] });
    } else if (currentShape && (activeTool === "rectangle" || activeTool === "arrow" || activeTool === "line")) {
      const newShape: ShapeAnnotation = {
        id: generateId(),
        type: activeTool,
        ...currentShape,
        color: selectedColor,
        width: selectedThickness,
        page: 1
      };
      applyAnnotationChange({ shapes: prev => [...prev, newShape] });
    }
    
    setIsDrawing(false);
    setCurrentPath([]);
    setCurrentShape(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistance.current = distance;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTime.current < 300) {
        if (scale > 1) {
          resetZoom();
        } else {
          setScale(2);
        }
        lastTapTime.current = 0;
        return;
      }
      lastTapTime.current = now;
      
      if (activeTool === "none" || activeTool === "select") {
        setIsPanning(true);
        setLastPanPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      } else {
        const pos = getEventPosition(e);
        if (activeTool === "pen" || activeTool === "highlighter") {
          setIsDrawing(true);
          setCurrentPath([pos]);
        } else if (activeTool === "rectangle" || activeTool === "arrow" || activeTool === "line") {
          setIsDrawing(true);
          setCurrentShape({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
        }
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance.current) {
      e.preventDefault();
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = distance / lastTouchDistance.current;
      setScale(s => Math.max(0.5, Math.min(6, s * delta)));
      lastTouchDistance.current = distance;
    } else if (e.touches.length === 1) {
      if (isPanning) {
        const dx = e.touches[0].clientX - lastPanPosition.x;
        const dy = e.touches[0].clientY - lastPanPosition.y;
        setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastPanPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      } else if (isDrawing) {
        const pos = getEventPosition(e);
        if (activeTool === "pen" || activeTool === "highlighter") {
          setCurrentPath(prev => [...prev, pos]);
        } else if (currentShape) {
          setCurrentShape(prev => prev ? { ...prev, endX: pos.x, endY: pos.y } : null);
        }
      }
    }
  };

  const handleTouchEnd = () => {
    lastTouchDistance.current = null;
    handleMouseUp();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.scale(scale, scale);

    for (const path of paths) {
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
      ctx.strokeStyle = activeTool === "highlighter" ? `${selectedColor}66` : selectedColor;
      ctx.lineWidth = activeTool === "highlighter" ? selectedThickness * 4 : selectedThickness;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }

    for (const shape of shapes) {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;
      ctx.lineCap = "round";
      
      if (shape.type === "rectangle") {
        ctx.strokeRect(shape.startX, shape.startY, shape.endX - shape.startX, shape.endY - shape.startY);
      } else if (shape.type === "line") {
        ctx.beginPath();
        ctx.moveTo(shape.startX, shape.startY);
        ctx.lineTo(shape.endX, shape.endY);
        ctx.stroke();
      } else if (shape.type === "arrow") {
        ctx.beginPath();
        ctx.moveTo(shape.startX, shape.startY);
        ctx.lineTo(shape.endX, shape.endY);
        ctx.stroke();
        
        const angle = Math.atan2(shape.endY - shape.startY, shape.endX - shape.startX);
        const headLength = 15;
        ctx.beginPath();
        ctx.moveTo(shape.endX, shape.endY);
        ctx.lineTo(
          shape.endX - headLength * Math.cos(angle - Math.PI / 6),
          shape.endY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(shape.endX, shape.endY);
        ctx.lineTo(
          shape.endX - headLength * Math.cos(angle + Math.PI / 6),
          shape.endY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    }

    if (currentShape) {
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = selectedThickness;
      
      if (activeTool === "rectangle") {
        ctx.strokeRect(currentShape.startX, currentShape.startY, currentShape.endX - currentShape.startX, currentShape.endY - currentShape.startY);
      } else if (activeTool === "line") {
        ctx.beginPath();
        ctx.moveTo(currentShape.startX, currentShape.startY);
        ctx.lineTo(currentShape.endX, currentShape.endY);
        ctx.stroke();
      } else if (activeTool === "arrow") {
        ctx.beginPath();
        ctx.moveTo(currentShape.startX, currentShape.startY);
        ctx.lineTo(currentShape.endX, currentShape.endY);
        ctx.stroke();
        
        const angle = Math.atan2(currentShape.endY - currentShape.startY, currentShape.endX - currentShape.startX);
        const headLength = 15;
        ctx.beginPath();
        ctx.moveTo(currentShape.endX, currentShape.endY);
        ctx.lineTo(
          currentShape.endX - headLength * Math.cos(angle - Math.PI / 6),
          currentShape.endY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(currentShape.endX, currentShape.endY);
        ctx.lineTo(
          currentShape.endX - headLength * Math.cos(angle + Math.PI / 6),
          currentShape.endY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    }

    for (const text of textAnnotations) {
      ctx.font = `${text.fontSize}px sans-serif`;
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.x, text.y);
    }

    ctx.restore();
  }, [paths, shapes, textAnnotations, currentPath, currentShape, scale, position, activeTool, selectedColor, selectedThickness]);

  // Preload PDF as blob for faster display
  useEffect(() => {
    let cancelled = false;
    
    // Clean up previous blob URL if exists
    if (blobUrlRef.current && !blobUrlRef.current.startsWith("data:")) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    
    const loadPdf = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        setPdfBlobUrl(null);
        
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`Failed to load PDF: ${response.statusText}`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        
        // On iOS, use data URL instead of blob URL for better compatibility
        if (isIOS()) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (cancelled) return;
            const dataUrl = reader.result as string;
            blobUrlRef.current = dataUrl;
            setPdfBlobUrl(dataUrl);
            setIsLoading(false);
          };
          reader.onerror = () => {
            if (cancelled) return;
            setLoadError("Failed to read PDF file");
            setIsLoading(false);
          };
          reader.readAsDataURL(blob);
        } else {
          const blobUrl = URL.createObjectURL(blob);
          blobUrlRef.current = blobUrl;
          setPdfBlobUrl(blobUrl);
          setIsLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load PDF");
        setIsLoading(false);
      }
    };
    
    loadPdf();
    
    return () => {
      cancelled = true;
      // Only revoke blob URLs, not data URLs
      if (blobUrlRef.current && !blobUrlRef.current.startsWith("data:")) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, []);

  const toolButtons: { tool: MarkupTool; icon: typeof Pencil; label: string }[] = [
    { tool: "select", icon: Move, label: "Select/Pan" },
    { tool: "pen", icon: Pencil, label: "Pen" },
    { tool: "highlighter", icon: Highlighter, label: "Highlighter" },
    { tool: "rectangle", icon: Square, label: "Rectangle" },
    { tool: "arrow", icon: ArrowRight, label: "Arrow" },
    { tool: "line", icon: Minus, label: "Line" },
    { tool: "text", icon: Type, label: "Text" },
    { tool: "eraser", icon: Eraser, label: "Eraser" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col" data-testid="pdf-viewer-modal">
      {/* Top toolbar */}
      <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-gray-700"
          onClick={() => { 
            if (hasUnsavedChanges) saveAnnotations(); 
            onClose(); 
          }}
          data-testid="button-close-viewer"
        >
          <X className="w-5 h-5" />
        </Button>
        <span className="text-white text-sm font-medium truncate max-w-[200px]">{fileName}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-gray-700"
            onClick={onShare}
            data-testid="button-share-file"
          >
            <Share2 className="w-5 h-5" />
          </Button>
          <a
            href={url}
            download={fileName}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-white hover:bg-gray-700"
            title="Download original"
            data-testid="button-download-file"
          >
            <Download className="w-5 h-5" />
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-gray-700"
            onClick={exportAnnotatedPdf}
            title="Export annotated PDF"
            data-testid="button-export-annotated"
          >
            <FileDown className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute top-16 right-2 z-10 flex flex-col gap-1 bg-gray-800/80 rounded-lg p-1">
        <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700" onClick={zoomIn} data-testid="button-zoom-in">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <span className="text-white text-xs text-center py-1">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700" onClick={zoomOut} data-testid="button-zoom-out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-gray-700" onClick={resetZoom} data-testid="button-reset-zoom">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* PDF + Canvas container */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-gray-200"
        style={{ touchAction: "none" }}
      >
        {/* Loading state */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-600 text-sm">Loading PDF...</span>
            </div>
          </div>
        )}
        {/* Error state */}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-20">
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <div className="text-red-500 text-lg font-medium">Failed to load PDF</div>
              <span className="text-gray-600 text-sm">{loadError}</span>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
        <div 
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            width: "100%",
            height: "100%",
            visibility: isLoading || loadError ? "hidden" : "visible"
          }}
        >
          {/* Use object tag for iOS compatibility, iframe for others */}
          {isIOS() ? (
            <object
              data={pdfBlobUrl || ""}
              type="application/pdf"
              className="w-full h-full bg-white border-0 pointer-events-none"
              aria-label={fileName}
            >
              <embed
                src={pdfBlobUrl || ""}
                type="application/pdf"
                className="w-full h-full"
              />
            </object>
          ) : (
            <iframe
              ref={iframeRef}
              src={pdfBlobUrl || ""}
              title={fileName}
              className="w-full h-full bg-white border-0 pointer-events-none"
            />
          )}
        </div>
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute top-0 left-0 w-full h-full",
            activeTool === "none" || activeTool === "select" ? "cursor-grab" : "cursor-crosshair",
            isPanning && "cursor-grabbing",
            (isLoading || loadError) && "invisible"
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {/* Bottom markup toolbar */}
      <div className="bg-gray-800 border-t border-gray-700 p-2 safe-area-bottom">
        <div className="flex items-center justify-center gap-1 overflow-x-auto pb-1">
          {toolButtons.map(({ tool, icon: Icon, label }) => (
            <Button
              key={tool}
              variant={activeTool === tool ? "default" : "ghost"}
              size="icon"
              className={cn(
                "shrink-0",
                activeTool === tool ? "bg-primary" : "text-white hover:bg-gray-700"
              )}
              onClick={() => setActiveTool(activeTool === tool ? "none" : tool)}
              title={label}
              data-testid={`button-tool-${tool}`}
            >
              <Icon className="w-4 h-4" />
            </Button>
          ))}
          
          <div className="w-px h-6 bg-gray-600 mx-1" />
          
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-gray-700"
              onClick={() => { setShowColorPicker(!showColorPicker); setShowThicknessPicker(false); }}
              data-testid="button-color-picker"
            >
              <div className="w-5 h-5 rounded-full border-2 border-white" style={{ backgroundColor: selectedColor }} />
            </Button>
            {showColorPicker && (
              <div className="absolute bottom-full left-0 mb-2 p-2 bg-gray-800 rounded-lg shadow-lg flex gap-1">
                {COLORS.map(color => (
                  <button
                    key={color}
                    className={cn(
                      "w-6 h-6 rounded-full border-2",
                      selectedColor === color ? "border-white" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => { setSelectedColor(color); setShowColorPicker(false); }}
                    data-testid={`button-color-${color}`}
                  />
                ))}
              </div>
            )}
          </div>
          
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-gray-700"
              onClick={() => { setShowThicknessPicker(!showThicknessPicker); setShowColorPicker(false); }}
              data-testid="button-thickness-picker"
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <div className="rounded-full bg-white" style={{ width: selectedThickness * 2, height: selectedThickness * 2 }} />
              </div>
            </Button>
            {showThicknessPicker && (
              <div className="absolute bottom-full left-0 mb-2 p-2 bg-gray-800 rounded-lg shadow-lg flex gap-2">
                {THICKNESSES.map(thickness => (
                  <button
                    key={thickness}
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center",
                      selectedThickness === thickness ? "bg-gray-600" : "hover:bg-gray-700"
                    )}
                    onClick={() => { setSelectedThickness(thickness); setShowThicknessPicker(false); }}
                    data-testid={`button-thickness-${thickness}`}
                  >
                    <div className="rounded-full bg-white" style={{ width: thickness * 2, height: thickness * 2 }} />
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="w-px h-6 bg-gray-600 mx-1" />
          
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-gray-700"
            onClick={undo}
            disabled={historyIndex <= 0}
            data-testid="button-undo"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-gray-700"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            data-testid="button-redo"
          >
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-gray-700"
            onClick={clearAll}
            data-testid="button-clear-all"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          
          <div className="w-px h-6 bg-gray-600 mx-1" />
          
          <Button
            variant={hasUnsavedChanges ? "default" : "ghost"}
            size="icon"
            className={cn(
              "shrink-0",
              hasUnsavedChanges ? "bg-green-600 hover:bg-green-700" : "text-white hover:bg-gray-700"
            )}
            onClick={saveAnnotations}
            title="Save annotations"
            data-testid="button-save-annotations"
          >
            <Save className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
