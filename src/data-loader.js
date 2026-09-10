const fs = require("fs/promises");
const path = require("path");
const YAML = require("yaml");
const { DATA_DIR, CONFIG_DIR } = require("./paths");
const { loadJobConfigs } = require("./jobs");

async function readYaml(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  return YAML.parse(source);
}

async function loadCareerData({ jobsDir = path.join(CONFIG_DIR, "jobs") } = {}) {
  const [profile, sources, experiences, claims, metrics, education, conflicts, reviewQueue, tracks] =
    await Promise.all([
      readYaml(path.join(DATA_DIR, "profile.yml")),
      readYaml(path.join(DATA_DIR, "sources.yml")),
      readYaml(path.join(DATA_DIR, "experiences.yml")),
      readYaml(path.join(DATA_DIR, "claims.yml")),
      readYaml(path.join(DATA_DIR, "metrics.yml")),
      readYaml(path.join(DATA_DIR, "education.yml")),
      readYaml(path.join(DATA_DIR, "conflicts.yml")),
      readYaml(path.join(DATA_DIR, "review-queue.yml")),
      readYaml(path.join(CONFIG_DIR, "tracks.yml")),
    ]);

  const jobs = await loadJobConfigs({ jobsDir, readYaml });

  const { schema_version: _profileSchemaVersion, ...profileData } = profile;

  return {
    profile: profileData,
    direct_sources: sources.direct_sources,
    experiences: experiences.experiences,
    claims: claims.claims,
    metrics: metrics.metrics,
    education: education.education,
    credentials: education.credentials,
    conflicts: conflicts.conflicts,
    review_queue: reviewQueue.review_queue,
    tracks: tracks.tracks,
    jobs,
  };
}

module.exports = { loadCareerData, readYaml };
