import { describe, expect, it } from "vitest";
import { apiRequest, parseJsonResponse } from "./queryClient";

describe("API response handling", () => {
  it("explains when a successful API request returns the application HTML", async () => {
    const response = new Response("<!DOCTYPE html><html><body>Application</body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

    await expect(parseJsonResponse(response)).rejects.toThrow(
      "The server returned the application page instead of an API response",
    );
  });

  it("uses a JSON API error message instead of exposing the raw response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      JSON.stringify({ message: "API endpoint not found: POST /api/document-categories" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

    try {
      await expect(apiRequest("POST", "/api/document-categories", { name: "Contracts" }))
        .rejects.toThrow("API endpoint not found: POST /api/document-categories");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports malformed JSON without exposing a parser exception", async () => {
    const response = new Response("<not-json>", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    await expect(parseJsonResponse(response)).rejects.toThrow(
      "Invalid API response: the server returned malformed JSON.",
    );
  });
});