const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/home/milad/projects/magents-chat/node_modules/playwright",
);
const assert = require("node:assert/strict");

const base = (process.env.DEMO_URL || "https://algoty.com").replace(/\/$/, "");
const timeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const errors = [];
  const historicalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/api\/candles\?.*endTime=/.test(request.url())) {
      historicalRequests.push(request.url());
    }
  });

  try {
    await page.goto(`${base}/trade?chart-history=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.locator(".ready-content").waitFor({ state: "visible", timeout: 60_000 });

    const endpointResults = [];
    for (const timeframe of timeframes) {
      endpointResults.push(
        await page.evaluate(async (value) => {
          const response = await fetch(`/api/candles?symbol=BTCUSDT&timeframe=${value}`);
          const contentType = response.headers.get("content-type") || "";
          const data = contentType.includes("application/json")
            ? await response.json()
            : { error: await response.text() };
          return {
            timeframe: value,
            status: response.status,
            returnedTimeframe: data.timeframe,
            candles: data.candles?.length || 0,
            oldest: data.candles?.[0]?.time,
            newest: data.candles?.at(-1)?.time,
            nextEndTime: data.nextEndTime,
            hasMore: data.hasMore,
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
      await page.waitForTimeout(300);
    }

    const firstHour = endpointResults.find((row) => row.timeframe === "1h");
    const olderPage = await page.evaluate(async ({ timeframe, endTime }) => {
      const response = await fetch(
        `/api/candles?symbol=BTCUSDT&timeframe=${timeframe}&endTime=${endTime}`,
      );
      const data = await response.json();
      return {
        status: response.status,
        candles: data.candles?.length || 0,
        oldest: data.candles?.[0]?.time,
        newest: data.candles?.at(-1)?.time,
        nextEndTime: data.nextEndTime,
        hasMore: data.hasMore,
      };
    }, { timeframe: "1h", endTime: firstHour.nextEndTime });

    assert(endpointResults.every((row) => row.status === 200));
    assert(endpointResults.every((row) => row.returnedTimeframe === row.timeframe));
    assert(endpointResults.every((row) => row.candles === 1_000 && row.valid));
    assert(endpointResults.every((row) => row.hasMore === true));
    assert.equal(olderPage.status, 200);
    assert.equal(olderPage.candles, 1_000);
    assert(olderPage.newest < firstHour.oldest);
    assert(olderPage.nextEndTime < firstHour.nextEndTime);
    historicalRequests.length = 0;
    await page.waitForTimeout(3_000);

    const picker = page.getByRole("group", { name: "Chart timeframe" });
    assert.deepEqual(await picker.locator("button").allTextContents(), timeframes);
    const chartResults = [];
    for (const timeframe of timeframes) {
      await picker.getByRole("button", { name: timeframe, exact: true }).click();
      await page.waitForFunction(
        (value) => {
          const chart = document.querySelector(
            `[data-testid="market-chart"][data-timeframe="${value}"]`,
          );
          return Number(chart?.dataset.loadedCandles || 0) >= 1_000;
        },
        timeframe,
        { timeout: 30_000 },
      );
      const chart = page.locator(
        `[data-testid="market-chart"][data-timeframe="${timeframe}"]`,
      );
      chartResults.push({
        timeframe,
        candles: Number(await chart.getAttribute("data-loaded-candles")),
        canvases: await chart.locator("canvas").count(),
        pressed: await picker
          .getByRole("button", { name: timeframe, exact: true })
          .getAttribute("aria-pressed"),
      });
      await page.waitForTimeout(250);
    }

    await picker.getByRole("button", { name: "1h", exact: true }).click();
    const chart = page.locator('[data-testid="market-chart"][data-timeframe="1h"]');
    await chart.waitFor({ state: "visible" });
    const beforeHistory = Number(await chart.getAttribute("data-loaded-candles"));
    const box = await chart.boundingBox();
    assert(box);
    await page.waitForTimeout(3_000);
    for (let attempt = 0; attempt < 18; attempt++) {
      if (Number(await chart.getAttribute("data-loaded-candles")) > beforeHistory) break;
      const y = box.y + box.height * 0.45;
      await page.mouse.move(box.x + box.width * 0.25, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.88, y, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(350);
    }
    await page.waitForFunction(
      (before) =>
        Number(
          document.querySelector('[data-testid="market-chart"][data-timeframe="1h"]')
            ?.dataset.loadedCandles || 0,
        ) > before,
      beforeHistory,
      { timeout: 30_000 },
    );
    const afterHistory = Number(await chart.getAttribute("data-loaded-candles"));
    assert(afterHistory >= beforeHistory + 1_000);
    assert(historicalRequests.length >= 1);

    const averageButton = page.getByRole("button", { name: "SMA 20", exact: true });
    await averageButton.click();
    assert.equal(await averageButton.getAttribute("aria-pressed"), "true");
    const latestButton = page.getByRole("button", { name: "Latest", exact: true });
    assert((await latestButton.getAttribute("class")).includes("is-away"));
    await latestButton.click();

    await picker.getByRole("button", { name: "1d", exact: true }).click();
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
    await page.screenshot({ path: "/tmp/algoty-interactive-chart-desktop.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 650 });
    await page.waitForTimeout(300);
    const mobile = await page.evaluate(() => {
      const chartElement = document.querySelector('[data-testid="market-chart"]');
      return {
        documentOverflow: document.documentElement.scrollWidth > innerWidth,
        chartOverflow: chartElement.scrollWidth > chartElement.clientWidth,
        chartCanvases: chartElement.querySelectorAll("canvas").length,
        selected: document
          .querySelector('[aria-label="Chart timeframe"] button[aria-pressed="true"]')
          ?.textContent?.trim(),
      };
    });
    await page.screenshot({ path: "/tmp/algoty-interactive-chart-mobile.png", fullPage: true });

    assert(chartResults.every((row) => row.candles >= 1_000));
    assert(chartResults.every((row) => row.canvases >= 2));
    assert(chartResults.every((row) => row.pressed === "true"));
    assert.equal(mobile.documentOverflow, false);
    assert.equal(mobile.chartOverflow, false);
    assert(mobile.chartCanvases >= 2);
    assert.equal(mobile.selected, "1d");
    assert.deepEqual(errors, []);

    console.log(
      JSON.stringify({
        endpointResults,
        olderPage,
        chartResults,
        infiniteHistory: {
          before: beforeHistory,
          after: afterHistory,
          requests: historicalRequests,
        },
        restored: true,
        mobile,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
