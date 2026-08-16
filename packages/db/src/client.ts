import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createDb(filePath: string) {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  // SQLite ne fait respecter les contraintes FOREIGN KEY que si on l'active explicitement
  // sur chaque connexion — sans ça, un événement référençant une offre inexistante est inséré
  // silencieusement (JOB-11).
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, "..", "migrations") });
  return db;
}
export type Db = ReturnType<typeof createDb>;
