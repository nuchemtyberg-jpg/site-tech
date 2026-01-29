import { useState, useEffect } from 'react';
import { getDebugState, isDebugEnabled, getComponentRenderCount } from '@/lib/debugPerf';
import { getMetricsSummary } from '@/lib/performanceMetrics';

interface HealthState {
  renderCount: number;
  itemsLoaded: number;
  overlaysMounted: string[];
  bodyOverflow: string;
  bodyPointerEvents: string;
  scrollFps: number;
  avgImageLoad: number;
}

export function HealthHUD() {
  const [state, setState] = useState<HealthState>({
    renderCount: 0,
    itemsLoaded: 0,
    overlaysMounted: [],
    bodyOverflow: '',
    bodyPointerEvents: '',
    scrollFps: 60,
    avgImageLoad: 0,
  });

  useEffect(() => {
    if (!isDebugEnabled() && !import.meta.env.DEV) return;

    const updateState = () => {
      const debugState = getDebugState();
      const metrics = getMetricsSummary();
      
      setState({
        renderCount: getComponentRenderCount('VirtualizedPhotoGrid'),
        itemsLoaded: debugState.renderedItemsCount,
        overlaysMounted: debugState.openOverlays,
        bodyOverflow: document.body.style.overflow || 'auto',
        bodyPointerEvents: document.body.style.pointerEvents || 'auto',
        scrollFps: metrics.scrollFps,
        avgImageLoad: metrics.avgImageLoad,
      });
    };

    updateState();
    const interval = setInterval(updateState, 500);
    return () => clearInterval(interval);
  }, []);

  if (!isDebugEnabled() && !import.meta.env.DEV) {
    return null;
  }

  const hasIssues = 
    state.bodyOverflow === 'hidden' || 
    state.bodyPointerEvents === 'none' ||
    state.overlaysMounted.length > 0;

  return (
    <div 
      className={`fixed bottom-4 right-4 z-[9999] p-3 rounded-lg text-xs font-mono shadow-lg backdrop-blur-sm ${
        hasIssues ? 'bg-red-900/80 text-red-100' : 'bg-black/60 text-green-100'
      }`}
      style={{ maxWidth: '240px' }}
      data-testid="health-hud"
    >
      <div className="font-bold mb-1 text-[10px] uppercase tracking-wide opacity-70">
        Health HUD
      </div>
      <div className="space-y-0.5">
        <div>Renders: {state.renderCount}</div>
        <div>Items: {state.itemsLoaded}</div>
        <div className={state.overlaysMounted.length > 0 ? 'text-yellow-300' : ''}>
          Overlays: {state.overlaysMounted.length > 0 ? state.overlaysMounted.join(', ') : 'none'}
        </div>
        <div className={state.bodyOverflow === 'hidden' ? 'text-red-300 font-bold' : ''}>
          body.overflow: {state.bodyOverflow}
        </div>
        <div className={state.bodyPointerEvents === 'none' ? 'text-red-300 font-bold' : ''}>
          body.pointerEvents: {state.bodyPointerEvents}
        </div>
        <div className="opacity-70 text-[10px] mt-1">
          FPS: {state.scrollFps.toFixed(0)} | Img: {state.avgImageLoad.toFixed(0)}ms
        </div>
      </div>
    </div>
  );
}
