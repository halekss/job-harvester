import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EventButtons } from "./EventButtons.js";

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EventButtons", () => {
  it("marks a button as pressed when the offer already has an event of that type", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(
      <EventButtons offerId="offer-1" filters={{}} activeEvents={{ applied: "evt-1" }} />,
    );

    expect(screen.getByRole("button", { name: "Candidature" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Entretien" })).toHaveAttribute("aria-pressed", "false");
  });

  it("several action types can be pressed at once for the same offer", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWithClient(
      <EventButtons offerId="offer-1" filters={{}} activeEvents={{ applied: "evt-1", interview: "evt-2" }} />,
    );

    expect(screen.getByRole("button", { name: "Candidature" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Entretien" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Refus" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking an inactive button records a new event (POST)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ event: { id: "evt-new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<EventButtons offerId="offer-1" filters={{}} activeEvents={{}} />);

    await user.click(screen.getByRole("button", { name: "Entretien" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/offers/offer-1/events",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "interview" }) }),
    );
  });

  it("clicking an already-active button removes that event (DELETE), toggling it off", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(
      <EventButtons offerId="offer-1" filters={{}} activeEvents={{ applied: "evt-1" }} />,
    );

    await user.click(screen.getByRole("button", { name: "Candidature" }));

    expect(fetchMock).toHaveBeenCalledWith("/offers/offer-1/events/evt-1", expect.objectContaining({ method: "DELETE" }));
  });
});
