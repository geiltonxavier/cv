const fs = require("fs/promises");
const path = require("path");

const JOB_FILE_EXTENSIONS = [".yml", ".yaml"];

// Files starting with "_" or "." are never loaded, so config/jobs/_template.yml
// can document the format without being treated as a real application.
function isLoadableJobFile(fileName) {
  if (fileName.startsWith("_") || fileName.startsWith(".")) return false;
  return JOB_FILE_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

async function loadJobConfigs({ jobsDir, readYaml }) {
  if (!jobsDir) return {};

  let entries;
  try {
    entries = await fs.readdir(jobsDir);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }

  const jobs = {};
  for (const fileName of entries.filter(isLoadableJobFile).sort()) {
    const parsed = await readYaml(path.join(jobsDir, fileName));
    const fileJobs = (parsed && parsed.jobs) || {};

    for (const [jobId, config] of Object.entries(fileJobs)) {
      if (!/^[a-z0-9-]+$/.test(jobId)) {
        throw new Error(`${fileName}: invalid job id "${jobId}" (use lowercase letters, digits, and hyphens)`);
      }
      if (jobs[jobId]) {
        throw new Error(`${fileName}: duplicate job id "${jobId}"`);
      }
      jobs[jobId] = config;
    }
  }

  return jobs;
}

// A job config may inherit from a base track. Every field it declares replaces
// the base value wholesale; experience_claims merges per experience so a job can
// keep the base bullets for older roles by writing "inherit".
function mergeExperienceClaims(jobId, baseClaims, overrideClaims) {
  const merged = {};

  for (const [experienceId, claimIds] of Object.entries(overrideClaims)) {
    if (claimIds === "inherit") {
      if (!baseClaims || !baseClaims[experienceId]) {
        throw new Error(
          `job ${jobId}: cannot inherit claims for ${experienceId} — the base track does not select it`,
        );
      }
      merged[experienceId] = baseClaims[experienceId];
      continue;
    }
    merged[experienceId] = claimIds;
  }

  return merged;
}

function assertNoInheritWithoutBase(jobId, experienceClaims) {
  for (const [experienceId, claimIds] of Object.entries(experienceClaims || {})) {
    if (claimIds === "inherit") {
      throw new Error(`job ${jobId}: cannot inherit claims for ${experienceId} without based_on`);
    }
  }
}

// A job that does not inherit from a track has to describe the whole CV, so a
// missing field is a configuration error instead of a silently empty section.
const REQUIRED_TRACK_FIELDS = [
  "label",
  "headline",
  "subheadline",
  "summary",
  "summary_claim_ids",
  "experience_claims",
  "early_career_claim_ids",
  "target_pages",
  "skill_groups",
];

function assertCompleteJob(jobId, config) {
  const missing = REQUIRED_TRACK_FIELDS.filter((field) => config[field] === undefined);
  if (missing.length > 0) {
    throw new Error(`job ${jobId}: without based_on the job must define ${missing.join(", ")}`);
  }
}

function resolveJobConfig(jobs, tracks, jobId) {
  const job = jobs && jobs[jobId];
  if (!job) {
    throw new Error(`Unknown job: ${jobId}`);
  }

  const { job: metadata = {}, based_on: baseTrackId = null, ...overrides } = job;
  const base = baseTrackId ? (tracks || {})[baseTrackId] : null;

  if (baseTrackId && !base) {
    throw new Error(`job ${jobId}: unknown base track ${baseTrackId}`);
  }

  if (!base) {
    if (overrides.early_career_claim_ids === "inherit") {
      throw new Error(`job ${jobId}: cannot inherit early_career_claim_ids without based_on`);
    }
    assertNoInheritWithoutBase(jobId, overrides.experience_claims);
    assertCompleteJob(jobId, overrides);
    return { config: { ...overrides }, job: metadata, based_on: null };
  }

  const { experience_claims: baseExperienceClaims = {}, ...baseRest } = base;
  const { experience_claims: jobExperienceClaims, ...jobRest } = overrides;
  const config = { ...baseRest, ...jobRest };
  config.experience_claims = jobExperienceClaims
    ? mergeExperienceClaims(jobId, baseExperienceClaims, jobExperienceClaims)
    : baseExperienceClaims;
  if (config.early_career_claim_ids === "inherit") {
    config.early_career_claim_ids = base.early_career_claim_ids;
  }

  return { config, job: metadata, based_on: baseTrackId };
}

// Generated CV language and market are independent of the job metadata, but a
// job file can carry the right defaults for its own application.
function jobGenerationDefaults(job) {
  const defaults = (job && job.job && job.job.defaults) || {};
  return {
    language: defaults.language || null,
    market: defaults.market || null,
  };
}

module.exports = {
  isLoadableJobFile,
  jobGenerationDefaults,
  loadJobConfigs,
  mergeExperienceClaims,
  resolveJobConfig,
};
