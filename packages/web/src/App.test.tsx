import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";

function stubFetch() {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/campaigns")) {
      return new Response(JSON.stringify({ campaigns: [{ id: "alternance-data-hdf" }] }), { status: 200 });
    }
    if (url.startsWith("/offers")) {
      return new Response(
        JSON.stringify({
          offers: [
            {
              id: "a",
              title: "Data Analyst",
              company: { name: "Acme" },
              location: { city: "Lille" },
              source: "labonnealternance",
              contractType: "apprentissage",
              canonicalUrl: "https://example.com/1",
              nextFollowUpAt: null,
              activeEvents: {},
              status: "new",
            },
            {
              id: "b",
              title: "Dev Backend",
              company: { name: "Acme" },
              location: { city: "Lyon" },
              source: "francetravail",
              contractType: "cdi",
              canonicalUrl: "https://example.com/2",
              nextFollowUpAt: null,
              activeEvents: {},
              status: "interview",
            },
          ],
          nextCursor: null,
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("buckets offers into the Quai (status new) and the matching Pipeline lane", async () => {
    stubFetch();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Data Analyst")).toBeInTheDocument();
    expect(screen.getByText(/Quai · 1 nouvelle/)).toBeInTheDocument();
    expect(screen.getByText("Dev Backend")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Pipeline de candidatures" })).toBeInTheDocument();
  });

  it("offers a filter chip for every distinct source present on the page", async () => {
    stubFetch();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    await screen.findByText("Data Analyst");
    expect(screen.getByRole("button", { name: "labonnealternance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "francetravail" })).toBeInTheDocument();
  });
});
