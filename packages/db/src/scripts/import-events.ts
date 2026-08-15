import { readFileSync } from "node:fs";
import { createDb } from "../client.js";
import { applicationEvents } from "../schema.js";

export function importEvents(dbPath: string, inPath: string): void {
  const db = createDb(dbPath);
  const rows = JSON.parse(readFileSync(inPath, "utf-8"));
  for (const row of rows) {
    db.insert(applicationEvents).values(row).onConflictDoNothing().run();
  }
}

if (process.argv[1]?.endsWith("import-events.ts") || process.argv[1]?.endsWith("import-events.js")) {
  const [, , dbPath, inPath] = process.argv;
  if (!dbPath || !inPath) throw new Error("usage: import-events.ts <dbPath> <inPath>");
  importEvents(dbPath, inPath);
}
