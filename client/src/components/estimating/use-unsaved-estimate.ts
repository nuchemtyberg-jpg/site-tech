import { useEffect, useRef } from "react";

export const discardEstimate = () => window.confirm("You have unsaved estimate changes. Discard changes and continue?");
export function useUnsavedEstimate(dirty: boolean) {
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    let currentHref = window.location.href;
    let currentState = window.history.state;
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || anchor.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (anchor.href === currentHref) return;
      if (dirtyRef.current && !event.defaultPrevented) {
        if (!discardEstimate()) { event.preventDefault(); event.stopPropagation(); }
        else dirtyRef.current = false;
      }
    };
    const guard = (original: History["pushState"]): History["pushState"] => function(data, unused, url) {
      const destination = url == null ? currentHref : new URL(String(url), currentHref).href;
      if (destination !== currentHref && dirtyRef.current) {
        if (!discardEstimate()) return;
        dirtyRef.current = false;
      }
      original.call(window.history, data, unused, url);
      currentHref = window.location.href;
      currentState = window.history.state;
    };
    const guardedPush = guard(originalPush), guardedReplace = guard(originalReplace);
    window.history.pushState = guardedPush;
    window.history.replaceState = guardedReplace;
    const pop = (event: PopStateEvent) => {
      if (dirtyRef.current && window.location.href !== currentHref && !discardEstimate()) {
        event.stopImmediatePropagation();
        // Restore the draft URL before the router can unmount it. Use the original
        // method so restoration itself does not prompt a second time.
        originalPush.call(window.history, currentState, "", currentHref);
      } else {
        currentHref = window.location.href;
        currentState = window.history.state;
      }
    };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", click, true); window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", click, true); window.removeEventListener("popstate", pop, true);
      if (window.history.pushState === guardedPush) window.history.pushState = originalPush;
      if (window.history.replaceState === guardedReplace) window.history.replaceState = originalReplace;
    };
  }, []);
}
