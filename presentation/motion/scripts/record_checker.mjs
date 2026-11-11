// Record real footage of the live judges' page with a visible cursor. Output: public/footage/*.webm
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const URL = "https://yasaswip012.github.io/atomiq-quantum-campaign/";
const OUT = path.resolve("public/footage");
fs.mkdirSync(OUT, { recursive: true });
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const browser = await chromium.launch({ executablePath: exe });

const CURSOR = `(() => { const c = document.createElement('div'); c.id='__cur';
  c.style.cssText='position:fixed;left:0;top:0;width:22px;height:22px;border-radius:50%;background:rgba(15,98,254,.35);border:2px solid #0F62FE;z-index:99999;pointer-events:none;transform:translate(-50%,-50%);transition:width .12s,height .12s';
  document.body.appendChild(c);
  addEventListener('mousemove', e => { c.style.left=e.clientX+'px'; c.style.top=e.clientY+'px'; }, true);
  addEventListener('mousedown', () => { c.style.width='16px'; c.style.height='16px'; }, true);
  addEventListener('mouseup', () => { c.style.width='22px'; c.style.height='22px'; }, true); })()`;

async function clip(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(CURSOR);
  await page.evaluate(() => document.fonts.ready);
  const dir = path.join(OUT, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(dir, String(frames.length).padStart(5, "0") + ".jpg");
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push([file, f.metadata.timestamp]);
    try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1 });
  await page.waitForTimeout(300);
  const t0 = Date.now();
  await fn(page);
  await cdp.send("Page.stopScreencast");
  const end = Date.now() / 1000;
  let list = "";
  frames.forEach(([file, ts], i) => { const next = i + 1 < frames.length ? frames[i + 1][1] : end; list += `file '${file}'\nduration ${Math.max(0.001, next - ts).toFixed(4)}\n`; });
  list += `file '${frames.at(-1)[0]}'\n`;
  fs.writeFileSync(path.join(dir, "list.txt"), list);
  execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${dir}/list.txt -vf "fps=30,scale=1600:900,format=yuv420p" -c:v libx264 -crf 16 ${OUT}/${name}.mp4`);
  await ctx.close();
  console.log(name, frames.length, "frames", ((Date.now() - t0) / 1000).toFixed(1) + "s");
}

const center = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
const glide = async (page, sel, steps = 25) => { const [x, y] = await center(page, sel); await page.mouse.move(x, y, { steps }); return [x, y]; };
const click = async (page, sel) => { await glide(page, sel); await page.waitForTimeout(150); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); };
const smoothScrollTo = (page, sel, offset = 80) => page.evaluate(([s, o]) => {
  const y = document.querySelector(s).getBoundingClientRect().top + scrollY - o; scrollTo({ top: y, behavior: "smooth" }); }, [sel, offset]);

// B: Stage 2 checker
await clip("checker", async (page) => {
  await page.evaluate(() => { const y = document.querySelector("#pick-qaoa").getBoundingClientRect().top + scrollY - 150; scrollTo(0, y); });
  await page.mouse.move(800, 300);
  await page.waitForTimeout(800);
  await click(page, "#pick-clear");
  await page.waitForTimeout(500);
  const ids = await page.$$eval("#outcomes .outcome.is-opt", () => null);
  const sel = JSON.parse(fs.readFileSync(path.resolve("../../stage2_selection.json"), "utf8")).selected_ids;
  for (const id of sel) { await click(page, `#cand button[data-id="${id}"]`); await page.waitForTimeout(450); }
  await glide(page, "#r-status", 30);
  await page.waitForTimeout(1800);
  await click(page, "#outcomes .outcome:nth-child(2)");
  await page.waitForTimeout(1500);
  await click(page, "#outcomes .outcome.is-opt");
  await page.waitForTimeout(2000);
});

await browser.close();
