import pg from "pg";
import { readFileSync } from "node:fs";
const db = new pg.Client({
  connectionString: readFileSync(0, "utf8")
    .trim()
    .replace("sslmode=require", "sslmode=verify-full"),
});
try {
  await db.connect();
  await db.query("BEGIN");
  // A trusted direct database connection is used for batch maintenance.
  await db.query("SELECT pg_advisory_xact_lock(746391025)");
  await db.query("REFRESH MATERIALIZED VIEW financial.balance");
  await db.query("REFRESH MATERIALIZED VIEW financial.balance_history");
  await db.query("COMMIT");
  console.log("Balance and daily balance history refreshed.");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e.code, e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
