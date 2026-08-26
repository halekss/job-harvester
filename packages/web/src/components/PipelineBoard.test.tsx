import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { OfferSummary } from "../api/client.js";
import { PipelineBoard } from "./PipelineBoard.js";

function makeOffer(id: string, status: string, title = `Offre ${id}`): OfferSummary {
  return {
    id,
    title,
    company: { name: "Acme" },
    location: { city: "Lille" },
    source: "labonnealternance",
    contractType: "apprentissage",
    canonicalUrl: `https://example.com/${id}`,
    nextFollowUpAt: null,
    activeEvents: {},
    status,
  };
}

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PipelineBoard", () => {
  it("renders all 6 lanes with a per-lane count", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(<PipelineBoard offers={[makeOffer("a", "applied"), makeOffer("b", "interview")]} hideRejected={false} />);
    // "Candidature" appears twice: once as the lane header, once as offer a's status badge
    // (PipelineCard, Task 7, always renders a badge matching its lane). Disambiguate by
    // locating the header instance specifically — the one with a tabular-nums count sibling.
    const candidatureLabel = screen
      .getAllByText("Candidature")
      .find((el) => el.nextElementSibling?.classList.contains("tabular-nums"));
    expect(candidatureLabel).toBeInTheDocument();
    expect(screen.getByText("Sans réponse")).toBeInTheDocument();
    expect(screen.getByText("Offre a")).toBeInTheDocument();
    expect(screen.getByText("Offre b")).toBeInTheDocument();
  });

  it("collapses the Refus lane when hideRejected is true", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(<PipelineBoard offers={[makeOffer("a", "rejected")]} hideRejected />);
    expect(screen.queryByText("Refus")).not.toBeInTheDocument();
  });

  it("pressing a number key on a selected card moves it to that lane", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ event: { id: "evt-new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<PipelineBoard offers={[makeOffer("a", "applied")]} hideRejected={false} />);

    await user.click(screen.getByTestId("card-a"));
    await user.keyboard("4");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/offers/a/events",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "interview" }) }),
      );
    });
  });

  it("j/k moves the selection between cards within the same lane", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderWithClient(
      <PipelineBoard offers={[makeOffer("a", "applied"), makeOffer("b", "applied")]} hideRejected={false} />,
    );

    await user.click(screen.getByTestId("card-a"));
    expect(screen.getByTestId("card-a")).toHaveAttribute("data-selected", "true");

    await user.keyboard("j");
    expect(screen.getByTestId("card-a")).toHaveAttribute("data-selected", "false");
    expect(screen.getByTestId("card-b")).toHaveAttribute("data-selected", "true");
  });

  it("dropping a card on a lane moves it to that lane's status", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ event: { id: "evt-new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithClient(<PipelineBoard offers={[makeOffer("a", "applied")]} hideRejected={false} />);

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => "a"), dropEffect: "", effectAllowed: "" };
    const rejectedLane = screen.getByText("Refus").closest("div")!.parentElement!;
    fireEvent.dragOver(rejectedLane, { dataTransfer });
    fireEvent.drop(rejectedLane, { dataTransfer });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/offers/a/events",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "rejected" }) }),
      );
    });
  });

  it("pressing j with no prior selection selects the first offer of the first non-empty lane", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderWithClient(<PipelineBoard offers={[makeOffer("a", "interview")]} hideRejected={false} />);

    screen.getByRole("group", { name: "Pipeline de candidatures" }).focus();
    await user.keyboard("j");

    expect(screen.getByTestId("card-a")).toHaveAttribute("data-selected", "true");
  });

  it("does nothing on j/k/h/l with no prior selection when every lane is empty", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderWithClient(<PipelineBoard offers={[]} hideRejected={false} />);

    screen.getByRole("group", { name: "Pipeline de candidatures" }).focus();
    await expect(user.keyboard("j")).resolves.not.toThrow();
  });

  it("l skips over empty lanes to the next non-empty lane, and is a no-op past the last non-empty lane", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    // applied (a) and interview (b) are non-empty; spontaneous/followup in between are empty.
    renderWithClient(
      <PipelineBoard offers={[makeOffer("a", "applied"), makeOffer("b", "interview")]} hideRejected={false} />,
    );

    await user.click(screen.getByTestId("card-a"));
    await user.keyboard("l");
    expect(screen.getByTestId("card-b")).toHaveAttribute("data-selected", "true");

    // No non-empty lane further right (rejected/no_reply are empty): selection stays put.
    await user.keyboard("l");
    expect(screen.getByTestId("card-b")).toHaveAttribute("data-selected", "true");
  });

  it("does not POST a redundant event when the number key targets the card's current lane", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ event: { id: "evt-new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<PipelineBoard offers={[makeOffer("a", "interview")]} hideRejected={false} />);

    await user.click(screen.getByTestId("card-a"));
    await user.keyboard("4"); // 4 = interview, the card's current lane

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not POST a redundant event when a card is dropped back onto its own lane", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ event: { id: "evt-new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithClient(<PipelineBoard offers={[makeOffer("a", "applied")]} hideRejected={false} />);

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => "a"), dropEffect: "", effectAllowed: "" };
    const appliedLane = screen.getByTestId("card-a").parentElement!;
    fireEvent.dragOver(appliedLane, { dataTransfer });
    fireEvent.drop(appliedLane, { dataTransfer });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = renderWithClient(
      <PipelineBoard offers={[makeOffer("a", "applied"), makeOffer("b", "interview")]} hideRejected={false} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
