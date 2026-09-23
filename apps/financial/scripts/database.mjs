import pg from "pg";
import { readFileSync } from "node:fs";
// Pipe the direct connection string over stdin; never log credentials.
const connectionString = readFileSync(0, "utf8")
  .trim()
  .replace("sslmode=require", "sslmode=verify-full");
const client = new pg.Client({ connectionString });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(readFileSync(process.argv[2], "utf8"));
  await client.query("COMMIT");
  console.log("Database transaction committed: " + process.argv[2]);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    e.code,
    e.message,
    e.where ?? "",
    "position",
    e.position,
    e.position
      ? readFileSync(process.argv[2], "utf8").slice(
          Number(e.position) - 100,
          Number(e.position) + 100,
        )
      : "",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
