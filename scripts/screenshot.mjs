// Visual verification across device classes — phone / tablet / laptop / desktop.
import { chromium } from "playwright-core";

const DEVICES = [
  { name: "phone-portrait", width: 390, height: 844, dsf: 2 }, // iPhone 14/15
  { name: "phone-landscape", width: 844, height: 390, dsf: 2 },
  { name: "tablet-portrait", width: 820, height: 1180, dsf: 2 }, // iPad Air
  { name: "tablet-landscape", width: 1180, height: 820, dsf: 2 },
  { name: "laptop", width: 1280, height: 800, dsf: 1 },
  { name: "desktop", width: 1440, height: 900, dsf: 1 },
];

const browser = await chromium.launch({ channel: "msedge" });

for (const d of DEVICES) {
  const page = await browser.newPage({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.dsf,
    isMobile: d.width < 844,
    hasTouch: d.width < 844,
  });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // let entrance animations settle
  await page.screenshot({ path: `shots/${d.name}-fold.png` });
  if (d.name === "phone-portrait") {
    await page.screenshot({ path: `shots/${d.name}-full.png`, fullPage: true });
  }
  await page.close();
  console.log(`✓ ${d.name}`);
}

await browser.close();
console.log("done — shots/");
