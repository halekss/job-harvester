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

// JOB-audit-2026-08-21 : filtres ad-hoc (métier/contrat/ville) du bouton "Lancer la collecte" -
// optionnels, la collecte doit fonctionner sans, et se baser dessus quand ils sont renseignés.
describe("HarvestControl — ad-hoc filters", () => {
  it("launches the harvest with no request body when no filter is set (back-compat)", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithClient(<HarvestControl />);

    await user.click(await screen.findByRole("button", { name: "Lancer la collecte" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/harvest/"));
      expect(call).toBeDefined();
      expect(call![1]).not.toHaveProperty("body");
    });
  });

  it("sends the métier text as keywords when filled", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithClient(<HarvestControl />);

    await user.type(await screen.findByLabelText("Métier"), "marketing");
    await user.click(screen.getByRole("button", { name: "Lancer la collecte" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/harvest/"));
      const body = JSON.parse((call![1] as { body: string }).body);
      expect(body.keywords).toEqual(["marketing"]);
    });
  });

  it("maps the Alternance contract filter to [apprentissage, professionnalisation]", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithClient(<HarvestControl />);

    await user.selectOptions(await screen.findByLabelText("Contrat"), "Alternance");
    await user.click(screen.getByRole("button", { name: "Lancer la collecte" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/harvest/"));
      const body = JSON.parse((call![1] as { body: string }).body);
      expect(body.contractTypes).toEqual(["apprentissage", "professionnalisation"]);
    });
  });

  it("maps both CDI and CDD to [autre] (the system can't distinguish them yet)", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithClient(<HarvestControl />);

    await user.selectOptions(await screen.findByLabelText("Contrat"), "CDD");
    await user.click(screen.getByRole("button", { name: "Lancer la collecte" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/harvest/"));
      const body = JSON.parse((call![1] as { body: string }).body);
      expect(body.contractTypes).toEqual(["autre"]);
    });
  });

  it("sends the Lille location (matching campaigns.yaml) when Lille is selected", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderWithClient(<HarvestControl />);

    await user.selectOptions(await screen.findByLabelText("Ville"), "Lille");
    await user.click(screen.getByRole("button", { name: "Lancer la collecte" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/harvest/"));
      const body = JSON.parse((call![1] as { body: string }).body);
      expect(body.location).toEqual({ label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 });
    });
  });
});
