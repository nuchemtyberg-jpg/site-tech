interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
}

const metrics: PerformanceMetric[] = [];
let scrollJankCount = 0;
let lastFrameTime = 0;

export function logMetric(name: string, value: number) {
  metrics.push({
    name,
    value,
    timestamp: Date.now(),
  });
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Perf] ${name}: ${value.toFixed(2)}ms`);
  }
}

export function startTiming(name: string): () => void {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    logMetric(name, duration);
  };
}

export function trackScrollPerformance(): () => void {
  let frameCount = 0;
  let jankCount = 0;
  const startTime = performance.now();
  
  const checkFrame = (timestamp: number) => {
    if (lastFrameTime > 0) {
      const delta = timestamp - lastFrameTime;
      if (delta > 32) {
        jankCount++;
      }
    }
    lastFrameTime = timestamp;
    frameCount++;
    
    if (performance.now() - startTime < 5000) {
      requestAnimationFrame(checkFrame);
    }
  };
  
  requestAnimationFrame(checkFrame);
  
  return () => {
    const duration = performance.now() - startTime;
    const fps = (frameCount / duration) * 1000;
    scrollJankCount = jankCount;
    
    logMetric('scroll_fps', fps);
    logMetric('scroll_jank_count', jankCount);
  };
}

export function logImageLoadTime(photoId: number, startTime: number) {
  const loadTime = performance.now() - startTime;
  logMetric(`image_load_${photoId}`, loadTime);
}

export function logTimeToFirstThumbnails(startTime: number) {
  const duration = performance.now() - startTime;
  logMetric('time_to_first_thumbnails', duration);
}

export function getMetricsSummary(): {
  avgImageLoad: number;
  scrollFps: number;
  jankCount: number;
  timeToFirstThumbnails: number;
} {
  const imageLoadMetrics = metrics.filter(m => m.name.startsWith('image_load_'));
  const avgImageLoad = imageLoadMetrics.length > 0
    ? imageLoadMetrics.reduce((sum, m) => sum + m.value, 0) / imageLoadMetrics.length
    : 0;

  const fpsMetric = metrics.find(m => m.name === 'scroll_fps');
  const ttftMetric = metrics.find(m => m.name === 'time_to_first_thumbnails');

  return {
    avgImageLoad,
    scrollFps: fpsMetric?.value || 60,
    jankCount: scrollJankCount,
    timeToFirstThumbnails: ttftMetric?.value || 0,
  };
}

export function clearMetrics() {
  metrics.length = 0;
  scrollJankCount = 0;
}
