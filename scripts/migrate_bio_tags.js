const { Client } = require("pg");
require("dotenv").config();

const c = new Client(process.env.DATABASE_URL);

async function run() {
  await c.connect();
  await c.query("ALTER TABLE people ADD COLUMN IF NOT EXISTS bio text");
  await c.query("ALTER TABLE people ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb");
  console.log("Migration OK: bio and tags columns added to people table");
  await c.end();
}

run().catch((e) => {
  console.error("Migration failed:", e.message);
  c.end();
  process.exit(1);
});
