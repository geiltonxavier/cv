const fs = require("fs/promises");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const { SCHEMA_DIR } = require("./paths");
const { resolveJobConfig } = require("./jobs");

const EARLY_CAREER_EXPERIENCE_IDS = new Set([
  "deal-ltm",
  "vizir-first",
  "sofhar-prodesp",
  "confitec",
  "fcamara-first",
  "eris",
  "pkz",
]);

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
  const legacySourceIds = new Set(data.review_queue.sources.map((item) => item.id));
  const directSourceIds = new Set(data.direct_sources.map((item) => item.id));

  assertUnique(data.direct_sources, "direct sources", errors);
  assertUnique(data.experiences, "experiences", errors);
  assertUnique(data.claims, "claims", errors);
  assertUnique(data.metrics, "metrics", errors);
  assertUnique(data.education, "education", errors);
  assertUnique(data.conflicts, "conflicts", errors);
  assertUnique(data.review_queue.sources, "review queue sources", errors);
  assertUnique(data.review_queue.candidates, "review queue candidates", errors);

  for (const candidate of data.review_queue.candidates) {
    if (!legacySourceIds.has(candidate.source_id)) {
      errors.push(`${candidate.id}: unknown legacy source ${candidate.source_id}`);
    }
    for (const experienceId of candidate.related_experience_ids || []) {
      if (!experienceById.has(experienceId)) {
        errors.push(`${candidate.id}: unknown experience ${experienceId}`);
      }
    }
  }

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
  }

  const recordsWithSources = [
    data.profile.person,
    ...data.profile.contacts,
    ...data.experiences,
    ...data.claims,
    ...data.metrics,
    ...data.education,
    ...data.credentials,
  ];
  for (const record of recordsWithSources) {
    if (record.source_ids.includes("SRC-017")) {
      errors.push(`${record.id || "profile.person"}: forbidden third-party source SRC-017`);
    }
    for (const sourceId of record.source_ids.filter((id) => id.startsWith("USR-"))) {
      if (!directSourceIds.has(sourceId)) {
        errors.push(`${record.id || "profile.person"}: unknown direct source ${sourceId}`);
      }
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

  function validateConfig(label, config) {
    const experienceClaims = config.experience_claims || {};
    const earlyCareerClaimIds = Array.isArray(config.early_career_claim_ids)
      ? config.early_career_claim_ids
      : [];
    if (config.early_career_claim_ids === "inherit") {
      errors.push(
        `${label}: early_career_claim_ids must list claim ids (inherit is only valid in a job with based_on)`,
      );
    }
    const selectedClaimIds = [
      ...(config.summary_claim_ids || []),
      ...Object.values(experienceClaims).filter(Array.isArray).flat(),
      ...earlyCareerClaimIds,
      ...(config.skill_groups || []).flatMap((group) => group.evidence_claim_ids),
    ];

    for (const [experienceId, claimIds] of Object.entries(experienceClaims)) {
      if (!experienceById.has(experienceId)) {
        errors.push(`${label}: unknown experience ${experienceId}`);
      }
      if (!Array.isArray(claimIds)) {
        errors.push(
          `${label}: experience ${experienceId} must list claim ids (inherit is only valid in a job with based_on)`,
        );
      }
    }

    if (
      config.page_break_before_experience &&
      !Object.hasOwn(experienceClaims, config.page_break_before_experience)
    ) {
      errors.push(
        `${label}: page break targets unselected experience ${config.page_break_before_experience}`,
      );
    }

    for (const claimId of selectedClaimIds) {
      const claim = claimById.get(claimId);
      if (!claim) {
        errors.push(`${label}: unknown claim ${claimId}`);
      } else if (claim.status !== "usable") {
        errors.push(`${label}: non-usable claim selected ${claimId}`);
      }
    }

    for (const [experienceId, claimIds] of Object.entries(experienceClaims)) {
      for (const claimId of Array.isArray(claimIds) ? claimIds : []) {
        const claim = claimById.get(claimId);
        if (claim && claim.experience_id !== experienceId) {
          errors.push(`${label}: ${claimId} belongs to ${claim.experience_id}, not ${experienceId}`);
        }
      }
    }

    for (const claimId of earlyCareerClaimIds) {
      const claim = claimById.get(claimId);
      if (claim && !EARLY_CAREER_EXPERIENCE_IDS.has(claim.experience_id)) {
        errors.push(`${label}: ${claimId} does not belong to an early-career experience`);
      }
    }
  }

  for (const [trackId, track] of Object.entries(data.tracks)) {
    validateConfig(trackId, track);
  }

  for (const jobId of Object.keys(data.jobs || {})) {
    let resolved;
    try {
      resolved = resolveJobConfig(data.jobs, data.tracks, jobId).config;
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    validateConfig(`job ${jobId}`, resolved);
  }

  return errors;
}

async function validateCareerData(data) {
  const schemaPath = path.join(SCHEMA_DIR, "career.schema.json");
  const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));
  // strictRequired is off because a track/job schema reaches its `properties`
  // through a $ref, so Ajv cannot see the required fields next to them. A test
  // asserts that required fields are still enforced at runtime.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  const validate = ajv.compile(schema);
  const valid = validate(data);
  const errors = [];

  if (!valid) {
    for (const error of validate.errors || []) {
      errors.push(`${error.instancePath || "/"} ${error.message}`);
    }
  }

  // A job file may be partial (based_on inheritance), so schema validation only
  // covers what the job itself declares. Check the resolved config as well,
  // because the resolved config is what actually renders.
  const resolvedTrackValidator = ajv.compile({ $defs: schema.$defs, $ref: "#/$defs/trackConfig" });
  for (const jobId of Object.keys(data.jobs || {})) {
    let resolved;
    try {
      resolved = resolveJobConfig(data.jobs, data.tracks, jobId).config;
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    if (!resolvedTrackValidator(resolved)) {
      for (const error of resolvedTrackValidator.errors || []) {
        errors.push(`job ${jobId}: ${error.instancePath || "/"} ${error.message}`);
      }
    }
  }

  errors.push(...validateReferences(data));

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCareerData, validateReferences };
