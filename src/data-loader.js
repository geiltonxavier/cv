const fs = require("fs/promises");
const path = require("path");
const YAML = require("yaml");
const { DATA_DIR, CONFIG_DIR } = require("./paths");

async function readYaml(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  return YAML.parse(source);
}

async function loadCareerData() {
  const [profile, experiences, claims, metrics, education, conflicts, tracks] =
    await Promise.all([
      readYaml(path.join(DATA_DIR, "profile.yml")),
      readYaml(path.join(DATA_DIR, "experiences.yml")),
      readYaml(path.join(DATA_DIR, "claims.yml")),
      readYaml(path.join(DATA_DIR, "metrics.yml")),
      readYaml(path.join(DATA_DIR, "education.yml")),
      readYaml(path.join(DATA_DIR, "conflicts.yml")),
      readYaml(path.join(CONFIG_DIR, "tracks.yml")),
    ]);

  const { schema_version: _profileSchemaVersion, ...profileData } = profile;

  return {
    profile: profileData,
    experiences: experiences.experiences,
    claims: claims.claims,
    metrics: metrics.metrics,
    education: education.education,
    credentials: education.credentials,
    conflicts: conflicts.conflicts,
    tracks: tracks.tracks,
  };
}

module.exports = { loadCareerData, readYaml };
