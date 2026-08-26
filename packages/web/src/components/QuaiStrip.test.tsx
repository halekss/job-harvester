import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { OfferSummary } from "../api/client.js";
import { QuaiStrip } from "./QuaiStrip.js";

function makeOffer(id: string): OfferSummary {
  return {
    id,
    title: `Offre ${id}`,
    company: { name: "Acme" },
    location: { city: "Lille" },
    source: "labonnealternance",
    contractType: "apprentissage",
    applyUrl: `https://example.com/apply/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    nextFollowUpAt: null,
    activeEvents: {},
    status: "new",
  };
}

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuaiStrip", () => {
  it("shows the offer count and each offer's title", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(<QuaiStrip offers={[makeOffer("a"), makeOffer("b")]} collapsed={false} onToggleCollapsed={vi.fn()} />);
    expect(screen.getByText(/Quai · 2 nouvelles/)).toBeInTheDocument();
    expect(screen.getByText("Offre a")).toBeInTheDocument();
    expect(screen.getByText("Offre b")).toBeInTheDocument();
  });

  it("shows a singular count for one offer", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(<QuaiStrip offers={[makeOffer("a")]} collapsed={false} onToggleCollapsed={vi.fn()} />);
    expect(screen.getByText(/Quai · 1 nouvelle$/)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no offers", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(<QuaiStrip offers={[]} collapsed={false} onToggleCollapsed={vi.fn()} />);
    expect(screen.getByText("Aucune offre en attente de tri.")).toBeInTheDocument();
  });

  it("hides the offer strip when collapsed", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(<QuaiStrip offers={[makeOffer("a")]} collapsed onToggleCollapsed={vi.fn()} />);
    expect(screen.queryByText("Offre a")).not.toBeInTheDocument();
  });

  it("calls onToggleCollapsed when the header button is clicked", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    renderWithClient(<QuaiStrip offers={[]} collapsed={false} onToggleCollapsed={onToggleCollapsed} />);
    await user.click(screen.getByRole("button", { name: /Quai/ }));
    expect(onToggleCollapsed).toHaveBeenCalled();
  });

  it("renders each offer's title as a real link to applyUrl", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(<QuaiStrip offers={[makeOffer("a")]} collapsed={false} onToggleCollapsed={vi.fn()} />);
    const link = screen.getByRole("link", { name: "Offre a" });
    expect(link).toHaveAttribute("href", "https://example.com/apply/a");
  });

  it("calls onDragStart-equivalent: dragging a card's handle sets the drag payload", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(<QuaiStrip offers={[makeOffer("a")]} collapsed={false} onToggleCollapsed={vi.fn()} />);
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), dropEffect: "", effectAllowed: "" };
    fireEvent.dragStart(screen.getByLabelText("Glisser pour déplacer"), { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "a");
  });

  it("clicking a card then pressing a number key assigns it to that Pipeline lane", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ event: { id: "evt-new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<QuaiStrip offers={[makeOffer("a")]} collapsed={false} onToggleCollapsed={vi.fn()} />);

    await user.click(screen.getByTestId("card-a"));
    await user.keyboard("4"); // 4 = interview

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/offers/a/events",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "interview" }) }),
      );
    });
  });

  it("Escape clears the local selection", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderWithClient(<QuaiStrip offers={[makeOffer("a")]} collapsed={false} onToggleCollapsed={vi.fn()} />);

    await user.click(screen.getByTestId("card-a"));
    expect(screen.getByTestId("card-a")).toHaveAttribute("data-selected", "true");

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("card-a")).toHaveAttribute("data-selected", "false");
  });
});
