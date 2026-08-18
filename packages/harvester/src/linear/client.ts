const LINEAR_API_URL = "https://api.linear.app/graphql";

export interface LinearIssueRef {
  id: string;
  identifier: string;
  title: string;
  state: { name: string };
}

interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function linearRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY is not set");

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API request failed: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as LinearGraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Linear API returned errors: ${json.errors.map((e) => e.message).join(", ")}`);
  }
  if (!json.data) throw new Error("Linear API response is missing data");
  return json.data;
}

function requireTeamId(): string {
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!teamId) throw new Error("LINEAR_TEAM_ID is not set");
  return teamId;
}

export async function searchIssueByTitle(query: string): Promise<LinearIssueRef[]> {
  const teamId = requireTeamId();
  const data = await linearRequest<{ issues: { nodes: LinearIssueRef[] } }>(
    `query($query: String!, $teamId: ID!) {
      issues(filter: { title: { contains: $query }, team: { id: { eq: $teamId } } }) {
        nodes { id identifier title state { name } }
      }
    }`,
    { query, teamId },
  );
  return data.issues.nodes;
}

async function resolveLabelIds(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const teamId = requireTeamId();
  const data = await linearRequest<{ issueLabels: { nodes: Array<{ id: string; name: string }> } }>(
    `query($teamId: ID!) {
      issueLabels(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name }
      }
    }`,
    { teamId },
  );

  const existingByName = new Map(data.issueLabels.nodes.map((label) => [label.name, label.id]));
  const labelIds: string[] = [];
  for (const name of names) {
    const existingId = existingByName.get(name);
    if (existingId) {
      labelIds.push(existingId);
      continue;
    }
    const created = await linearRequest<{ issueLabelCreate: { issueLabel: { id: string } } }>(
      `mutation($name: String!, $teamId: String!) {
        issueLabelCreate(input: { name: $name, teamId: $teamId }) {
          issueLabel { id }
        }
      }`,
      { name, teamId },
    );
    labelIds.push(created.issueLabelCreate.issueLabel.id);
  }
  return labelIds;
}

export async function createIssue(input: { title: string; description: string; labelIds: string[] }): Promise<LinearIssueRef> {
  const teamId = requireTeamId();
  const resolvedLabelIds = await resolveLabelIds(input.labelIds);
  const data = await linearRequest<{ issueCreate: { issue: LinearIssueRef } }>(
    `mutation($teamId: String!, $title: String!, $description: String, $labelIds: [String!]) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description, labelIds: $labelIds }) {
        issue { id identifier title state { name } }
      }
    }`,
    { teamId, title: input.title, description: input.description, labelIds: resolvedLabelIds },
  );
  return data.issueCreate.issue;
}

export async function commentOnIssue(issueId: string, body: string): Promise<void> {
  await linearRequest(
    `mutation($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }`,
    { issueId, body },
  );
}

export async function transitionIssueState(issueId: string, stateName: string): Promise<void> {
  const teamId = requireTeamId();
  const data = await linearRequest<{ workflowStates: { nodes: Array<{ id: string; name: string }> } }>(
    `query($teamId: ID!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name }
      }
    }`,
    { teamId },
  );

  const state = data.workflowStates.nodes.find((s) => s.name === stateName);
  if (!state) throw new Error(`Linear workflow state not found: ${stateName}`);

  await linearRequest(
    `mutation($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
    }`,
    { issueId, stateId: state.id },
  );
}
