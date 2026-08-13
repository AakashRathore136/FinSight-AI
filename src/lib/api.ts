/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * Safe fetch wrapper to avoid direct global fetch mutations.
 */

// Save original fetch
const originalFetch =
  typeof window !== "undefined" ? window.fetch.bind(window) : null;

interface ApiFetchOptions {
  timeout?: number;
}

import { getValidIdToken } from "./firebase";

/**
 * Standardized fetch wrapper that uses the browser's original fetch
 * with automatic 401 unauthenticated token refresh retries.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<Response> {
  const timeout = options?.timeout ?? 10000;

  const fetchImpl =
    originalFetch ?? (typeof fetch !== "undefined" ? fetch : null);

  if (!fetchImpl) {
    throw new Error("Fetch API is not available in this environment");
  }

  // Build a controller for this request and wire the caller's AbortSignal into
  // it. We keep a handle on the listener so it can be detached on cleanup and
  // never leak on the (possibly unmounted) caller's signal.
  const controller = new AbortController();
  let callerAbortListener: (() => void) | null = null;
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort(init.signal.reason);
    } else {
      callerAbortListener = () => controller.abort(init.signal?.reason);
      init.signal.addEventListener("abort", callerAbortListener, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeout}ms`));
  }, timeout);

  // Detach the caller-signal listener and clear the timeout exactly once.
  const cleanup = () => {
    if (callerAbortListener && init?.signal) {
      init.signal.removeEventListener("abort", callerAbortListener);
      callerAbortListener = null;
    }
    clearTimeout(timeoutId);
  };

  try {
    const res = await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });

    // 401 Interceptor: attempt silent token renewal and retry once.
    if (res.status === 401 && init?.headers) {
      const newToken = await getValidIdToken(true);
      if (newToken) {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${newToken}`);
        console.warn("[API Fetch] 401 Unauthorized intercepted. Retrying request with refreshed token.");

        // The retry gets a FRESH controller + timeout so it is not killed by the
        // still-pending original timeout, and a fresh caller-signal listener
        // that is also cleaned up.
        cleanup();
        const retryController = new AbortController();
        let retryCallerListener: (() => void) | null = null;
        if (init?.signal) {
          if (init.signal.aborted) {
            retryController.abort(init.signal.reason);
          } else {
            retryCallerListener = () => retryController.abort(init.signal?.reason);
            init.signal.addEventListener("abort", retryCallerListener, { once: true });
          }
        }
        const retryTimeoutId = setTimeout(() => {
          retryController.abort(new Error(`Request timed out after ${timeout}ms`));
        }, timeout);
        try {
          return await fetchImpl(input, {
            ...init,
            headers,
            signal: retryController.signal,
          });
        } finally {
          if (retryCallerListener && init?.signal) {
            init.signal.removeEventListener("abort", retryCallerListener);
          }
          clearTimeout(retryTimeoutId);
        }
      }
    }

    return res;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError" &&
      !init?.signal?.aborted
    ) {
      throw new Error(`Request timed out after ${timeout}ms`);
    }

    throw error;
  } finally {
    cleanup();
  }
}
