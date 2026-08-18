import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OfferSummary } from "../api/client.js";
import { OfferTable } from "./OfferTable.js";

function makeOffer(overrides: Partial<OfferSummary> = {}): OfferSummary {
  return {
    id: overrides.id ?? "offer-1",
    title: "Data Analyst en alternance",
    company: { name: "Acme" },
    location: { city: "Lille" },
    source: "labonnealternance",
    postedAt: "2026-08-10T00:00:00.000Z",
    contractType: "apprentissage",
    canonicalUrl: "https://example.com/jobs/1",
    nextFollowUpAt: null,
    ...overrides,
  };
}

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const noop = () => {};

describe("OfferTable", () => {
  it("renders offers with proper table semantics", () => {
    const offers = [makeOffer({ id: "a" }), makeOffer({ id: "b", title: "Développeur web" })];
    renderWithClient(
      <OfferTable offers={offers} filters={{}} selectedIds={new Set()} onToggleOne={noop} onToggleAll={noop} allSelected={false} />,
    );

    expect(screen.getByRole("table", { name: "Offres d'emploi" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Titre" })).toBeInTheDocument();
    expect(screen.getByText("Data Analyst en alternance")).toBeInTheDocument();
    expect(screen.getByText("Développeur web")).toBeInTheDocument();
  });

  it("marks selected rows with aria-selected and toggles selection via checkbox", async () => {
    const user = userEvent.setup();
    const onToggleOne = vi.fn();
    const offers = [makeOffer({ id: "a" })];
    renderWithClient(
      <OfferTable
        offers={offers}
        filters={{}}
        selectedIds={new Set(["a"])}
        onToggleOne={onToggleOne}
        onToggleAll={noop}
        allSelected={false}
      />,
    );

    const row = screen.getByText("Data Analyst en alternance").closest('[role="row"]');
    expect(row).toHaveAttribute("aria-selected", "true");

    const checkbox = screen.getByRole("checkbox", { name: "Sélectionner Data Analyst en alternance" });
    await user.click(checkbox);
    expect(onToggleOne).toHaveBeenCalledWith("a");
  });

  it("shows a placeholder when there are no offers", () => {
    renderWithClient(
      <OfferTable offers={[]} filters={{}} selectedIds={new Set()} onToggleOne={noop} onToggleAll={noop} allSelected={false} />,
    );
    expect(screen.getByText("Aucune offre.")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const offers = [makeOffer({ id: "a" }), makeOffer({ id: "b", title: "Développeur web", nextFollowUpAt: "2026-08-01T00:00:00.000Z" })];
    const { container } = renderWithClient(
      <OfferTable offers={offers} filters={{}} selectedIds={new Set()} onToggleOne={noop} onToggleAll={noop} allSelected={false} />,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
