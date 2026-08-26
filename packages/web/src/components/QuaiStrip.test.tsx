import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    canonicalUrl: `https://example.com/${id}`,
    nextFollowUpAt: null,
    activeEvents: {},
    status: "new",
  };
}

describe("QuaiStrip", () => {
  it("shows the offer count and each offer's title", () => {
    render(<QuaiStrip offers={[makeOffer("a"), makeOffer("b")]} collapsed={false} onToggleCollapsed={vi.fn()} />);
    expect(screen.getByText(/Quai · 2 nouvelles/)).toBeInTheDocument();
    expect(screen.getByText("Offre a")).toBeInTheDocument();
    expect(screen.getByText("Offre b")).toBeInTheDocument();
  });

  it("shows a singular count for one offer", () => {
    render(<QuaiStrip offers={[makeOffer("a")]} collapsed={false} onToggleCollapsed={vi.fn()} />);
    expect(screen.getByText(/Quai · 1 nouvelle$/)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no offers", () => {
    render(<QuaiStrip offers={[]} collapsed={false} onToggleCollapsed={vi.fn()} />);
    expect(screen.getByText("Aucune offre en attente de tri.")).toBeInTheDocument();
  });

  it("hides the offer strip when collapsed", () => {
    render(<QuaiStrip offers={[makeOffer("a")]} collapsed onToggleCollapsed={vi.fn()} />);
    expect(screen.queryByText("Offre a")).not.toBeInTheDocument();
  });

  it("calls onToggleCollapsed when the header button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    render(<QuaiStrip offers={[]} collapsed={false} onToggleCollapsed={onToggleCollapsed} />);
    await user.click(screen.getByRole("button", { name: /Quai/ }));
    expect(onToggleCollapsed).toHaveBeenCalled();
  });
});
