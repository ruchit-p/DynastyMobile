import { useEffect, useRef, DependencyList } from 'react';
import { logger } from '../services/LoggingService';

/**
 * useEffect hook with automatic logging for debugging
 * Logs when effect runs, cleans up, and tracks dependencies
 */
export function useLoggedEffect(
  effect: () => void | (() => void),
  deps: DependencyList,
  name: string
) {
  const prevDepsRef = useRef<DependencyList>();
  const cleanupRef = useRef<(() => void) | void>();
  const runCountRef = useRef(0);

  useEffect(() => {
    runCountRef.current++;
    
    // Log effect execution
    logger.debug(`Effect [${name}] running`, {
      runCount: runCountRef.current,
      dependencies: deps,
      previousDependencies: prevDepsRef.current,
    });

    // Track which dependencies changed
    if (prevDepsRef.current) {
      const changedDeps = deps
        .map((dep, index) => {
          if (dep !== prevDepsRef.current![index]) {
            return { index, prev: prevDepsRef.current![index], current: dep };
          }
          return null;
        })
        .filter(Boolean);

      if (changedDeps.length > 0) {
        logger.debug(`Effect [${name}] dependencies changed`, { changedDeps });
      }
    }

    prevDepsRef.current = [...deps];

    // Run the actual effect
    try {
      cleanupRef.current = effect();
    } catch (error) {
      logger.error(`Effect [${name}] threw error`, error);
      throw error;
    }

    // Return cleanup function
    return () => {
      logger.debug(`Effect [${name}] cleaning up`, {
        runCount: runCountRef.current,
      });
      
      if (typeof cleanupRef.current === 'function') {
        try {
          cleanupRef.current();
        } catch (error) {
          logger.error(`Effect [${name}] cleanup threw error`, error);
        }
      }
    };
  }, deps);
}