import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";

function stubFetch() {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/campaigns")) {
      return new Response(
        JSON.stringify({
          campaigns: [
            {
              id: "alternance-data-hdf",
              locations: [{ label: "Lille 59000" }, { label: "Paris 75000" }],
              contractTypes: ["apprentissage", "cdi"],
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.match(/^\/offers\/[^/]+\/events$/) && init?.method === "POST") {
      return new Response(JSON.stringify({ event: { id: "evt-new" } }), { status: 201 });
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
  return fetchMock;
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

  // Regression test for the bug this fix wave closed: a freshly collected offer (status "new")
  // could never be opened or triaged from the UI because the Quai rendered static, non-interactive
  // markup. This exercises the real end-to-end path — select the Quai card, assign it a lane via
  // keyboard — and asserts the mutation actually reaches the API.
  it("lets a Quai offer be triaged into a Pipeline lane via keyboard selection", async () => {
    const fetchMock = stubFetch();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    await screen.findByText("Data Analyst");
    await user.click(screen.getByTestId("card-a"));
    await user.keyboard("4"); // 4 = Entretien (interview)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/offers/a/events",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "interview" }) }),
      );
    });
  });

  it("refetches offers with the remaining locations when a campaign location chip is deselected", async () => {
    const fetchMock = stubFetch();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    await screen.findByText("Data Analyst");
    const parisChip = screen.getByRole("button", { name: "Paris 75000" });
    expect(parisChip).toHaveAttribute("aria-pressed", "true");

    await user.click(parisChip);

    expect(parisChip).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => {
      const offersCalls = fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/offers?"));
      expect(offersCalls.at(-1)?.[0]).toContain("locations=Lille+59000");
    });
  });
});
