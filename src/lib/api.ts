/**
 * Safe fetch wrapper to avoid direct global fetch mutations.
 */

// Save original fetch
const originalFetch =
  typeof window !== "undefined" ? window.fetch.bind(window) : null;

interface ApiFetchOptions {
  timeout?: number;
}

/**
 * Standardized fetch wrapper that uses the browser's original fetch.
 * This avoids issues with getter-only fetch properties on the window object.
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
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
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
