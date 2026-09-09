import { QueryClient, QueryFunction } from "@tanstack/react-query";

function responseLabel(res: Response) {
  return `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
}

async function readErrorMessage(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = (await res.text()).trim();

  if (contentType.includes("application/json") && text) {
    try {
      const body = JSON.parse(text) as { message?: unknown; error?: unknown };
      const message = typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : undefined;
      if (message) return message;
    } catch {
      // The fallback below explains that the server returned an invalid response.
    }
  }

  if (contentType.includes("text/html") || text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    return "The server returned the application page instead of an API response. The requested API endpoint may be unavailable or the server build may be out of date.";
  }

  return text || res.statusText || "The server did not provide an error message.";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    throw new Error(`${responseLabel(res)}: ${await readErrorMessage(res)}`);
  }
}

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const message = await readErrorMessage(res);
    throw new Error(`Invalid API response: ${message}`);
  }

  try {
    return await res.json() as T;
  } catch {
    throw new Error("Invalid API response: the server returned malformed JSON.");
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T | null> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await parseJsonResponse(res);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
