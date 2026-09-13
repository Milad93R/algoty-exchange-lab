const {
  chromium,
} = require("/home/milad/projects/magents-chat/node_modules/playwright");
const assert = require("assert");
const fs = require("fs");

const base = process.env.BASE_URL || "http://127.0.0.1:18200";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/trade", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForFunction(
      () => !document.querySelector("button.place")?.disabled,
      { timeout: 40000 },
    );
    const market = await page.evaluate(async () =>
      (await fetch("/api/live?symbol=BTCUSDT&snapshot=1")).json(),
    );
    assert(!market.stale && market.asks.length && market.bids.length);
    const ask = market.asks[0].price;
    const bid = market.bids[0].price;
    await page.getByRole("button", { name: "OCO", exact: true }).click();
    await page
      .getByLabel("Limit price", { exact: true })
      .fill((Math.floor(bid * 0.9) / 100).toFixed(2));
    await page
      .getByLabel("OCO stop trigger")
      .fill((Math.ceil(ask * 1.1) / 100).toFixed(2));
    await page
      .getByLabel("OCO stop-limit price")
      .fill((Math.ceil(ask * 1.11) / 100).toFixed(2));
    await page.getByLabel("Order quantity").fill("0.001");
    await page.screenshot({
      path: "docs/v2/evidence/oco-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Place buy OCO" }).click();
    await page.getByText("OCO accepted", { exact: false }).waitFor({ timeout: 15000 });
    const row = page.locator("tbody tr").filter({ hasText: "OCO" }).first();
    await row.getByText("2 linked legs", { exact: true }).waitFor();
    assert((await row.innerText()).includes("Stop"));
    await row.getByRole("button", { name: "Cancel", exact: true }).click();
    await row.getByText("CANCELED", { exact: true }).waitFor({ timeout: 15000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/v2/evidence/oco-mobile.png",
      fullPage: true,
    });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "OCO ticket overflows at 390px",
    );
    assert.deepStrictEqual(errors, []);
    const evidence = {
      checks: [
        "OCO ticket exposes limit, stop trigger and stop-limit prices",
        "accepted OCO appears as one row with two linked legs",
        "canceling parent OCO changes its status to CANCELED",
        "390px OCO ticket has no horizontal overflow",
      ],
      errors,
    };
    fs.writeFileSync(
      "docs/v2/evidence/oco.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
