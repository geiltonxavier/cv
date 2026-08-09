const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCareerData } = require("../src/data-loader");
const { validateCareerData, validateReferences } = require("../src/validator");
const { buildResume } = require("../src/resume-builder");
const { renderResume } = require("../src/renderer");

test("canonical career data passes schema and reference validation", async () => {
  const data = await loadCareerData();
  const result = await validateCareerData(data);
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("all configured tracks select only usable claims and metrics", async () => {
  const data = await loadCareerData();
  const claimById = new Map(data.claims.map((claim) => [claim.id, claim]));
  const metricById = new Map(data.metrics.map((metric) => [metric.id, metric]));

  for (const track of Object.values(data.tracks)) {
    const claimIds = [
      ...track.summary_claim_ids,
      ...Object.values(track.experience_claims).flat(),
      ...track.skill_groups.flatMap((group) => group.evidence_claim_ids),
    ];
    for (const claimId of claimIds) {
      const claim = claimById.get(claimId);
      assert.equal(claim.status, "usable", `${claimId} must be usable`);
      for (const metricId of claim.metric_ids || []) {
        assert.equal(metricById.get(metricId).status, "usable", `${metricId} must be usable`);
      }
    }
  }
});

test("legacy-only information stays review-gated and traceable", async () => {
  const data = await loadCareerData();
  const sourceIds = new Set(data.review_queue.sources.map((source) => source.id));

  assert.equal(data.review_queue.candidates.length, 7);
  for (const candidate of data.review_queue.candidates) {
    assert.notEqual(candidate.status, "usable");
    assert.equal(sourceIds.has(candidate.source_id), true);
  }
});

test("generated CV excludes blocked metrics, contacts, credentials, and third-party sources", async () => {
  const data = await loadCareerData();
  const { resume, audit } = buildResume(data, {
    language: "en",
    trackId: "architecture-staff",
  });
  const html = await renderResume(resume);

  for (const blockedText of ["$1M+", "900K", "99.9%", "+351", "+55 11", "AZ-204", "IEEE", "geiltonxavier.dev"]) {
    assert.equal(html.includes(blockedText), false, `must exclude ${blockedText}`);
  }
  assert.equal(audit.selected_source_ids.includes("SRC-017"), false);
  assert.equal(audit.excluded_source_ids.includes("SRC-017"), true);
});

test("reference validation rejects a non-usable claim selected by a track", async () => {
  const data = await loadCareerData();
  const unsafe = structuredClone(data);
  unsafe.tracks["backend-general"].summary_claim_ids.push("CLAIM-0057");
  const errors = validateReferences(unsafe);
  assert.ok(errors.some((error) => error.includes("non-usable claim selected CLAIM-0057")));
});

test("rendered HTML keeps standard ATS sections and source claim markers", async () => {
  const data = await loadCareerData();
  const { resume } = buildResume(data, {
    language: "pt",
    trackId: "backend-dotnet",
  });
  const html = await renderResume(resume);

  assert.match(html, /<h2 id="summary-heading">Resumo profissional<\/h2>/);
  assert.match(html, /<h2 id="experience-heading">Experiência<\/h2>/);
  assert.match(html, /<h2 id="skills-heading">Habilidades técnicas<\/h2>/);
  assert.match(html, /data-claim-id="CLAIM-0003"/);
});
