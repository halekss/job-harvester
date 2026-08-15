import { writeFileSync } from "node:fs";
import { createDb } from "../client.js";
import { applicationEvents } from "../schema.js";

export function exportEvents(dbPath: string, outPath: string): void {
  const db = createDb(dbPath);
  const rows = db.select().from(applicationEvents).all();
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
}

if (process.argv[1]?.endsWith("export-events.ts") || process.argv[1]?.endsWith("export-events.js")) {
  const [, , dbPath, outPath] = process.argv;
  if (!dbPath || !outPath) throw new Error("usage: export-events.ts <dbPath> <outPath>");
  exportEvents(dbPath, outPath);
}
