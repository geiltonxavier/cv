const path = require("path");
const fs = require("fs/promises");
const readline = require("readline/promises");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const LANGUAGES = {
  en: { code: "en", dir: "ingles", label: "Ingles" },
  english: { code: "en", dir: "ingles", label: "Ingles" },
  ingles: { code: "en", dir: "ingles", label: "Ingles" },
  pt: { code: "pt", dir: "portugues", label: "Portugues" },
  portuguese: { code: "pt", dir: "portugues", label: "Portugues" },
  portugues: { code: "pt", dir: "portugues", label: "Portugues" },
};

const ROOT_DIR = path.resolve(__dirname, "..");

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getLanguageOptions() {
  const entries = await fs.readdir(ROOT_DIR, { withFileTypes: true });
  const reservedDirs = new Set([".git", "node_modules", "scripts"]);

  return entries
    .filter((entry) => entry.isDirectory() && !reservedDirs.has(entry.name))
    .map((entry) => {
      const knownLanguage = resolveLanguage(entry.name);
      return knownLanguage || {
        code: entry.name,
        dir: entry.name,
        label: entry.name,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function resolveLanguage(input, options = Object.values(LANGUAGES)) {
  if (!input) {
    return null;
  }

  const normalizedInput = normalizeChoice(input);
  const knownLanguage = LANGUAGES[normalizedInput];
  if (knownLanguage) {
    return options.find((option) => option.dir === knownLanguage.dir) || knownLanguage;
  }

  return (
    options.find((option) => {
      return [option.code, option.dir, option.label]
        .filter(Boolean)
        .some((value) => normalizeChoice(value) === normalizedInput);
    }) || null
  );
}

function normalizeChoice(value) {
  return value.trim().toLowerCase();
}

function normalizeBaseName(value) {
  if (!value) {
    return "geilton-xavier-resume";
  }

  return value.replace(/\.pdf$/i, "");
}

async function getVariantOptions(languageDir) {
  const languagePath = path.join(ROOT_DIR, languageDir);
  const entries = await fs.readdir(languagePath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function resolveHtmlDir({ language, variant }) {
  const languagePath = path.join(ROOT_DIR, language.dir);
  const rootIndexPath = path.join(languagePath, "index.html");

  if (variant) {
    const variantDir = path.join(language.dir, variant);
    const variantIndexPath = path.join(ROOT_DIR, variantDir, "index.html");
    if (!(await pathExists(variantIndexPath))) {
      throw new Error(`Nao encontrei index.html em ${variantDir}.`);
    }

    return variantDir;
  }

  if (await pathExists(rootIndexPath)) {
    return language.dir;
  }

  const variants = await getVariantOptions(language.dir);
  if (variants.length === 0) {
    throw new Error(`Nao encontrei index.html nem subpastas em ${language.dir}.`);
  }

  return null;
}

async function askOption({ rl, question, options }) {
  const formattedOptions = options
    .map((option, index) => `${index + 1}) ${option.label || option}`)
    .join("\n");

  while (true) {
    const answer = await rl.question(`${question}\n${formattedOptions}\n> `);
    const normalizedAnswer = normalizeChoice(answer);
    const selectedByNumber = Number.parseInt(normalizedAnswer, 10);

    if (
      Number.isInteger(selectedByNumber) &&
      selectedByNumber >= 1 &&
      selectedByNumber <= options.length
    ) {
      return options[selectedByNumber - 1];
    }

    const selectedByName = options.find((option) => {
      const values =
        typeof option === "string"
          ? [option]
          : [option.code, option.dir, option.label].filter(Boolean);

      return values.some((value) => normalizeChoice(value) === normalizedAnswer);
    });

    if (selectedByName) {
      return selectedByName;
    }

    console.log("Opcao invalida. Escolha pelo numero ou pelo nome.");
  }
}

async function chooseLanguage(rl) {
  const languages = await getLanguageOptions();
  if (languages.length === 0) {
    throw new Error("Nao encontrei pastas de idioma para gerar o CV.");
  }

  return askOption({
    rl,
    question: "Qual idioma voce quer gerar?",
    options: languages,
  });
}

async function chooseVariant({ rl, language }) {
  const variants = await getVariantOptions(language.dir);
  if (variants.length === 0) {
    throw new Error(`Nao encontrei variacoes dentro de ${language.dir}.`);
  }

  return askOption({
    rl,
    question: `Qual CV de ${language.label} voce quer gerar?`,
    options: variants,
  });
}

async function generatePdf({ dir, output }) {
  const htmlPath = path.resolve(ROOT_DIR, dir, "index.html");
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

function buildOutputName({ baseName, language, variant }) {
  const suffix = variant ? `${language.code}-${variant}` : language.code;
  return path.resolve(ROOT_DIR, `${baseName}-${suffix}.pdf`);
}

async function run() {
  const args = process.argv.slice(2);
  const languageOptions = await getLanguageOptions();
  const languageArg = resolveLanguage(args[0], languageOptions);
  const variantArg = args[1];
  const baseNameArg = args[2];

  if (args[0] && !languageArg) {
    console.error("Idioma invalido. Use: en, pt, ingles, portugues.");
    process.exit(1);
  }

  if (languageArg) {
    const htmlDir = await resolveHtmlDir({
      language: languageArg,
      variant: variantArg,
    });

    if (!htmlDir) {
      console.error(
        `A pasta ${languageArg.dir} tem subpastas. Informe uma delas: ${(
          await getVariantOptions(languageArg.dir)
        ).join(", ")}.`
      );
      process.exit(1);
    }

    const output = buildOutputName({
      baseName: normalizeBaseName(baseNameArg),
      language: languageArg,
      variant: variantArg || null,
    });

    await generatePdf({ dir: htmlDir, output });
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const language = await chooseLanguage(rl);
    let htmlDir = await resolveHtmlDir({ language });
    let variant = null;

    if (!htmlDir) {
      variant = await chooseVariant({ rl, language });
      htmlDir = await resolveHtmlDir({ language, variant });
    }

    const output = buildOutputName({
      baseName: normalizeBaseName(),
      language,
      variant,
    });

    await generatePdf({ dir: htmlDir, output });
  } finally {
    rl.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
