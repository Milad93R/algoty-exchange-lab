const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/home/milad/projects/magents-chat/node_modules/playwright",
);
const assert = require("node:assert/strict");

const base = (process.env.DEMO_URL || "https://algoty.com").replace(/\/$/, "");
const timeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(`${base}/trade?chart-timeframes=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.locator(".ready-content").waitFor({
      state: "visible",
      timeout: 60_000,
    });

    const endpointResults = [];
    for (const timeframe of timeframes) {
      endpointResults.push(
        await page.evaluate(async (value) => {
          const response = await fetch(
            `/api/candles?symbol=BTCUSDT&timeframe=${value}`,
          );
          const contentType = response.headers.get("content-type") || "";
          const data = contentType.includes("application/json")
            ? await response.json()
            : { error: await response.text() };
          return {
            timeframe: value,
            status: response.status,
            returnedTimeframe: data.timeframe,
            candles: data.candles?.length || 0,
            valid:
              data.candles?.every(
                (row) =>
                  Number.isFinite(row.time) &&
                  Number.isFinite(row.open) &&
                  Number.isFinite(row.high) &&
                  Number.isFinite(row.low) &&
                  Number.isFinite(row.close) &&
                  Number.isFinite(row.volume),
              ) || false,
          };
        }, timeframe),
      );
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(3_000);

    const picker = page.getByRole("group", { name: "Chart timeframe" });
    assert.deepEqual(await picker.locator("button").allTextContents(), timeframes);

    const chartResults = [];
    for (const timeframe of timeframes) {
      await picker.getByRole("button", { name: timeframe, exact: true }).click();
      await page.waitForFunction(
        (value) => {
          const chart = document.querySelector(
            `svg[data-timeframe="${value}"]`,
          );
          return Number(chart?.dataset.candles || 0) >= 30;
        },
        timeframe,
        { timeout: 30_000 },
      );
      chartResults.push({
        timeframe,
        candles: Number(
          await page
            .locator(`svg[data-timeframe="${timeframe}"]`)
            .getAttribute("data-candles"),
        ),
        pressed: await picker
          .getByRole("button", { name: timeframe, exact: true })
          .getAttribute("aria-pressed"),
      });
    }

    await page.getByRole("link", { name: "Markets", exact: true }).first().click();
    await page.getByRole("link", { name: "Exchange", exact: true }).first().click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Chart timeframe"] button[aria-pressed="true"]')
          ?.textContent?.trim() === "1d",
      null,
      { timeout: 30_000 },
    );
    await page.screenshot({
      path: "/tmp/algoty-chart-timeframes-desktop.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 650 });
    const mobile = await page.evaluate(() => ({
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      pickerOverflow:
        document.querySelector(".chart-timeframes").scrollWidth >
        document.querySelector(".chart-timeframes").clientWidth,
      selected: document
        .querySelector('[aria-label="Chart timeframe"] button[aria-pressed="true"]')
        ?.textContent?.trim(),
    }));
    await page.screenshot({
      path: "/tmp/algoty-chart-timeframes-mobile.png",
      fullPage: true,
    });

    assert(endpointResults.every((row) => row.status === 200));
    assert(endpointResults.every((row) => row.returnedTimeframe === row.timeframe));
    assert(endpointResults.every((row) => row.candles === 500 && row.valid));
    assert(chartResults.every((row) => row.candles >= 30 && row.pressed === "true"));
    assert.equal(mobile.documentOverflow, false);
    assert.equal(mobile.selected, "1d");
    assert.deepEqual(errors, []);

    console.log(
      JSON.stringify({ endpointResults, chartResults, restored: true, mobile, errors }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
