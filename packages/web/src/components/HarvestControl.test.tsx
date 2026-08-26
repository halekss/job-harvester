import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HarvestControl } from "./HarvestControl.js";

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/campaigns")) {
      return new Response(JSON.stringify({ campaigns: [{ id: "alternance-data-hdf" }, { id: "alternance-devweb-hdf" }] }), {
        status: 200,
      });
    }
    if (url.includes("/harvest/")) {
      return new Response(JSON.stringify({ summaries: [] }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Audit 2026-08-26 : un seul jeu de critères par campagne — plus de filtres ad-hoc
// métier/contrat/ville, `campaignId` est contrôlé par le parent (partagé avec le scope du
// tableau d'offres, voir App.tsx).
describe("HarvestControl", () => {
  it("launches the harvest for the given campaignId with no request body", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithClient(<HarvestControl campaignId="alternance-data-hdf" onCampaignChange={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Lancer la collecte" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/harvest/"));
      expect(call).toBeDefined();
      expect(String(call![0])).toContain("/harvest/alternance-data-hdf/run");
      expect(call![1]).not.toHaveProperty("body");
    });
  });

  it("shows a campaign selector reflecting the controlled campaignId, and reports changes via onCampaignChange", async () => {
    stubFetch();
    const user = userEvent.setup();
    const onCampaignChange = vi.fn();
    renderWithClient(<HarvestControl campaignId="alternance-data-hdf" onCampaignChange={onCampaignChange} />);

    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue("alternance-data-hdf");

    await user.selectOptions(select, "alternance-devweb-hdf");

    expect(onCampaignChange).toHaveBeenCalledWith("alternance-devweb-hdf");
  });

  it("disables the launch button when no campaignId is set", async () => {
    stubFetch();
    renderWithClient(<HarvestControl campaignId="" onCampaignChange={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Lancer la collecte" })).toBeDisabled();
  });

  it("warns visibly when a connector couldn't verify the location filter on some offers (audit 2026-08-24, root cause #1)", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/campaigns")) {
        return new Response(JSON.stringify({ campaigns: [{ id: "alternance-data-hdf" }] }), { status: 200 });
      }
      if (url.includes("/harvest/")) {
        return new Response(
          JSON.stringify({
            summaries: [
              { runId: "r1", connectorId: "workday", rawCount: 5, normalizedCount: 5, rejectedCount: 3, unresolvedLocationCount: 2, ok: true },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<HarvestControl campaignId="alternance-data-hdf" onCampaignChange={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Lancer la collecte" }));

    expect(await screen.findByText(/workday/)).toBeInTheDocument();
    expect(screen.getByText(/2 offre\(s\) exclue\(s\).*localisation non vérifiable/)).toBeInTheDocument();
  });

  it("displays discovered targets after a harvest run", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/campaigns")) {
        return new Response(JSON.stringify({ campaigns: [{ id: "alternance-data-hdf" }] }), { status: 200 });
      }
      if (url.includes("/harvest/")) {
        return new Response(
          JSON.stringify({
            summaries: [],
            discoveries: { probed: 3, found: [{ companySlug: "acme", platform: "digitalRecruiters", target: "joinus.acme.fr" }] },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<HarvestControl campaignId="alternance-data-hdf" onCampaignChange={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Lancer la collecte" }));

    expect(await screen.findByText(/1 nouvelle cible découverte/)).toBeInTheDocument();
    expect(screen.getByText(/acme.*digitalRecruiters.*joinus\.acme\.fr/)).toBeInTheDocument();
  });

  it("shows a persistent failure state on the launch button when a connector fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/campaigns")) {
        return new Response(JSON.stringify({ campaigns: [{ id: "alternance-data-hdf" }] }), { status: 200 });
      }
      if (url.includes("/harvest/")) {
        return new Response(
          JSON.stringify({
            summaries: [
              { runId: "r1", connectorId: "workday", rawCount: 0, normalizedCount: 0, rejectedCount: 0, unresolvedLocationCount: 0, ok: false, errorMessage: "timeout" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<HarvestControl campaignId="alternance-data-hdf" onCampaignChange={vi.fn()} />);

    const button = await screen.findByRole("button", { name: "Lancer la collecte" });
    await user.click(button);

    expect(await screen.findByRole("button", { name: /1 connecteur\(s\) en échec/ })).toBeInTheDocument();
  });

  it("flashes a success count on the launch button after a clean run", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/campaigns")) {
        return new Response(JSON.stringify({ campaigns: [{ id: "alternance-data-hdf" }] }), { status: 200 });
      }
      if (url.includes("/harvest/")) {
        return new Response(
          JSON.stringify({
            summaries: [
              { runId: "r1", connectorId: "francetravail", rawCount: 5, normalizedCount: 5, rejectedCount: 0, unresolvedLocationCount: 0, ok: true },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithClient(<HarvestControl campaignId="alternance-data-hdf" onCampaignChange={vi.fn()} />);

    const button = await screen.findByRole("button", { name: "Lancer la collecte" });
    await user.click(button);

    expect(await screen.findByRole("button", { name: /\+5 nouvelles offres/ })).toBeInTheDocument();
  });
});
