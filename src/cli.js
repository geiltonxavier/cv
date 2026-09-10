const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const { loadCareerData } = require("./data-loader");
const { validateCareerData } = require("./validator");
const { generateResume } = require("./generator");
const { jobGenerationDefaults } = require("./jobs");

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
    const market = await askChoice(rl, "Mercado da candidatura:", [
      { label: "Portugal / internacional", value: "pt" },
      { label: "Brasil", value: "br" },
    ]);
    const configChoices = [
      ...Object.entries(data.tracks).map(([id, track]) => ({
        label: `perfil · ${track.label[language]}`,
        value: `track:${id}`,
      })),
      ...Object.entries(data.jobs || {}).map(([id, job]) => ({
        label: `vaga · ${job.job?.title || id}${job.job?.company ? ` — ${job.job.company}` : ""}`,
        value: `job:${id}`,
      })),
    ];
    const selection = await askChoice(rl, "Direcionamento:", configChoices);
    const [configKind, configId] = selection.split(":");
    const format = await askChoice(rl, "Formato:", [
      { label: "HTML e PDF", value: "all" },
      { label: "Somente HTML", value: "html" },
      { label: "Somente PDF", value: "pdf" },
    ]);
    return {
      language,
      market,
      trackId: configKind === "track" ? configId : null,
      jobId: configKind === "job" ? configId : null,
      format,
    };
  } finally {
    rl.close();
  }
}

function printHelp() {
  stdout.write(`CV generator\n\n`);
  stdout.write(`  npm run cv\n`);
  stdout.write(`  npm run cv -- generate --lang en --market pt --track architecture-staff --format all\n`);
  stdout.write(`  npm run cv -- generate --lang en --market pt --job acme-staff-backend --format all\n`);
  stdout.write(`  npm run cv -- validate\n`);
  stdout.write(`  npm run cv -- list\n\n`);
  stdout.write(`Markets: pt, br\n`);
  stdout.write(`Formats: html, pdf, all\n`);
  stdout.write(`Job configs live in config/jobs/<name>.yml (see config/jobs/_template.yml).\n`);
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
    stdout.write(`Career data valid: ${data.experiences.length} experiences, ${data.claims.length} curated claims, ${data.metrics.length} metrics, ${data.review_queue.candidates.length} legacy candidates, ${Object.keys(data.jobs).length} job configs.\n`);
    return;
  }

  if (command === "list") {
    stdout.write("Available tracks:\n");
    for (const [id, track] of Object.entries(data.tracks)) {
      stdout.write(`- ${id}: ${track.label.en} / ${track.label.pt}\n`);
    }
    stdout.write("\nAvailable jobs:\n");
    const jobs = Object.entries(data.jobs);
    if (jobs.length === 0) {
      stdout.write("- none configured — copy config/jobs/_template.yml and adjust it\n");
    }
    for (const [id, job] of jobs) {
      const base = job.based_on ? ` (base: ${job.based_on})` : "";
      stdout.write(`- ${id}: ${job.job.title} — ${job.job.company}${base}\n`);
    }
    return;
  }

  let generationOptions;
  if (!command) {
    generationOptions = await interactiveOptions(data);
  } else if (command === "generate") {
    if (options.job && options.track) {
      throw new Error("Use --job or --track, not both.");
    }
    const jobId = options.job || null;
    if (jobId && !data.jobs[jobId]) {
      throw new Error(`Unknown job: ${jobId}. Run "npm run cv -- list" to see configured jobs.`);
    }
    const jobDefaults = jobGenerationDefaults(jobId ? data.jobs[jobId] : null);
    generationOptions = {
      language: options.lang || jobDefaults.language || data.profile.defaults.language,
      market: options.market || jobDefaults.market || data.profile.defaults.market,
      trackId: jobId ? null : options.track || data.profile.defaults.track,
      jobId,
      format: options.format || data.profile.defaults.format,
    };
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  if (!["pt", "en"].includes(generationOptions.language)) {
    throw new Error("Language must be pt or en.");
  }
  if (!["pt", "br"].includes(generationOptions.market)) {
    throw new Error("Market must be pt or br.");
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
