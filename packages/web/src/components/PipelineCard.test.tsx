import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OfferSummary } from "../api/client.js";
import { PipelineCard } from "./PipelineCard.js";

function makeOffer(): OfferSummary {
  return {
    id: "offer-1",
    title: "Data Analyst",
    company: { name: "Acme" },
    location: { city: "Lille" },
    source: "labonnealternance",
    contractType: "apprentissage",
    applyUrl: "https://example.com/apply/1",
    canonicalUrl: "https://example.com/1",
    nextFollowUpAt: null,
    activeEvents: {},
    status: "interview",
  };
}

describe("PipelineCard", () => {
  it("renders the title as a link, the city, the source, and the status badge", () => {
    render(<PipelineCard offer={makeOffer()} status="interview" selected={false} onSelect={vi.fn()} onDragStart={vi.fn()} />);
    const link = screen.getByRole("link", { name: "Data Analyst" });
    expect(link).toHaveAttribute("href", "https://example.com/apply/1");
    expect(screen.getByText(/Lille/)).toBeInTheDocument();
    expect(screen.getByText(/labonnealternance/)).toBeInTheDocument();
    expect(screen.getByText("Entretien")).toBeInTheDocument();
  });

  it("reflects the selected state via aria-current and data-selected", () => {
    render(<PipelineCard offer={makeOffer()} status="interview" selected onSelect={vi.fn()} onDragStart={vi.fn()} />);
    const card = screen.getByTestId("card-offer-1");
    expect(card).toHaveAttribute("aria-current", "true");
    expect(card).toHaveAttribute("data-selected", "true");
  });

  it("calls onSelect when the card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PipelineCard offer={makeOffer()} status="interview" selected={false} onSelect={onSelect} onDragStart={vi.fn()} />);
    await user.click(screen.getByTestId("card-offer-1"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("calls onDragStart with the offer id and sets the drag payload when the handle is dragged", () => {
    const onDragStart = vi.fn();
    render(<PipelineCard offer={makeOffer()} status="interview" selected={false} onSelect={vi.fn()} onDragStart={onDragStart} />);
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), dropEffect: "", effectAllowed: "" };
    fireEvent.dragStart(screen.getByLabelText("Glisser pour déplacer"), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith("offer-1");
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "offer-1");
  });
});
