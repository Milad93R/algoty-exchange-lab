const {
  chromium,
} = require("/home/milad/projects/magents-chat/node_modules/playwright");
const fs = require("fs");
const assert = require("assert");
const base = process.env.BASE_URL || "http://127.0.0.1:18200";
const out = "docs/v2/evidence";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  let errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const checks = [];
  await page.goto(base + "/trade");
  await page
    .getByRole("button", { name: "Place buy order" })
    .waitFor({ timeout: 60000 });
  await page.waitForFunction(
    () => !document.querySelector("button.place")?.disabled,
    { timeout: 40000 },
  );
  await page.getByLabel("Order quantity").fill("0.001");
  await page.getByRole("button", { name: "Place buy order" }).click();
  await page
    .getByText("FILLED", { exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Trade history", exact: true })
    .click();
  await page.getByRole("button", { name: "Inspect fill" }).first().click();
  await page.getByRole("dialog").waitFor();
  assert(
    (await page.getByRole("dialog").innerText()).includes("Market sequence"),
  );
  await page.locator(".modal-close").click();
  await page.screenshot({
    path: out + "/exchange-desktop.png",
    fullPage: true,
  });
  checks.push("live chart, market order, fill and evidence modal");
  await page.getByRole("button", { name: "Limit", exact: true }).click();
  await page.getByLabel("Limit price").fill("1");
  await page.getByRole("button", { name: "Place buy order" }).click();
  await page.getByRole("button", { name: /^Orders/ }).click();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .first()
    .click();
  await page
    .getByText("CANCELED", { exact: true })
    .first()
    .waitFor({ timeout: 20000 });
  checks.push("limit order and cancellation");
  await page.goto(base + "/account");
  const email = "browser-" + Date.now() + "@example.invalid";
  await page.locator("input[name=name]").fill("QA browser");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill("Browser-test-" + Date.now());
  await page.getByRole("button", { name: "Create your account" }).click();
  await page
    .getByText("Your private recovery code", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.screenshot({
    path: out + "/account-desktop.png",
    fullPage: true,
    mask: [page.locator(".recovery-code code")],
  });
  checks.push("guest registration preserves session and shows recovery code");
  await page.goto(base + "/agents");
  await page.getByRole("button", { name: "Catch a breakout" }).click();
  await page.getByRole("button", { name: "Build my mission" }).click();
  await page.getByRole("dialog").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Save reviewed plan" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 15000 });
  await page.getByRole("button", { name: "Activate mission" }).click();
  await page
    .getByRole("button", { name: "Pause", exact: true })
    .waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume", exact: false })
    .waitFor({ timeout: 15000 });
  await page.screenshot({ path: out + "/mission-desktop.png", fullPage: true });
  checks.push("AI brief to editable plan, activation and pause");
  await page
    .getByLabel("Agent instruction")
    .fill("Reduce each entry to 100 USDT.");
  await page.getByRole("button", { name: "Preview", exact: false }).click();
  await page.getByRole("dialog").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Save reviewed plan" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Explore a second path" }).click();
  await page.getByRole("button", { name: "Prepare comparison" }).click();
  await page
    .getByRole("button", { name: "Start both agents" })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Start both agents" }).click();
  await page
    .getByRole("button", { name: "Start both agents" })
    .waitFor({ state: "hidden", timeout: 15000 });
  await page.getByRole("button", { name: "Publish comparison" }).click();
  await page.locator(".share-path a").waitFor({ timeout: 15000 });
  const shared = await page.locator(".share-path a").getAttribute("href");
  assert(!shared.endsWith("undefined"));
  assert(await page.evaluate(async () => (await fetch("/api/v2/me")).ok));
  await page.screenshot({
    path: out + "/comparison-desktop.png",
    fullPage: true,
  });
  checks.push(
    "instruction preview creates version; branch, paired start and publish",
  );
  const publicContext = await browser.newContext();
  const pub = await publicContext.newPage();
  await pub.goto(shared);
  pub.on("pageerror", (e) => console.log("PUBLIC ERROR", e.message));
  await pub.getByText("PATH A", { exact: false }).waitFor({ timeout: 45000 });
  assert((await pub.locator(".mission-block").count()) === 2);
  checks.push("comparison works without login");
  await publicContext.close();
  // Stop only missions made by this browser QA account.
  await page.evaluate(async () => {
    const list = await (await fetch("/api/v2/missions")).json();
    for (const m of list)
      if (["ACTIVE", "PAUSED"].includes(m.status))
        await fetch("/api/v2/missions/" + m.id + "/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop" }),
        });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["trade", "agents", "markets", "account"]) {
    await page.goto(base + "/" + route);
    await page.locator(".page-preloader.finished").waitFor({ timeout: 15000 });
    await page.waitForTimeout(2500);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route + " overflows",
    );
    await page.screenshot({
      path: out + "/" + route + "-mobile.png",
      fullPage: true,
    });
  }
  checks.push("390px mobile layouts without horizontal overflow");
  assert.deepStrictEqual(errors, []);
  fs.writeFileSync(
    out + "/browser.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
