const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const { loadCareerData } = require("./data-loader");
const { validateCareerData } = require("./validator");
const { generateResume } = require("./generator");

function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith("--") ? args.shift() : null;
  const options = {};

  while (args.length > 0) {
    const flag = args.shift();
    if (!flag.startsWith("--")) {
      throw new Error(`Unexpected argument: ${flag}`);
    }
    const key = flag.slice(2);
    const value = args.shift();
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
  }

  return { command, options };
}

async function askChoice(rl, question, choices) {
  const lines = choices.map((choice, index) => `${index + 1}) ${choice.label}`);
  while (true) {
    const answer = (await rl.question(`${question}\n${lines.join("\n")}\n> `)).trim();
    const index = Number.parseInt(answer, 10) - 1;
    if (choices[index]) return choices[index].value;
    const byValue = choices.find((choice) => choice.value === answer);
    if (byValue) return byValue.value;
    stdout.write("Opção inválida.\n");
  }
}

async function interactiveOptions(data) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const language = await askChoice(rl, "Idioma do CV:", [
      { label: "Inglês", value: "en" },
      { label: "Português", value: "pt" },
    ]);
    const trackId = await askChoice(
      rl,
      "Direcionamento:",
      Object.entries(data.tracks).map(([id, track]) => ({
        label: track.label[language],
        value: id,
      })),
    );
    const format = await askChoice(rl, "Formato:", [
      { label: "HTML e PDF", value: "all" },
      { label: "Somente HTML", value: "html" },
      { label: "Somente PDF", value: "pdf" },
    ]);
    return { language, trackId, format };
  } finally {
    rl.close();
  }
}

function printHelp() {
  stdout.write(`CV generator\n\n`);
  stdout.write(`  npm run cv\n`);
  stdout.write(`  npm run cv -- generate --lang en --track architecture-staff --format all\n`);
  stdout.write(`  npm run cv -- validate\n`);
  stdout.write(`  npm run cv -- list\n\n`);
  stdout.write(`Formats: html, pdf, all\n`);
}

async function run() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const data = await loadCareerData();

  if (command === "help" || options.help) {
    printHelp();
    return;
  }

  if (command === "validate") {
    const result = await validateCareerData(data);
    if (!result.valid) {
      throw new Error(`Validation failed:\n- ${result.errors.join("\n- ")}`);
    }
    stdout.write(`Career data valid: ${data.experiences.length} experiences, ${data.claims.length} curated claims, ${data.metrics.length} metrics.\n`);
    return;
  }

  if (command === "list") {
    stdout.write("Available tracks:\n");
    for (const [id, track] of Object.entries(data.tracks)) {
      stdout.write(`- ${id}: ${track.label.en} / ${track.label.pt}\n`);
    }
    return;
  }

  let generationOptions;
  if (!command) {
    generationOptions = await interactiveOptions(data);
  } else if (command === "generate") {
    generationOptions = {
      language: options.lang || data.profile.defaults.language,
      trackId: options.track || data.profile.defaults.track,
      format: options.format || data.profile.defaults.format,
    };
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  if (!["pt", "en"].includes(generationOptions.language)) {
    throw new Error("Language must be pt or en.");
  }
  if (!["html", "pdf", "all"].includes(generationOptions.format)) {
    throw new Error("Format must be html, pdf, or all.");
  }

  const result = await generateResume(generationOptions);
  stdout.write(`Generated CV: ${result.outputDir}\n`);
  stdout.write(`Evidence audit: ${result.auditPath}\n`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
