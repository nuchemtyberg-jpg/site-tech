import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { logScrollLock } from '@/lib/debugPerf';

interface UseScrollLockOptions {
  isLocked: boolean;
  source?: string;
}

let activeLocks = 0;
let originalOverflow = '';
let originalPointerEvents = '';

export function useScrollLock({ isLocked, source = 'unknown' }: UseScrollLockOptions) {
  const hasLockRef = useRef(false);
  const [location] = useLocation();
  const locationRef = useRef(location);

  const restoreScroll = useCallback(() => {
    if (hasLockRef.current) {
      activeLocks--;
      hasLockRef.current = false;
      logScrollLock('unlock', source);
      
      if (activeLocks === 0) {
        document.body.style.overflow = originalOverflow;
        document.body.style.pointerEvents = originalPointerEvents;
        originalOverflow = '';
        originalPointerEvents = '';
      }
    }
  }, [source]);

  const lockScroll = useCallback(() => {
    if (!hasLockRef.current) {
      if (activeLocks === 0) {
        originalOverflow = document.body.style.overflow;
        originalPointerEvents = document.body.style.pointerEvents;
      }
      activeLocks++;
      hasLockRef.current = true;
      
      document.body.style.overflow = 'hidden';
      logScrollLock('lock', source);
    }
  }, [source]);

  useEffect(() => {
    if (isLocked) {
      lockScroll();
    } else {
      restoreScroll();
    }
  }, [isLocked, lockScroll, restoreScroll]);

  useEffect(() => {
    if (location !== locationRef.current) {
      locationRef.current = location;
      restoreScroll();
    }
  }, [location, restoreScroll]);

  useEffect(() => {
    return () => {
      if (hasLockRef.current) {
        activeLocks--;
        hasLockRef.current = false;
        logScrollLock('unlock', `${source} (unmount cleanup)`);
        
        if (activeLocks === 0) {
          document.body.style.overflow = originalOverflow;
          document.body.style.pointerEvents = originalPointerEvents;
          originalOverflow = '';
          originalPointerEvents = '';
        }
      }
    };
  }, [source]);

  return { restoreScroll };
}
