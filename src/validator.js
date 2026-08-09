const fs = require("fs/promises");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const { SCHEMA_DIR } = require("./paths");

function assertUnique(items, label, errors) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) {
      errors.push(`${label}: duplicate id ${item.id}`);
    }
    seen.add(item.id);
  }
}

function validateReferences(data) {
  const errors = [];
  const experienceById = new Map(data.experiences.map((item) => [item.id, item]));
  const claimById = new Map(data.claims.map((item) => [item.id, item]));
  const metricById = new Map(data.metrics.map((item) => [item.id, item]));
  const conflictById = new Map(data.conflicts.map((item) => [item.id, item]));

  assertUnique(data.experiences, "experiences", errors);
  assertUnique(data.claims, "claims", errors);
  assertUnique(data.metrics, "metrics", errors);
  assertUnique(data.education, "education", errors);
  assertUnique(data.conflicts, "conflicts", errors);

  for (const claim of data.claims) {
    if (!experienceById.has(claim.experience_id)) {
      errors.push(`${claim.id}: unknown experience ${claim.experience_id}`);
    }
    for (const metricId of claim.metric_ids || []) {
      const metric = metricById.get(metricId);
      if (!metric) {
        errors.push(`${claim.id}: unknown metric ${metricId}`);
      } else if (claim.status === "usable" && metric.status !== "usable") {
        errors.push(`${claim.id}: usable claim references non-usable metric ${metricId}`);
      }
    }
    if (claim.source_ids.includes("SRC-017")) {
      errors.push(`${claim.id}: forbidden third-party source SRC-017`);
    }
  }

  const recordsWithConflicts = [
    ...data.experiences,
    ...data.metrics,
    ...data.education,
    ...data.credentials,
    ...data.profile.contacts,
  ];
  for (const record of recordsWithConflicts) {
    for (const conflictId of record.conflict_ids || []) {
      if (!conflictById.has(conflictId)) {
        errors.push(`${record.id}: unknown conflict ${conflictId}`);
      }
    }
  }

  for (const [trackId, track] of Object.entries(data.tracks)) {
    const selectedClaimIds = [
      ...track.summary_claim_ids,
      ...Object.values(track.experience_claims).flat(),
      ...track.skill_groups.flatMap((group) => group.evidence_claim_ids),
    ];

    for (const experienceId of Object.keys(track.experience_claims)) {
      if (!experienceById.has(experienceId)) {
        errors.push(`${trackId}: unknown experience ${experienceId}`);
      }
    }

    for (const claimId of selectedClaimIds) {
      const claim = claimById.get(claimId);
      if (!claim) {
        errors.push(`${trackId}: unknown claim ${claimId}`);
      } else if (claim.status !== "usable") {
        errors.push(`${trackId}: non-usable claim selected ${claimId}`);
      }
    }

    for (const [experienceId, claimIds] of Object.entries(track.experience_claims)) {
      for (const claimId of claimIds) {
        const claim = claimById.get(claimId);
        if (claim && claim.experience_id !== experienceId) {
          errors.push(`${trackId}: ${claimId} belongs to ${claim.experience_id}, not ${experienceId}`);
        }
      }
    }
  }

  return errors;
}

async function validateCareerData(data) {
  const schemaPath = path.join(SCHEMA_DIR, "career.schema.json");
  const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(data);
  const errors = [];

  if (!valid) {
    for (const error of validate.errors || []) {
      errors.push(`${error.instancePath || "/"} ${error.message}`);
    }
  }

  errors.push(...validateReferences(data));

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCareerData, validateReferences };
