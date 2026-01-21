const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

async function run() {
  const output = process.argv[2] || "cv.pdf";
  const htmlPath = path.resolve(__dirname, "..", "index.html");
  const htmlUrl = pathToFileURL(htmlPath).toString();

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(htmlUrl, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();
  console.log(`PDF gerado: ${output}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
