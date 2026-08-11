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

  // Create a new controller for this request
  const controller = new AbortController();

  // Respect an existing AbortSignal provided by the caller
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort(init.signal.reason);
    } else {
      init.signal.addEventListener(
        "abort",
        () => controller.abort(init.signal?.reason),
        { once: true },
      );
    }
  }

  // Abort the request after the timeout
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeout}ms`));
  }, timeout);

  try {
    const res = await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });

    // 401 Interceptor: If 401 Unauthorized occurs, attempt silent token renewal and retry once
    if (res.status === 401 && init?.headers) {
      const newToken = await getValidIdToken(true);
      if (newToken) {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${newToken}`);
        console.warn("[API Fetch] 401 Unauthorized intercepted. Retrying request with refreshed token.");
        return await fetchImpl(input, {
          ...init,
          headers,
          signal: controller.signal,
        });
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
    clearTimeout(timeoutId);
  }
}
