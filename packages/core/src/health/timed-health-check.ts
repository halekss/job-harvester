import type { ConnectorHealth } from "../schemas/connector.js";

// JOB-36 : les 4 connecteurs implémentaient chacun le même bloc try/catch (mesure de latence,
// probe réseau, forme de retour identique en succès comme en échec) — factorisé ici une fois le
// seuil de duplication (3+ copies) franchi.
//
// `probe` renvoie soit un `Response` fetch (LBA/Workday/SmartRecruiters : succès = `.ok`, échec
// HTTP = message `HTTP {status}`), soit toute autre valeur/`void` (France Travail : succès =
// n'a pas levé d'exception, l'échec réseau/auth se manifeste par un throw dans `probe`).
export async function timedHealthCheck(connectorId: string, probe: () => Promise<unknown>): Promise<ConnectorHealth> {
  const start = Date.now();
  try {
    const result = await probe();
    const isHttpResponse = result instanceof Response;
    return {
      connectorId,
      ok: isHttpResponse ? result.ok : true,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: isHttpResponse && !result.ok ? `HTTP ${result.status}` : undefined,
    };
  } catch (error) {
    return {
      connectorId,
      ok: false,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
