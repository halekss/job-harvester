import { searchIssueByTitle, createIssue, commentOnIssue, transitionIssueState, type LinearIssueRef } from "./client.js";

export type IncidentType = "volume-drop" | "health-check-failed" | "schema-mismatch";

const DONE_STATE_NAME = "Done";

function incidentTitle(connectorId: string, incidentType: IncidentType): string {
  return `[connector:${connectorId}] ${incidentType}`;
}

async function findOpenIncidentIssue(connectorId: string): Promise<LinearIssueRef | undefined> {
  const issues = await searchIssueByTitle(`[connector:${connectorId}]`);
  return issues.find((issue) => issue.state?.name !== DONE_STATE_NAME);
}

export async function reportIncident(
  connectorId: string,
  tier: 0 | 1 | 2,
  incidentType: IncidentType,
  details: string,
): Promise<void> {
  const existing = await findOpenIncidentIssue(connectorId);
  if (existing) {
    await commentOnIssue(existing.id, details);
    return;
  }

  await createIssue({
    title: incidentTitle(connectorId, incidentType),
    description: details,
    labelIds: [`tier-${tier}`, incidentType],
  });
}

export async function resolveIncidentIfHealthy(connectorId: string): Promise<void> {
  const existing = await findOpenIncidentIssue(connectorId);
  if (!existing) return;

  await commentOnIssue(existing.id, `Connector ${connectorId} is back to a healthy state.`);
  await transitionIssueState(existing.id, DONE_STATE_NAME);
}
