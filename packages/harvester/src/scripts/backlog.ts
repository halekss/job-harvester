import { createIssue, type LinearIssueRef } from "../linear/client.js";

export async function createBacklogIssue(title: string, description: string): Promise<LinearIssueRef> {
  return createIssue({ title, description, labelIds: [] });
}

if (process.argv[1]?.endsWith("backlog.ts") || process.argv[1]?.endsWith("backlog.js")) {
  const [, , title, description] = process.argv;
  if (!title || !description) {
    throw new Error('usage: harvester:backlog "<title>" "<description>"');
  }
  createBacklogIssue(title, description)
    .then((issue) => {
      console.log(`Created Linear issue ${issue.identifier} (${issue.id})`);
    })
    .catch((error) => {
      console.error("Failed to create Linear issue:", error);
      process.exitCode = 1;
    });
}
