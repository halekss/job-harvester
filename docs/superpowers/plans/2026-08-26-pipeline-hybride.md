# Pipeline hybride "Quai & Pipeline" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `OfferTable` (+ `EventButtons` + `BulkActionBar`) jobboard view with a "Quai & Pipeline" split view — an inbox strip of untriaged offers above a 6-lane Kanban — themed with the "Clean Light" design system (Inter + JetBrains Mono, zinc/blue palette) instead of the previous "console de récolte" theme.

**Architecture:** A new derived `status` field on `GET /offers` (server-side, reusing the existing `deriveStatus()` latest-event-wins logic already used by `GET /stats`) becomes the single source of truth for which lane an offer sits in. The frontend buckets the already-fetched, already-paginated offer list client-side (`groupByStatus`) into a `QuaiStrip` (status `"new"`) and a `PipelineBoard` (6 lanes, one per event type). Moving a card = `POST /offers/:id/events { type }` with the target lane's type (no delete/toggle — the event log stays append-only, exactly like `deriveStatus` already assumes). Keyboard (`j/k/h/l`, `1`-`6`) and native HTML5 drag-and-drop are the two ways to move a card.

**Tech Stack:** React 19, `@tanstack/react-query` v5, Tailwind v4 (`@theme` tokens in `index.css`), Vitest + Testing Library + `jest-axe`, Hono + Drizzle (API), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-pipeline-hybride-design.md`

## Global Constraints

- No new npm dependencies (native HTML5 drag-and-drop, no DnD library; no animation library).
- Existing `OfferFilters` API shape (`city`, `contractType`, `q`, `campaignId`) does not change — "masquer les refus" and the source filter are **client-side only**, applied to the already-fetched page, exactly like the existing `followUpOnly` toggle in `App.tsx`.
- `deriveStatus()` (`packages/api/src/routes/offers.ts:18`) is the canonical status algorithm — do not reimplement it; add a helper that reuses it.
- Every offer has exactly one current `status`: `"new"` (Quai) or one of `applied` / `spontaneous` / `followup` / `interview` / `rejected` / `no_reply` (Pipeline lane). No more independent multi-flag toggling.
- Existing Tailwind `@theme` token **names** stay stable (`--color-background`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-cool`, `--color-danger`) — only their hex values change in Task 1. New tokens are additive.
- `EventButtons`, `useToggleOfferEvent`, `BulkActionBar`, `useOfferEventMutation`, `OfferTable` are deleted only in the final task (Task 12), once nothing references them — every intermediate commit must keep `pnpm --filter web test` and `pnpm --filter api test` green.
- French copy throughout the UI (matches existing components).

---

### Task 1: Retheme to "Clean Light" (Inter + JetBrains Mono)

**Files:**
- Modify: `packages/web/src/index.css`
- Modify: `packages/web/index.html:9-12`

**Interfaces:**
- Produces: all `--color-*` / `--font-*` tokens consumed by every existing and future component (`bg-background`, `text-text`, `border-border`, `bg-accent`, `text-accent-cool`, `bg-danger`, `font-display`, `font-body`, `font-mono`, plus new `--color-status-{new,applied,spontaneous,followup,interview,rejected,noreply}-{bg,fg,solid,on}` for Task 4's `StatusBadge`).

- [ ] **Step 1: Swap the Google Fonts link**

Edit `packages/web/index.html:9-12`:

```html
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
```

- [ ] **Step 2: Replace the theme tokens**

Replace the full contents of `packages/web/src/index.css`:

```css
@import "tailwindcss";

@theme {
  /* Surfaces — thème "Clean Light" */
  --color-background: #fafafa;
  --color-surface: #ffffff;
  --color-surface-raised: #f4f4f5;
  --color-border: #e4e4e7;
  --color-border-soft: #ededf0;
  --color-text: #09090b;
  --color-text-muted: #71717a;
  --color-text-faint: #a1a1aa;

  /* Accent — un seul bleu ; ne réapparaît jamais sur un badge de statut */
  --color-accent: #1d4ed8;
  --color-accent-cool: #1d4ed8;
  --color-danger: #dc2626;

  /* Anciennes pills de statut — utilisées par EventButtons, retirées avec lui (Task 12) */
  --color-status-applied: #1d4ed8;
  --color-status-spontaneous: #6d28d9;
  --color-status-followup: #b45309;
  --color-status-interview: #047857;
  --color-status-rejected: #dc2626;
  --color-status-noreply: #52525b;

  /* Statuts Pipeline — fond+texte au repos (10 %), solid+on au survol/sélection */
  --color-status-new-bg: #f4f4f5;
  --color-status-new-fg: #52525b;
  --color-status-new-solid: #71717a;
  --color-status-new-on: #ffffff;
  --color-status-applied-bg: #eff6ff;
  --color-status-applied-fg: #1d4ed8;
  --color-status-applied-solid: #2563eb;
  --color-status-applied-on: #ffffff;
  --color-status-spontaneous-bg: #f5f3ff;
  --color-status-spontaneous-fg: #6d28d9;
  --color-status-spontaneous-solid: #7c3aed;
  --color-status-spontaneous-on: #ffffff;
  --color-status-followup-bg: #fef3c7;
  --color-status-followup-fg: #b45309;
  --color-status-followup-solid: #f59e0b;
  --color-status-followup-on: #451a03;
  --color-status-interview-bg: #d1fae5;
  --color-status-interview-fg: #047857;
  --color-status-interview-solid: #059669;
  --color-status-interview-on: #ffffff;
  --color-status-rejected-bg: #fee2e2;
  --color-status-rejected-fg: #b91c1c;
  --color-status-rejected-solid: #dc2626;
  --color-status-rejected-on: #ffffff;
  --color-status-noreply-bg: #f4f4f5;
  --color-status-noreply-fg: #52525b;
  --color-status-noreply-solid: #71717a;
  --color-status-noreply-on: #ffffff;

  --shadow-sm: 0 1px 2px rgba(9, 9, 11, 0.06);
  --shadow-md: 0 2px 6px rgba(9, 9, 11, 0.05), 0 8px 20px rgba(9, 9, 11, 0.06);
  --shadow-accent: 0 0 0 1px var(--color-accent), 0 4px 14px rgba(29, 78, 216, 0.18);

  --radius-sm: 6px;
  --radius-md: 10px;

  --font-display: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

body {
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
}

::selection {
  background-color: color-mix(in srgb, var(--color-accent) 20%, transparent);
  color: var(--color-text);
}

@keyframes harvest-reveal {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes bar-rise {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm --filter @job-harvester/web test`
Expected: all existing suites (`OfferTable`, `EventButtons`, `HarvestControl`) still PASS — they assert `aria-*` attributes and text, not colors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/index.html packages/web/src/index.css
git commit -m "style(web): retheme to Clean Light (Inter + JetBrains Mono)"
```

---

### Task 2: Expose derived `status` on `GET /offers`

**Files:**
- Modify: `packages/api/src/routes/offers.ts`
- Modify: `packages/api/src/app.test.ts`
- Modify: `packages/web/src/api/client.ts`

**Interfaces:**
- Consumes: `deriveStatus(events: {type:string; occurredAt:string}[]): string` (already exported at `packages/api/src/routes/offers.ts:18`).
- Produces: `OfferSummary.status: string` — `"new"` when the offer has no events, otherwise the type of its most recent event across all types. Consumed by Task 3 (`groupByStatus`).

- [ ] **Step 1: Write the failing API tests**

Add to `packages/api/src/app.test.ts`, inside `describe("GET /offers", ...)`:

```ts
  it("exposes status as the type of the most recent event across all types", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    db.insert(applicationEventsTable)
      .values([
        { id: "evt-1", offerId: sampleOffer.id, type: "applied", occurredAt: "2026-08-01T00:00:00.000Z" },
        { id: "evt-2", offerId: sampleOffer.id, type: "interview", occurredAt: "2026-08-05T00:00:00.000Z" },
      ])
      .run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { status: string }[] };

    expect(body.offers[0]!.status).toBe("interview");
  });

  it("exposes status 'new' when an offer has no events", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { status: string }[] };

    expect(body.offers[0]!.status).toBe("new");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @job-harvester/api test -- app.test.ts -t "exposes status"`
Expected: FAIL — `body.offers[0].status` is `undefined`.

- [ ] **Step 3: Add `statusByOfferId` and wire it into the response**

In `packages/api/src/routes/offers.ts`, add this function right after `activeEventsByOfferId` (after line 66):

```ts
// Statut courant = type de l'événement le plus récent, tous types confondus (même algorithme
// que deriveStatus(), déjà utilisé par GET /offers/:id et GET /stats) — c'est ce qui détermine
// la voie du Pipeline dans laquelle une offre apparaît côté web.
function statusByOfferId(db: Db, offerIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (offerIds.length === 0) return result;
  const rows = db
    .select({
      offerId: applicationEvents.offerId,
      type: applicationEvents.type,
      occurredAt: applicationEvents.occurredAt,
    })
    .from(applicationEvents)
    .where(inArray(applicationEvents.offerId, offerIds))
    .all();
  const eventsByOfferId = new Map<string, { type: string; occurredAt: string }[]>();
  for (const row of rows) {
    const list = eventsByOfferId.get(row.offerId) ?? [];
    list.push({ type: row.type, occurredAt: row.occurredAt });
    eventsByOfferId.set(row.offerId, list);
  }
  for (const offerId of offerIds) {
    result.set(offerId, deriveStatus(eventsByOfferId.get(offerId) ?? []));
  }
  return result;
}
```

Then in `registerOfferRoutes`'s `/offers` handler (around line 140-148), add the status lookup and attach it:

```ts
    const offerIds = rows.map((row) => row.id);
    const followUps = nextFollowUpByOfferId(db, offerIds);
    const activeEvents = activeEventsByOfferId(db, offerIds);
    const statuses = statusByOfferId(db, offerIds);
    const offers = rows.map((row) => ({
      ...rowToOffer(row),
      nextFollowUpAt: followUps.get(row.id) ?? null,
      activeEvents: activeEvents.get(row.id) ?? {},
      status: statuses.get(row.id) ?? "new",
    }));
    return c.json({ offers, nextCursor });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @job-harvester/api test -- app.test.ts`
Expected: PASS, including the two new tests and every pre-existing `GET /offers` / `GET /stats` test.

- [ ] **Step 5: Add `status` to the frontend type**

In `packages/web/src/api/client.ts`, add the field to `OfferSummary` (after `activeEvents`):

```ts
export interface OfferSummary {
  id: string;
  title: string;
  company: { name: string };
  location: { city: string };
  source: string;
  originSource?: string;
  postedAt?: string;
  contractType: string;
  applyUrl?: string;
  canonicalUrl: string;
  nextFollowUpAt?: string | null;
  activeEvents: Record<string, string>;
  status: string;
}
```

- [ ] **Step 6: Update the one existing fixture that constructs an `OfferSummary`**

In `packages/web/src/components/OfferTable.test.tsx`, add `status: overrides.status ?? "new",` to the `makeOffer()` return object (right after `activeEvents: {}`).

Run: `pnpm --filter @job-harvester/web typecheck`
Expected: no new TS errors from the added required field.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/offers.ts packages/api/src/app.test.ts packages/web/src/api/client.ts packages/web/src/components/OfferTable.test.tsx
git commit -m "feat(api,web): expose derived status per offer on GET /offers"
```

---

### Task 3: `groupByStatus` — bucket offers into Quai + 6 Pipeline lanes

**Files:**
- Create: `packages/web/src/lib/pipeline.ts`
- Test: `packages/web/src/lib/pipeline.test.ts`

**Interfaces:**
- Consumes: `OfferSummary` (`packages/web/src/api/client.ts`), specifically its `status` field (Task 2).
- Produces: `PIPELINE_LANES: PipelineLane[]`, `type LaneType`, `groupByStatus(offers): { quai: OfferSummary[]; lanes: Record<LaneType, OfferSummary[]> }` — consumed by Task 6 (`QuaiStrip`) and Task 8 (`PipelineBoard`).

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/pipeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { OfferSummary } from "../api/client.js";
import { PIPELINE_LANES, groupByStatus } from "./pipeline.js";

function makeOffer(id: string, status: string): OfferSummary {
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
    status,
  };
}

describe("PIPELINE_LANES", () => {
  it("has 6 lanes in the existing product order", () => {
    expect(PIPELINE_LANES.map((lane) => lane.type)).toEqual([
      "applied",
      "spontaneous",
      "followup",
      "interview",
      "rejected",
      "no_reply",
    ]);
  });
});

describe("groupByStatus", () => {
  it("puts offers with status 'new' in the quai and nowhere else", () => {
    const offers = [makeOffer("a", "new")];
    const { quai, lanes } = groupByStatus(offers);
    expect(quai.map((o) => o.id)).toEqual(["a"]);
    expect(Object.values(lanes).flat()).toHaveLength(0);
  });

  it("buckets each offer into the lane matching its status", () => {
    const offers = [makeOffer("a", "applied"), makeOffer("b", "interview"), makeOffer("c", "applied")];
    const { lanes } = groupByStatus(offers);
    expect(lanes.applied.map((o) => o.id)).toEqual(["a", "c"]);
    expect(lanes.interview.map((o) => o.id)).toEqual(["b"]);
    expect(lanes.rejected).toEqual([]);
  });

  it("returns empty buckets for an empty input", () => {
    const { quai, lanes } = groupByStatus([]);
    expect(quai).toEqual([]);
    for (const lane of PIPELINE_LANES) {
      expect(lanes[lane.type]).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/web test -- pipeline.test.ts`
Expected: FAIL — `Cannot find module './pipeline.js'`.

- [ ] **Step 3: Implement `pipeline.ts`**

Create `packages/web/src/lib/pipeline.ts`:

```ts
import type { OfferSummary } from "../api/client.js";

export type LaneType = "applied" | "spontaneous" | "followup" | "interview" | "rejected" | "no_reply";

export interface PipelineLane {
  type: LaneType;
  label: string;
}

// Ordre déjà établi côté produit par EventButtons — conservé pour continuité visuelle.
export const PIPELINE_LANES: PipelineLane[] = [
  { type: "applied", label: "Candidature" },
  { type: "spontaneous", label: "Spontané" },
  { type: "followup", label: "Relance" },
  { type: "interview", label: "Entretien" },
  { type: "rejected", label: "Refus" },
  { type: "no_reply", label: "Sans réponse" },
];

export interface GroupedOffers {
  quai: OfferSummary[];
  lanes: Record<LaneType, OfferSummary[]>;
}

function emptyLanes(): Record<LaneType, OfferSummary[]> {
  return {
    applied: [],
    spontaneous: [],
    followup: [],
    interview: [],
    rejected: [],
    no_reply: [],
  };
}

export function groupByStatus(offers: OfferSummary[]): GroupedOffers {
  const lanes = emptyLanes();
  const quai: OfferSummary[] = [];
  for (const offer of offers) {
    if (offer.status === "new") {
      quai.push(offer);
    } else if (offer.status in lanes) {
      lanes[offer.status as LaneType].push(offer);
    }
  }
  return { quai, lanes };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/web test -- pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/pipeline.ts packages/web/src/lib/pipeline.test.ts
git commit -m "feat(web): add groupByStatus to bucket offers into Quai + Pipeline lanes"
```

---

### Task 4: `StatusBadge` component

**Files:**
- Create: `packages/web/src/components/StatusBadge.tsx`
- Test: `packages/web/src/components/StatusBadge.test.tsx`

**Interfaces:**
- Consumes: `LaneType` from `../lib/pipeline.js` (Task 3), plus `"new"`.
- Produces: `StatusBadge({ status, solid? }: { status: LaneType | "new"; solid?: boolean })` — consumed by Task 6 (`QuaiStrip`) and Task 7 (`PipelineCard`).

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/StatusBadge.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge.js";

describe("StatusBadge", () => {
  it("renders the French label for each status", () => {
    render(<StatusBadge status="new" />);
    expect(screen.getByText("Collecté")).toBeInTheDocument();
  });

  it("renders the label for a pipeline lane status", () => {
    render(<StatusBadge status="interview" />);
    expect(screen.getByText("Entretien")).toBeInTheDocument();
  });

  it("applies the subtle (repos) classes by default", () => {
    render(<StatusBadge status="rejected" />);
    expect(screen.getByText("Refus")).toHaveClass("bg-status-rejected-bg", "text-status-rejected-fg");
  });

  it("applies the solid classes when solid is true", () => {
    render(<StatusBadge status="rejected" solid />);
    expect(screen.getByText("Refus")).toHaveClass("bg-status-rejected-solid", "text-status-rejected-on");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/web test -- StatusBadge.test.tsx`
Expected: FAIL — `Cannot find module './StatusBadge.js'`.

- [ ] **Step 3: Implement `StatusBadge.tsx`**

Tailwind v4 only generates a utility for class names that appear as literal strings in source — a template-literal like `` `bg-status-${suffix}-bg` `` would never match anything, so every class name is spelled out in a lookup table instead of interpolated.

Create `packages/web/src/components/StatusBadge.tsx`:

```tsx
import type { LaneType } from "../lib/pipeline.js";

export type StatusKey = LaneType | "new";

const STATUS_LABEL: Record<StatusKey, string> = {
  new: "Collecté",
  applied: "Candidature",
  spontaneous: "Spontané",
  followup: "Relance",
  interview: "Entretien",
  rejected: "Refus",
  no_reply: "Sans réponse",
};

const SUBTLE_CLASS: Record<StatusKey, string> = {
  new: "bg-status-new-bg text-status-new-fg",
  applied: "bg-status-applied-bg text-status-applied-fg",
  spontaneous: "bg-status-spontaneous-bg text-status-spontaneous-fg",
  followup: "bg-status-followup-bg text-status-followup-fg",
  interview: "bg-status-interview-bg text-status-interview-fg",
  rejected: "bg-status-rejected-bg text-status-rejected-fg",
  no_reply: "bg-status-noreply-bg text-status-noreply-fg",
};

const SOLID_CLASS: Record<StatusKey, string> = {
  new: "bg-status-new-solid text-status-new-on",
  applied: "bg-status-applied-solid text-status-applied-on",
  spontaneous: "bg-status-spontaneous-solid text-status-spontaneous-on",
  followup: "bg-status-followup-solid text-status-followup-on",
  interview: "bg-status-interview-solid text-status-interview-on",
  rejected: "bg-status-rejected-solid text-status-rejected-on",
  no_reply: "bg-status-noreply-solid text-status-noreply-on",
};

export function StatusBadge({ status, solid = false }: { status: StatusKey; solid?: boolean }) {
  const className = solid ? SOLID_CLASS[status] : SUBTLE_CLASS[status];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/web test -- StatusBadge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/StatusBadge.tsx packages/web/src/components/StatusBadge.test.tsx
git commit -m "feat(web): add StatusBadge (subtle repos / solid survol-sélection)"
```

---

### Task 5: `useSetOfferStatus` mutation hook

**Files:**
- Create: `packages/web/src/hooks/useSetOfferStatus.ts`
- Test: `packages/web/src/hooks/useSetOfferStatus.test.tsx`

**Interfaces:**
- Consumes: `postEvent(offerId, body)` (`packages/web/src/api/client.ts:100`).
- Produces: `useSetOfferStatus()` returning a `useMutation` accepting `{ offerId: string; type: string }` — consumed by Task 8 (`PipelineBoard`). Takes no arguments: invalidation targets the `["offers"]` key prefix, which React Query already matches against every `["offers", filters]` query regardless of the active filters, so there's no per-filters query key to build (unlike `useOfferEventMutation`, which needs the exact key for its optimistic update).

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/hooks/useSetOfferStatus.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/web test -- useSetOfferStatus.test.tsx`
Expected: FAIL — `Cannot find module './useSetOfferStatus.js'`.

- [ ] **Step 3: Implement the hook**

Create `packages/web/src/hooks/useSetOfferStatus.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postEvent } from "../api/client.js";

export interface SetOfferStatusVars {
  offerId: string;
  type: string;
}

// Déplacer une carte dans le Pipeline = poser un nouvel événement du type de la voie cible.
// Pas de suppression : l'historique reste append-only, cohérent avec deriveStatus() qui ne
// regarde que l'événement le plus récent. Invalidation par préfixe ["offers"] : React Query
// matche déjà toute query ["offers", filters] quels que soient les filtres actifs, pas besoin
// de connaître les filtres ici (contrairement à useOfferEventMutation et sa mise à jour
// optimiste, qui a besoin de la clé exacte).
export function useSetOfferStatus() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SetOfferStatusVars>({
    mutationFn: async ({ offerId, type }) => {
      await postEvent(offerId, { type });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/web test -- useSetOfferStatus.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useSetOfferStatus.ts packages/web/src/hooks/useSetOfferStatus.test.tsx
git commit -m "feat(web): add useSetOfferStatus mutation for Pipeline card moves"
```

---

### Task 6: `QuaiStrip` component

**Files:**
- Create: `packages/web/src/components/QuaiStrip.tsx`
- Test: `packages/web/src/components/QuaiStrip.test.tsx`

**Interfaces:**
- Consumes: `OfferSummary`, `StatusBadge` (Task 4).
- Produces: `QuaiStrip({ offers, collapsed, onToggleCollapsed }: { offers: OfferSummary[]; collapsed: boolean; onToggleCollapsed: () => void })` — consumed by Task 10 (`App.tsx`).

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/QuaiStrip.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/web test -- QuaiStrip.test.tsx`
Expected: FAIL — `Cannot find module './QuaiStrip.js'`.

- [ ] **Step 3: Implement `QuaiStrip.tsx`**

Create `packages/web/src/components/QuaiStrip.tsx`:

```tsx
import type { OfferSummary } from "../api/client.js";
import { StatusBadge } from "./StatusBadge.js";

interface QuaiStripProps {
  offers: OfferSummary[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// Le Quai n'est jamais un lieu de repos : toute offre qui y apparaît a status "new"
// (aucun événement encore posé) — voir groupByStatus (lib/pipeline.ts).
export function QuaiStrip({ offers, collapsed, onToggleCollapsed }: QuaiStripProps) {
  return (
    <section className="mb-4 rounded-md border border-border bg-surface" aria-label="Quai de réception">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="font-mono text-xs uppercase tracking-wide text-text-faint transition-colors duration-150 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool rounded-sm"
        >
          Quai · {offers.length} nouvelle{offers.length > 1 ? "s" : ""}
        </button>
      </div>
      {!collapsed &&
        (offers.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-text-muted">Aucune offre en attente de tri.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto px-3 pb-3">
            {offers.map((offer) => (
              <div key={offer.id} className="w-40 flex-none rounded-md border border-border bg-surface-raised px-2.5 py-2 text-xs">
                <p className="truncate font-medium text-text">{offer.title}</p>
                <p className="truncate font-mono text-[11px] text-text-muted">
                  {offer.location.city} · {offer.source}
                </p>
                <div className="mt-1">
                  <StatusBadge status="new" />
                </div>
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/web test -- QuaiStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/QuaiStrip.tsx packages/web/src/components/QuaiStrip.test.tsx
git commit -m "feat(web): add QuaiStrip (untriaged offers inbox)"
```

---

### Task 7: `PipelineCard` component

**Files:**
- Create: `packages/web/src/components/PipelineCard.tsx`
- Test: `packages/web/src/components/PipelineCard.test.tsx`

**Interfaces:**
- Consumes: `OfferSummary`, `StatusKey`/`StatusBadge` (Task 4).
- Produces: `PipelineCard({ offer, status, selected, onSelect, onDragStart }: { offer: OfferSummary; status: StatusKey; selected: boolean; onSelect: () => void; onDragStart: (offerId: string) => void })` — consumed by Task 8 (`PipelineBoard`).

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/PipelineCard.test.tsx`:

```tsx
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

  it("reflects the selected state via aria-pressed", () => {
    render(<PipelineCard offer={makeOffer()} status="interview" selected onSelect={vi.fn()} onDragStart={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Data Analyst" })).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onSelect when the card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PipelineCard offer={makeOffer()} status="interview" selected={false} onSelect={onSelect} onDragStart={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Data Analyst" }));
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/web test -- PipelineCard.test.tsx`
Expected: FAIL — `Cannot find module './PipelineCard.js'`.

- [ ] **Step 3: Implement `PipelineCard.tsx`**

Create `packages/web/src/components/PipelineCard.tsx`:

```tsx
import type { DragEvent } from "react";
import type { OfferSummary } from "../api/client.js";
import { StatusBadge, type StatusKey } from "./StatusBadge.js";

interface PipelineCardProps {
  offer: OfferSummary;
  status: StatusKey;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (offerId: string) => void;
}

export function PipelineCard({ offer, status, selected, onSelect, onDragStart }: PipelineCardProps) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", offer.id);
    onDragStart(offer.id);
  };

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      aria-label={offer.title}
      onClick={onSelect}
      className={`rounded-md border bg-surface px-2.5 py-2 text-xs transition-colors duration-150 ${
        selected ? "border-accent outline outline-2 outline-accent" : "border-border hover:border-accent/40"
      }`}
    >
      <div
        draggable
        onDragStart={handleDragStart}
        aria-label="Glisser pour déplacer"
        className="mb-1 h-3 w-4 cursor-grab text-text-faint"
      >
        ⠿
      </div>
      <a
        href={offer.applyUrl ?? offer.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="block truncate font-medium text-text underline decoration-border decoration-1 underline-offset-2 hover:text-accent hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool rounded-sm"
      >
        {offer.title}
      </a>
      <div className="mt-0.5 truncate font-mono text-[11px] text-text-muted">
        {offer.location.city} · {offer.source}
      </div>
      <div className="mt-1">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/web test -- PipelineCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/PipelineCard.tsx packages/web/src/components/PipelineCard.test.tsx
git commit -m "feat(web): add PipelineCard (draggable, selectable, status badge)"
```

---

### Task 8: `PipelineBoard` component (lanes, keyboard nav, drag-and-drop)

**Files:**
- Create: `packages/web/src/components/PipelineBoard.tsx`
- Test: `packages/web/src/components/PipelineBoard.test.tsx`

**Interfaces:**
- Consumes: `PIPELINE_LANES`, `groupByStatus`, `LaneType` (Task 3); `PipelineCard` (Task 7); `useSetOfferStatus` (Task 5); `OfferSummary` (`api/client.ts`).
- Produces: `PipelineBoard({ offers, hideRejected }: { offers: OfferSummary[]; hideRejected: boolean })` — consumed by Task 10 (`App.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/components/PipelineBoard.test.tsx`:

```tsx
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
    expect(screen.getByText("Candidature")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Offre a" }));
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

    await user.click(screen.getByRole("button", { name: "Offre a" }));
    expect(screen.getByRole("button", { name: "Offre a" })).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("j");
    expect(screen.getByRole("button", { name: "Offre a" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Offre b" })).toHaveAttribute("aria-pressed", "true");
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

  it("has no detectable accessibility violations", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = renderWithClient(
      <PipelineBoard offers={[makeOffer("a", "applied"), makeOffer("b", "interview")]} hideRejected={false} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @job-harvester/web test -- PipelineBoard.test.tsx`
Expected: FAIL — `Cannot find module './PipelineBoard.js'`.

- [ ] **Step 3: Implement `PipelineBoard.tsx`**

Create `packages/web/src/components/PipelineBoard.tsx`:

```tsx
import { useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import type { OfferSummary } from "../api/client.js";
import { PIPELINE_LANES, groupByStatus, type LaneType } from "../lib/pipeline.js";
import { useSetOfferStatus } from "../hooks/useSetOfferStatus.js";
import { PipelineCard } from "./PipelineCard.js";

interface Selection {
  laneIndex: number;
  offerIndex: number;
}

interface PipelineBoardProps {
  offers: OfferSummary[];
  hideRejected: boolean;
}

// Les touches 1-6 assignent toujours la voie canonique de PIPELINE_LANES (indépendamment de
// hideRejected) : masquer visuellement le Refus n'empêche pas d'y classer une carte au clavier.
export function PipelineBoard({ offers, hideRejected }: PipelineBoardProps) {
  const grouped = useMemo(() => groupByStatus(offers), [offers]);
  const lanes = useMemo(
    () => PIPELINE_LANES.filter((lane) => !hideRejected || lane.type !== "rejected"),
    [hideRejected],
  );
  const setStatus = useSetOfferStatus();
  const [selection, setSelection] = useState<Selection | null>(null);

  const offersInLane = (laneIndex: number): OfferSummary[] => {
    const lane = lanes[laneIndex];
    return lane ? grouped.lanes[lane.type] : [];
  };

  const select = (laneIndex: number, offerIndex: number) => {
    const list = offersInLane(laneIndex);
    if (list.length === 0) {
      setSelection(null);
      return;
    }
    setSelection({ laneIndex, offerIndex: Math.max(0, Math.min(list.length - 1, offerIndex)) });
  };

  const handleBoardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selection) return;
    if (event.key === "j") {
      event.preventDefault();
      select(selection.laneIndex, selection.offerIndex + 1);
    } else if (event.key === "k") {
      event.preventDefault();
      select(selection.laneIndex, selection.offerIndex - 1);
    } else if (event.key === "l") {
      event.preventDefault();
      select(Math.min(lanes.length - 1, selection.laneIndex + 1), 0);
    } else if (event.key === "h") {
      event.preventDefault();
      select(Math.max(0, selection.laneIndex - 1), 0);
    } else if (event.key === "Escape") {
      setSelection(null);
    } else if (event.key === "Enter") {
      const offer = offersInLane(selection.laneIndex)[selection.offerIndex];
      if (offer) window.open(offer.applyUrl ?? offer.canonicalUrl, "_blank", "noopener,noreferrer");
    } else {
      const n = Number(event.key);
      if (Number.isInteger(n) && n >= 1 && n <= PIPELINE_LANES.length) {
        const offer = offersInLane(selection.laneIndex)[selection.offerIndex];
        const targetLane = PIPELINE_LANES[n - 1]!;
        if (offer) setStatus.mutate({ offerId: offer.id, type: targetLane.type });
      }
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetType: LaneType) => {
    event.preventDefault();
    const offerId = event.dataTransfer.getData("text/plain");
    if (offerId) setStatus.mutate({ offerId, type: targetType });
  };

  return (
    <div
      role="group"
      aria-label="Pipeline de candidatures"
      tabIndex={0}
      onKeyDown={handleBoardKeyDown}
      className="grid gap-3 overflow-x-auto pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool rounded-md"
      style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(11rem, 1fr))` }}
    >
      {lanes.map((lane, laneIndex) => {
        const list = offersInLane(laneIndex);
        return (
          <div
            key={lane.type}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, lane.type)}
            className="flex min-h-[6rem] flex-col gap-2 rounded-md border border-border bg-surface-raised p-2"
          >
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-text-faint">
              <span>{lane.label}</span>
              <span className="tabular-nums">{list.length}</span>
            </div>
            {list.length === 0 && <p className="text-[11px] text-text-faint">—</p>}
            {list.map((offer, offerIndex) => (
              <PipelineCard
                key={offer.id}
                offer={offer}
                status={lane.type}
                selected={selection?.laneIndex === laneIndex && selection.offerIndex === offerIndex}
                onSelect={() => select(laneIndex, offerIndex)}
                onDragStart={() => {}}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @job-harvester/web test -- PipelineBoard.test.tsx`
Expected: PASS. If the "dropping a card on a lane" test can't locate the lane container via `.closest("div")!.parentElement!`, adjust the selector to target the element with `onDrop` (the lane wrapper `div`) directly — e.g. give that `div` a `data-testid={`lane-${lane.type}`}` and query with `screen.getByTestId("lane-rejected")` instead; keep the assertion on `fetchMock` unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/PipelineBoard.tsx packages/web/src/components/PipelineBoard.test.tsx
git commit -m "feat(web): add PipelineBoard (6-lane kanban, keyboard nav, drag-and-drop)"
```

---

### Task 9: `PipelineFilters` component (source chips + masquer les refus)

**Files:**
- Create: `packages/web/src/components/PipelineFilters.tsx`
- Test: `packages/web/src/components/PipelineFilters.test.tsx`

**Interfaces:**
- Produces: `PipelineFilters({ sources, excludedSources, onToggleSource, hideRejected, onToggleHideRejected }: { sources: string[]; excludedSources: Set<string>; onToggleSource: (source: string) => void; hideRejected: boolean; onToggleHideRejected: () => void })` — consumed by Task 10 (`App.tsx`).

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/PipelineFilters.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PipelineFilters } from "./PipelineFilters.js";

describe("PipelineFilters", () => {
  it("renders one toggle chip per source, pressed when not excluded", () => {
    render(
      <PipelineFilters
        sources={["francetravail", "labonnealternance"]}
        excludedSources={new Set(["labonnealternance"])}
        onToggleSource={vi.fn()}
        hideRejected={false}
        onToggleHideRejected={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "francetravail" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "labonnealternance" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onToggleSource with the clicked source", async () => {
    const user = userEvent.setup();
    const onToggleSource = vi.fn();
    render(
      <PipelineFilters
        sources={["francetravail"]}
        excludedSources={new Set()}
        onToggleSource={onToggleSource}
        hideRejected={false}
        onToggleHideRejected={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "francetravail" }));
    expect(onToggleSource).toHaveBeenCalledWith("francetravail");
  });

  it("reflects hideRejected via the switch's aria-checked and toggles it on click", async () => {
    const user = userEvent.setup();
    const onToggleHideRejected = vi.fn();
    render(
      <PipelineFilters sources={[]} excludedSources={new Set()} onToggleSource={vi.fn()} hideRejected onToggleHideRejected={onToggleHideRejected} />,
    );
    const toggle = screen.getByRole("switch", { name: "Masquer les refus" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(onToggleHideRejected).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/web test -- PipelineFilters.test.tsx`
Expected: FAIL — `Cannot find module './PipelineFilters.js'`.

- [ ] **Step 3: Implement `PipelineFilters.tsx`**

Create `packages/web/src/components/PipelineFilters.tsx`:

```tsx
interface PipelineFiltersProps {
  sources: string[];
  excludedSources: Set<string>;
  onToggleSource: (source: string) => void;
  hideRejected: boolean;
  onToggleHideRejected: () => void;
}

// Filtres client uniquement, appliqués sur la page déjà chargée (comme "à relancer uniquement"
// dans App.tsx) — pas de paramètre d'API supplémentaire pour ce lot.
export function PipelineFilters({ sources, excludedSources, onToggleSource, hideRejected, onToggleHideRejected }: PipelineFiltersProps) {
  return (
    <div role="group" aria-label="Filtres du pipeline" className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      {sources.map((source) => {
        const pressed = !excludedSources.has(source);
        return (
          <button
            key={source}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggleSource(source)}
            className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool ${
              pressed ? "border-accent/40 text-text" : "border-border text-text-faint opacity-50"
            }`}
          >
            {source}
          </button>
        );
      })}
      <button
        type="button"
        role="switch"
        aria-checked={hideRejected}
        aria-label="Masquer les refus"
        onClick={onToggleHideRejected}
        className={`ml-auto rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool ${
          hideRejected ? "border-status-rejected-solid bg-status-rejected-bg text-status-rejected-fg" : "border-border text-text-muted"
        }`}
      >
        Masquer les refus
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/web test -- PipelineFilters.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/PipelineFilters.tsx packages/web/src/components/PipelineFilters.test.tsx
git commit -m "feat(web): add PipelineFilters (source chips, masquer les refus)"
```

---

### Task 10: Wire `App.tsx` to Quai + Pipeline

**Files:**
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `QuaiStrip` (Task 6), `PipelineBoard` (Task 8), `PipelineFilters` (Task 9), `groupByStatus`-free filtering (App does its own `status === "new"` filter for the Quai count, mirroring Task 3's bucketing since `PipelineBoard` re-buckets internally from the same `offers` prop).

- [ ] **Step 1: Write the failing App test**

Create `packages/web/src/App.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";

function stubFetch() {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/campaigns")) {
      return new Response(JSON.stringify({ campaigns: [{ id: "alternance-data-hdf" }] }), { status: 200 });
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/web test -- App.test.tsx`
Expected: FAIL — current `App.tsx` renders `OfferTable`, not `QuaiStrip`/`PipelineBoard`; `role="group" name="Pipeline de candidatures"` doesn't exist yet.

- [ ] **Step 3: Rewrite `App.tsx`**

Replace the full contents of `packages/web/src/App.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HarvestControl } from "./components/HarvestControl.js";
import { FilterBar } from "./components/FilterBar.js";
import { QuaiStrip } from "./components/QuaiStrip.js";
import { PipelineBoard } from "./components/PipelineBoard.js";
import { PipelineFilters } from "./components/PipelineFilters.js";
import { useUrlFilters } from "./hooks/useUrlFilters.js";
import { useOffersQuery } from "./hooks/useOffersQuery.js";
import { getCampaigns } from "./api/client.js";

export default function App() {
  const { filters, setFilters } = useUrlFilters();
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const campaignId = filters.campaignId || campaigns?.[0]?.id;
  const offersQuery = useOffersQuery({ ...filters, campaignId });
  const offers = useMemo(() => offersQuery.data?.pages.flatMap((page) => page.offers) ?? [], [offersQuery.data]);

  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [hideRejected, setHideRejected] = useState(false);
  const [excludedSources, setExcludedSources] = useState<Set<string>>(new Set());
  const [quaiCollapsed, setQuaiCollapsed] = useState(false);

  const displayedOffers = useMemo(() => {
    let result = offers;
    if (followUpOnly) {
      const now = new Date().toISOString();
      result = result.filter((offer) => offer.nextFollowUpAt && offer.nextFollowUpAt <= now);
    }
    if (excludedSources.size > 0) {
      result = result.filter((offer) => !excludedSources.has(offer.source));
    }
    return result;
  }, [offers, followUpOnly, excludedSources]);

  const sources = useMemo(() => Array.from(new Set(offers.map((offer) => offer.source))).sort(), [offers]);
  const toggleSource = (source: string) => {
    setExcludedSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const quaiOffers = useMemo(() => displayedOffers.filter((offer) => offer.status === "new"), [displayedOffers]);

  return (
    <main className="min-h-screen bg-background text-text p-6 max-w-[1400px] mx-auto">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-text tracking-tight">job-harvester</h1>
      </header>

      <HarvestControl
        campaignId={campaignId ?? ""}
        onCampaignChange={(id) => setFilters((current) => ({ ...current, campaignId: id }))}
      />
      <FilterBar filters={filters} onChange={setFilters} />
      <div className="mb-3">
        <button
          type="button"
          role="switch"
          aria-checked={followUpOnly}
          onClick={() => setFollowUpOnly((v) => !v)}
          className="flex items-center gap-2 text-sm text-text rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cool"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${
              followUpOnly ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-text transition-transform duration-150 ${
                followUpOnly ? "translate-x-[18px]" : "translate-x-[2px]"
              }`}
            />
          </span>
          À relancer uniquement
        </button>
      </div>
      <PipelineFilters
        sources={sources}
        excludedSources={excludedSources}
        onToggleSource={toggleSource}
        hideRejected={hideRejected}
        onToggleHideRejected={() => setHideRejected((v) => !v)}
      />
      {offersQuery.isLoading && (
        <div className="rounded-md border border-border px-6 py-10 text-center">
          <p className="text-sm text-text-muted">Chargement des offres…</p>
        </div>
      )}
      {offersQuery.error && (
        <div className="rounded-md border border-danger/40 bg-surface px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-danger">Erreur de chargement des offres.</p>
          <button
            type="button"
            onClick={() => offersQuery.refetch()}
            className="text-xs px-2.5 py-1.5 rounded-sm border border-danger/40 text-text transition-colors duration-150 hover:border-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool"
          >
            Réessayer
          </button>
        </div>
      )}
      {!offersQuery.isLoading && !offersQuery.error && (
        <>
          <QuaiStrip offers={quaiOffers} collapsed={quaiCollapsed} onToggleCollapsed={() => setQuaiCollapsed((v) => !v)} />
          <PipelineBoard offers={displayedOffers} hideRejected={hideRejected} />
        </>
      )}
      {offersQuery.hasNextPage && (
        <button
          type="button"
          onClick={() => offersQuery.fetchNextPage()}
          disabled={offersQuery.isFetchingNextPage}
          className="mt-3 text-sm px-3 py-1.5 rounded-sm border border-border text-text transition-colors duration-150 hover:border-accent-cool disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool"
        >
          {offersQuery.isFetchingNextPage ? "Chargement…" : "Charger plus d'offres"}
        </button>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/web test -- App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full web suite**

Run: `pnpm --filter @job-harvester/web test`
Expected: PASS for every suite except (if not yet deleted) any assertions in `OfferTable.test.tsx`/`EventButtons.test.tsx` that depended on being rendered from `App` — those two files are standalone unit tests of components still present on disk (not yet deleted until Task 12), so they remain green independently of `App.tsx`'s rewiring.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx
git commit -m "feat(web): wire App.tsx to QuaiStrip + PipelineBoard + PipelineFilters"
```

---

### Task 11: `HarvestControl` — 4-state collect button

**Files:**
- Modify: `packages/web/src/components/HarvestControl.tsx`
- Modify: `packages/web/src/components/HarvestControl.test.tsx`

**Interfaces:**
- No new exports; internal visual/state logic only. Existing `HarvestControlProps` unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/src/components/HarvestControl.test.tsx`, inside the `describe("HarvestControl", ...)` block (after the existing tests):

```tsx
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @job-harvester/web test -- HarvestControl.test.tsx`
Expected: FAIL — the button's accessible name never changes today; it always stays "Lancer la collecte".

- [ ] **Step 3: Implement the 4-state button**

In `packages/web/src/components/HarvestControl.tsx`, add a `successFlash` state and derive the button's tone/label. Add the import and state near the top of the component (after the existing `useState` calls at lines 32-34):

```tsx
  const [successFlash, setSuccessFlash] = useState(false);
```

Add `useEffect` to the imports (`import { useEffect, useState } from "react";`) and, right after the `mutation` definition (after line 49), add the flash-clearing effect:

```tsx
  useEffect(() => {
    if (!successFlash) return;
    const timer = setTimeout(() => setSuccessFlash(false), 1200);
    return () => clearTimeout(timer);
  }, [successFlash]);
```

Update the `mutation`'s `onSuccess` (lines 38-43) to trigger the flash only when every connector succeeded:

```tsx
    onSuccess: (result, id) => {
      setLastResult({ campaignId: id, ...result });
      setCollapsed(false);
      setRunSeq((n) => n + 1);
      setSuccessFlash(result.summaries.every((s) => s.ok));
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
```

Add derived state right before the `return` (after line 57's `const tone = ...`):

```tsx
  const failedCount = lastResult && "summaries" in lastResult ? lastResult.summaries.filter((s) => !s.ok).length : 0;
  const newOffersCount =
    lastResult && "summaries" in lastResult ? lastResult.summaries.reduce((sum, s) => sum + s.normalizedCount, 0) : 0;
  const hasFailure = failedCount > 0 || (lastResult ? "error" in lastResult : false);

  const buttonLabel = mutation.isPending
    ? "Collecte en cours…"
    : hasFailure
      ? `${failedCount} connecteur(s) en échec`
      : successFlash
        ? `+${newOffersCount} nouvelles offres`
        : "Lancer la collecte";

  const buttonToneClass = mutation.isPending
    ? "bg-surface-raised text-text-muted border border-border"
    : hasFailure
      ? "bg-danger text-white hover:brightness-110"
      : successFlash
        ? "bg-status-interview-solid text-status-interview-on"
        : "bg-accent text-white hover:brightness-110";
```

Replace the launch `<button>` (lines 105-118) with:

```tsx
        <button
          type="button"
          onClick={handleLaunch}
          disabled={!campaignId || mutation.isPending}
          className={`ml-auto flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors duration-150 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cool ${buttonToneClass}`}
        >
          {mutation.isPending && (
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full border-2 border-text-muted/40 border-t-text-muted animate-spin"
            />
          )}
          {buttonLabel}
        </button>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @job-harvester/web test -- HarvestControl.test.tsx`
Expected: PASS, including the pre-existing tests (they still query by the base name `"Lancer la collecte"` before any run, which is unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/HarvestControl.tsx packages/web/src/components/HarvestControl.test.tsx
git commit -m "feat(web): HarvestControl launch button reflects success/failure state"
```

---

### Task 12: Delete replaced components and unused tokens

**Files:**
- Delete: `packages/web/src/components/OfferTable.tsx`, `packages/web/src/components/OfferTable.test.tsx`
- Delete: `packages/web/src/components/EventButtons.tsx`, `packages/web/src/components/EventButtons.test.tsx`
- Delete: `packages/web/src/components/BulkActionBar.tsx`
- Delete: `packages/web/src/hooks/useToggleOfferEvent.ts`, `packages/web/src/hooks/useOfferEventMutation.ts`
- Modify: `packages/web/src/index.css` (remove the now-unused flat `--color-status-*` tokens added as a transition aid in Task 1)

**Interfaces:** None — this task only removes now-dead code. Nothing else in the codebase imports any of these files after Task 10.

- [ ] **Step 1: Confirm nothing still imports the files to be deleted**

Run: `grep -rn "OfferTable\|EventButtons\|BulkActionBar\|useToggleOfferEvent\|useOfferEventMutation" packages/web/src --include="*.tsx" --include="*.ts" -l`
Expected: only the files themselves (and each other, e.g. `EventButtons.tsx` importing `useToggleOfferEvent.ts`) — no references from `App.tsx` or any other surviving file.

- [ ] **Step 2: Delete the files**

```bash
git rm packages/web/src/components/OfferTable.tsx packages/web/src/components/OfferTable.test.tsx
git rm packages/web/src/components/EventButtons.tsx packages/web/src/components/EventButtons.test.tsx
git rm packages/web/src/components/BulkActionBar.tsx
git rm packages/web/src/hooks/useToggleOfferEvent.ts packages/web/src/hooks/useOfferEventMutation.ts
```

- [ ] **Step 3: Remove the transitional flat status tokens**

In `packages/web/src/index.css`, delete these six lines (added in Task 1 only to keep `EventButtons` styled until this task):

```css
  --color-status-applied: #1d4ed8;
  --color-status-spontaneous: #6d28d9;
  --color-status-followup: #b45309;
  --color-status-interview: #047857;
  --color-status-rejected: #dc2626;
  --color-status-noreply: #52525b;
```

- [ ] **Step 4: Run typecheck and the full web + api suites**

Run: `pnpm --filter @job-harvester/web typecheck && pnpm --filter @job-harvester/web test && pnpm --filter @job-harvester/api test`
Expected: PASS — no dangling imports, no orphaned tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/index.css
git commit -m "chore(web): remove OfferTable/EventButtons/BulkActionBar, replaced by Pipeline"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (single status) → Task 2/3. §2 (6 lanes) → Task 3. §3 (Clean Light tokens) → Task 1/4. §4 (split-view) → Task 6/8/10. §5 (card interaction: keyboard + drag) → Task 8. §6 (4-state button, minus the incremental manifest which is explicitly out of scope) → Task 11. §7 (client-side filters) → Task 9/10. "Hors scope" items are not represented by any task, by design.
- **Type consistency checked:** `OfferSummary.status` (Task 2) flows unchanged into `groupByStatus` (Task 3), `StatusBadge`'s `StatusKey = LaneType | "new"` (Task 4), `PipelineCard`'s `status: StatusKey` (Task 7), `PipelineBoard`'s lane typing via `LaneType` (Task 8). `useSetOfferStatus`'s `SetOfferStatusVars` (Task 5) matches the `{ offerId, type }` shape `PipelineBoard` calls it with (Task 8).
