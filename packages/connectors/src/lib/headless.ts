import { chromium } from "playwright";

// Last resort only: launching a real browser is slow and costly, never the first fetch attempt.
export async function fetchRenderedHtml(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    return await page.content();
  } finally {
    await browser.close();
  }
}
