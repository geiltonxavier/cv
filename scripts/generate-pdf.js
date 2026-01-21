const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const LANGUAGES = {
  en: { code: "en", dir: "ingles" },
  ingles: { code: "en", dir: "ingles" },
  pt: { code: "pt", dir: "portugues" },
  portugues: { code: "pt", dir: "portugues" },
};

function resolveLanguage(input) {
  if (!input) {
    return null;
  }

  return LANGUAGES[input.toLowerCase()] || null;
}

function normalizeBaseName(value) {
  if (!value) {
    return "geilton-xavier-resume";
  }

  return value.replace(/\.pdf$/i, "");
}

async function generatePdf({ dir, output }) {
  const htmlPath = path.resolve(__dirname, "..", dir, "index.html");
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

async function run() {
  const args = process.argv.slice(2);
  const languageArg = resolveLanguage(args[0]);
  const baseName = normalizeBaseName(
    args.length > 1 ? args[1] : languageArg ? null : args[0]
  );

  if (args[0] && !languageArg && args.length > 1) {
    console.error("Idioma invalido. Use: en, pt, ingles, portugues.");
    process.exit(1);
  }

  if (languageArg) {
    const output = path.resolve(
      __dirname,
      "..",
      `${baseName}-${languageArg.code}.pdf`
    );
    await generatePdf({ dir: languageArg.dir, output });
    return;
  }

  const targets = [LANGUAGES.pt, LANGUAGES.en];
  for (const target of targets) {
    const output = path.resolve(__dirname, "..", `${baseName}-${target.code}.pdf`);
    await generatePdf({ dir: target.dir, output });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
