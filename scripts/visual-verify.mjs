// Visual verification for the Search V2 redesign.
// Mints a local dev session (dev fallback secret) against the user's own
// local DB, then screenshots: idle, searching, results (desktop + mobile),
// and the person drawer (desktop right sheet + mobile bottom sheet).
import { chromium } from "playwright-core";
import crypto from "node:crypto";
import { Client } from "pg";
import "dotenv/config";

const FALLBACK_SECRET = "fallback-secret-at-least-32-chars-long-development";
const QUERY = "I want a person who knows cooking";

function createSessionToken(user) {
  const payloadB64 = Buffer.from(
    JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || FALLBACK_SECRET)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

const db = new Client(process.env.DATABASE_URL);
await db.connect();
const { rows } = await db.query(
  "SELECT id, email, name, avatar_url AS \"avatarUrl\" FROM users ORDER BY created_at LIMIT 1"
);
await db.end();
if (rows.length === 0) {
  console.error("no users in local db — cannot verify signed-in UI");
  process.exit(1);
}
const sessionToken = createSessionToken(rows[0]);
console.log(`session minted for ${rows[0].email}`);

const browser = await chromium.launch({ channel: "msedge" });

async function newPage(width, height, mobile) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  await ctx.addCookies([
    { name: "happenstance_session", value: sessionToken, url: "http://localhost:3000" },
  ]);
  return ctx.newPage();
}

// ── Desktop ────────────────────────────────────────────────────────────
const page = await newPage(1440, 900, false);
await page.goto("http://localhost:3000/search", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/v2-desktop-idle.png" });
console.log("✓ desktop idle");

await page.fill('input[aria-label="Search contacts"]', QUERY);
await page.click('button[aria-label="Submit search"]');
await page.waitForTimeout(1200); // catch the progress checklist state
await page.screenshot({ path: "shots/v2-desktop-searching.png" });
console.log("✓ desktop searching");

await page.waitForSelector("text=/people? found/i", { timeout: 120000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: "shots/v2-desktop-results.png" });
console.log("✓ desktop results");

// Drawer: click the first result card
const firstCard = page.locator("article").first();
await firstCard.click();
await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/v2-desktop-drawer.png" });
console.log("✓ desktop drawer");
await page.context().close();

// ── Mobile ─────────────────────────────────────────────────────────────
const mpage = await newPage(390, 844, true);
await mpage.goto("http://localhost:3000/search", { waitUntil: "networkidle" });
await mpage.waitForTimeout(1200);
await mpage.fill('input[aria-label="Search contacts"]', QUERY);
await mpage.click('button[aria-label="Submit search"]');
await mpage.waitForSelector("text=/people? found/i", { timeout: 120000 });
await mpage.waitForTimeout(1500);
await mpage.screenshot({ path: "shots/v2-mobile-results.png" });
console.log("✓ mobile results");

const mcard = mpage.locator("article").first();
await mcard.click();
await mpage.waitForSelector('[role="dialog"]', { timeout: 30000 });
await mpage.waitForTimeout(1500);
await mpage.screenshot({ path: "shots/v2-mobile-drawer.png" });
console.log("✓ mobile drawer (bottom sheet)");
await mpage.context().close();

await browser.close();
console.log("done — shots/v2-*");