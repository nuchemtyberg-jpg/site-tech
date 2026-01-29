const DEBUG_PERF = typeof window !== 'undefined' && (
  import.meta.env.DEV || 
  localStorage.getItem('DEBUG_PERF') === 'true'
);

let mountedRoutes: Set<string> = new Set();
let openOverlays: Set<string> = new Set();
let globalListeners: Map<string, number> = new Map();
let renderedItemsCount = 0;
let componentRenderCounts: Map<string, number> = new Map();

function log(category: string, message: string, data?: unknown) {
  if (!DEBUG_PERF) return;
  const timestamp = new Date().toISOString().slice(11, 23);
  const prefix = `[Perf:${category}]`;
  if (data !== undefined) {
    console.log(`${timestamp} ${prefix} ${message}`, data);
  } else {
    console.log(`${timestamp} ${prefix} ${message}`);
  }
}

export function logRouteMount(routeName: string) {
  mountedRoutes.add(routeName);
  log('Route', `MOUNT: ${routeName}`, { totalMounted: mountedRoutes.size });
}

export function logRouteUnmount(routeName: string) {
  mountedRoutes.delete(routeName);
  log('Route', `UNMOUNT: ${routeName}`, { totalMounted: mountedRoutes.size });
}

export function logViewerOpen(viewerName: string) {
  openOverlays.add(viewerName);
  log('Viewer', `OPEN: ${viewerName}`, { 
    totalOpen: openOverlays.size, 
    bodyOverflow: document.body.style.overflow 
  });
}

export function logViewerClose(viewerName: string) {
  openOverlays.delete(viewerName);
  log('Viewer', `CLOSE: ${viewerName}`, { 
    totalOpen: openOverlays.size, 
    bodyOverflow: document.body.style.overflow 
  });
}

export function logScrollLock(action: 'lock' | 'unlock', source: string) {
  log('ScrollLock', `${action.toUpperCase()} by ${source}`, { 
    bodyOverflow: document.body.style.overflow,
    bodyPointerEvents: document.body.style.pointerEvents
  });
}

export function logEventListener(action: 'add' | 'remove', eventType: string, component: string) {
  const key = `${component}:${eventType}`;
  const current = globalListeners.get(key) || 0;
  const newCount = action === 'add' ? current + 1 : Math.max(0, current - 1);
  globalListeners.set(key, newCount);
  log('EventListener', `${action.toUpperCase()}: ${eventType} in ${component}`, { 
    countForType: newCount,
    totalListeners: Array.from(globalListeners.values()).reduce((a, b) => a + b, 0)
  });
}

export function logPaginationFetch(action: 'start' | 'finish', page: number, count: number) {
  log('Pagination', `${action.toUpperCase()} page ${page}`, { itemCount: count });
}

export function logRenderedItems(count: number) {
  if (count !== renderedItemsCount) {
    renderedItemsCount = count;
    log('Render', `Items rendered: ${count}`);
  }
}

export function logComponentRender(componentName: string) {
  const currentCount = componentRenderCounts.get(componentName) || 0;
  const newCount = currentCount + 1;
  componentRenderCounts.set(componentName, newCount);
  log('Render', `${componentName} render #${newCount}`);
}

export function getComponentRenderCount(componentName: string): number {
  return componentRenderCounts.get(componentName) || 0;
}

export function getDebugState() {
  return {
    mountedRoutes: Array.from(mountedRoutes),
    openOverlays: Array.from(openOverlays),
    globalListeners: Object.fromEntries(globalListeners),
    renderedItemsCount,
    bodyOverflow: document.body.style.overflow,
    bodyPointerEvents: document.body.style.pointerEvents,
  };
}

export function isDebugEnabled() {
  return DEBUG_PERF;
}
