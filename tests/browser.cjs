const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/home/milad/projects/magents-chat/node_modules/playwright",
);
(async () => {
  const b = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    let errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto((process.env.DEMO_URL || "http://127.0.0.1:18200").replace(/\/$/, "") + "/trade", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await p.waitForFunction(
      () => document.body.innerText.includes("10,000.00"),
      { timeout: 30000 },
    );
    await p
      .getByRole("button", { name: "Place buy order", exact: true })
      .click();
    await p.getByText("FILLED", { exact: true }).waitFor({ timeout: 20000 });
    await p.screenshot({ path: "/tmp/exchange-desktop.png", fullPage: true });
    await p.getByRole("button", { name: "Account ledger" }).click();
    await p.screenshot({ path: "/tmp/exchange-ledger.png" });
    await p.getByRole("button", { name: "Research run" }).click();
    await p
      .getByRole("heading", { name: "A closer look at the strategy" })
      .waitFor();
    await p.getByRole("button", { name: "Replay equity" }).click();
    await p.getByRole("button", { name: "Pause replay" }).waitFor();
    await p.getByRole("button", { name: "Pause replay" }).click();
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({ path: "/tmp/exchange-mobile.png", fullPage: true });
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    if (errors.length || overflow)
      throw Error(JSON.stringify({ errors, overflow }));
    console.log(
      JSON.stringify({
        filled: true,
        ledger: true,
        research: true,
        mobileOverflow: overflow,
        errors,
      }),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
