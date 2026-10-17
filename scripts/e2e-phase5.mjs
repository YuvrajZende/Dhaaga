// E2E visual verification for Phase 5: /onboarding
import { chromium } from "playwright-core";
import fs from "node:fs";

const TARGET_DIR = "shots";
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, dsf: 1, isMobile: false },
  { name: "mobile", width: 390, height: 844, dsf: 2, isMobile: true },
];

async function main() {
  const browser = await chromium.launch({ channel: "msedge" }).catch(async () => {
    return await chromium.launch({ channel: "chrome" });
  });

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });

    try {
      await page.goto("http://localhost:3005/onboarding", { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${TARGET_DIR}/phase5-${vp.name}-onboarding.png` });
      console.log(`✓ onboarding (${vp.name}) captured`);
    } catch (err) {
      console.warn(`! onboarding (${vp.name}) failed:`, err.message);
    }

    await page.close();
  }

  await browser.close();
  console.log("Phase 5 E2E visual verification completed.");
}

main().catch((err) => {
  console.error("E2E script error:", err);
  process.exit(1);
});
