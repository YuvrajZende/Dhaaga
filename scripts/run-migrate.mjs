import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { Pool } = pg;

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ Error: DATABASE_URL environment variable is missing.");
    process.exit(1);
  }

  console.log("🔌 Connecting to database...");
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    const sqlPath = path.join(process.cwd(), "drizzle", "0000_init.sql");
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");

    console.log("🚀 Executing 0000_init.sql migration...");
    await client.query(sqlContent);
    console.log("✅ Database schema initialized successfully with import_rows table!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
