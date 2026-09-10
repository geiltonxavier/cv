const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { loadCareerData, readYaml } = require("../src/data-loader");
const { validateCareerData, validateReferences } = require("../src/validator");
const { buildResume } = require("../src/resume-builder");
const { generateResume } = require("../src/generator");
const { jobGenerationDefaults, isLoadableJobFile, resolveJobConfig } = require("../src/jobs");
const { ROOT_DIR } = require("../src/paths");

const FIXTURE_JOBS_DIR = path.join(__dirname, "fixtures", "jobs");
const TEMPLATE_PATH = path.join(ROOT_DIR, "config", "jobs", "_template.yml");
const JOB_ID = "acme-staff-backend";

function loadFixtureData() {
  return loadCareerData({ jobsDir: FIXTURE_JOBS_DIR });
}

test("only files that can carry an application are loaded as job configs", () => {
  assert.equal(isLoadableJobFile("acme-2026.yml"), true);
  assert.equal(isLoadableJobFile("acme-2026.yaml"), true);
  assert.equal(isLoadableJobFile("_template.yml"), false);
  assert.equal(isLoadableJobFile(".hidden.yml"), false);
  assert.equal(isLoadableJobFile("notes.md"), false);
});

test("the shipped template is never treated as a real application", async () => {
  const data = await loadCareerData();
  assert.equal(Object.hasOwn(data.jobs, "empresa-exemplo-staff-backend"), false);
});

test("a job config inherits its base track and applies only its overrides", async () => {
  const data = await loadFixtureData();
  const base = data.tracks["backend-dotnet"];
  const { config, job, based_on: basedOn } = resolveJobConfig(data.jobs, data.tracks, JOB_ID);

  assert.equal(basedOn, "backend-dotnet");
  assert.equal(job.company, "Acme Payments");
  assert.equal(job.title, "Staff Backend Engineer");

  // Overridden values win.
  assert.deepEqual(config.experience_claims.siemens, ["CLAIM-0115", "CLAIM-0003", "CLAIM-0116"]);
  assert.equal(config.summary.en, "Test summary in English, tailored to the Acme role.");

  // "inherit" reuses the base selection.
  assert.deepEqual(config.experience_claims["novabase-fidelidade"], base.experience_claims["novabase-fidelidade"]);
  assert.deepEqual(config.early_career_claim_ids, base.early_career_claim_ids);

  // Untouched fields fall back to the base track.
  assert.equal(config.target_pages, base.target_pages);

  // The job's own key order decides the CV order.
  assert.deepEqual(Object.keys(config.experience_claims), [
    "siemens",
    "novabase-fidelidade",
    "mttechne-ticket",
    "agap2-softfinanca",
    "vizir-second",
  ]);
});

test("job configs pass full schema and reference validation", async () => {
  const data = await loadFixtureData();
  const result = await validateCareerData(data);
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("the shipped job template validates and resolves", async () => {
  const data = await loadCareerData();
  const parsed = await readYaml(TEMPLATE_PATH);
  const [jobId] = Object.keys(parsed.jobs);
  data.jobs[jobId] = parsed.jobs[jobId];

  const result = await validateCareerData(data);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);

  const { config } = resolveJobConfig(data.jobs, data.tracks, jobId);
  assert.equal(config.experience_claims["vizir-second"].length > 0, true);
});

test("a standalone job must define the whole CV", async () => {
  const data = await loadFixtureData();
  data.jobs["incomplete-job"] = {
    job: { company: "Acme", title: "Backend Engineer" },
    summary: { pt: "Resumo.", en: "Summary." },
  };

  const result = await validateCareerData(data);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) => error.includes("unknown job id") === false &&
      error.includes("without based_on the job must define")),
  );
  assert.ok(result.errors.some((error) => error.includes("early_career_claim_ids")));
});

test("a standalone job that defines everything resolves without a base track", async () => {
  const data = await loadFixtureData();
  data.jobs["standalone-job"] = {
    job: { company: "Acme", title: "Backend Engineer" },
    ...structuredClone(data.tracks["backend-dotnet"]),
  };

  const result = await validateCareerData(data);
  assert.deepEqual(result, { valid: true, errors: [] });

  const { config, based_on: basedOn } = resolveJobConfig(data.jobs, data.tracks, "standalone-job");
  assert.equal(basedOn, null);
  assert.equal(config.target_pages, 2);
});

test("inheriting from an unknown base track is rejected", async () => {
  const data = await loadFixtureData();
  data.jobs["broken-base"] = {
    job: { company: "Acme", title: "Backend Engineer" },
    based_on: "no-such-track",
  };

  assert.throws(
    () => resolveJobConfig(data.jobs, data.tracks, "broken-base"),
    /unknown base track/,
  );
  const result = await validateCareerData(data);
  assert.equal(result.valid, false);
});

test("reference validation rejects a job that selects a non-usable claim", async () => {
  const data = await loadFixtureData();
  const unsafe = structuredClone(data);
  unsafe.jobs[JOB_ID].summary_claim_ids.push("CLAIM-0057");

  const errors = validateReferences(unsafe);
  assert.ok(
    errors.some((error) => error.includes(`job ${JOB_ID}: non-usable claim selected CLAIM-0057`)),
    errors.join("\n"),
  );
});

test("required fields are still enforced even though strictRequired is off", async () => {
  const data = await loadFixtureData();
  const unsafe = structuredClone(data);
  delete unsafe.tracks["backend-general"].skill_groups;

  const result = await validateCareerData(unsafe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("required property 'skill_groups'")));
});

test("job generation writes under outputs/jobs/<slug>/<lang>-<market>", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cv-jobs-"));
  try {
    const result = await generateResume({
      language: "en",
      market: "br",
      jobId: JOB_ID,
      format: "html",
      outputRoot,
      jobsDir: FIXTURE_JOBS_DIR,
    });

    assert.equal(
      result.outputDir,
      path.resolve(outputRoot, "jobs", JOB_ID, "en-br"),
    );

    const audit = JSON.parse(await fs.readFile(result.auditPath, "utf8"));
    assert.equal(audit.mode, "job");
    assert.equal(audit.config_id, JOB_ID);
    assert.equal(audit.job_id, JOB_ID);
    assert.equal(audit.job.company, "Acme Payments");
    assert.equal(audit.track, "backend-dotnet");
    assert.equal(audit.market, "br");
    assert.deepEqual(audit.selected_contact_ids.sort(), [
      "contact-email",
      "contact-linkedin",
      "contact-phone-br",
    ]);

    const html = await fs.readFile(result.htmlPath, "utf8");
    assert.equal(html.includes("Test summary in English, tailored to the Acme role."), true);
    assert.equal(html.includes("+55 11 92648-6761 (WhatsApp)"), true);
    assert.equal(html.includes("+351 910 702 889"), false);
    assert.match(html, /data-claim-id="CLAIM-0115"/);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test("job metadata supplies language and market defaults when flags are absent", async () => {
  const data = await loadFixtureData();
  assert.deepEqual(jobGenerationDefaults(data.jobs[JOB_ID]), { language: "en", market: "br" });
  assert.deepEqual(jobGenerationDefaults({ job: { company: "A", title: "B" } }), {
    language: null,
    market: null,
  });
  assert.deepEqual(jobGenerationDefaults(null), { language: null, market: null });
});

test("a job cannot be combined with a track", async () => {
  const data = await loadFixtureData();
  assert.throws(
    () => buildResume(data, { language: "en", trackId: "backend-dotnet", jobId: JOB_ID }),
    /either a track or a job/,
  );
});
