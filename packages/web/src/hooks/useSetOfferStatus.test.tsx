import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSetOfferStatus } from "./useSetOfferStatus.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useSetOfferStatus", () => {
  it("posts an event of the target type for the given offer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ event: { id: "evt-new" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSetOfferStatus(), { wrapper });
    result.current.mutate({ offerId: "offer-1", type: "interview" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      "/offers/offer-1/events",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "interview" }) }),
    );
  });
});
