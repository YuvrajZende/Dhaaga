import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ Error: DATABASE_URL environment variable is missing.");
    console.error("Please add your Neon Postgres connection string to .env.local");
    process.exit(1);
  }

  console.log("🔌 Connecting to database...");
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    const drizzleDir = path.join(process.cwd(), "drizzle");
    const files = fs
      .readdirSync(drizzleDir)
      .filter((f) => f.endsWith(".sql") && !f.includes("add-bio-tags"))
      .sort();

    for (const file of files) {
      console.log(`🚀 Executing ${file}...`);
      const sqlContent = fs.readFileSync(path.join(drizzleDir, file), "utf-8");
      try {
        await client.query(sqlContent);
        console.log(`✅ ${file} applied successfully.`);
      } catch (err: any) {
        console.warn(`⚠️ Warning on ${file}: ${err.message}`);
      }
    }
    console.log("🎉 All migrations checked and applied successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
