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
      ...track.early_career_claim_ids,
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

test("newly confirmed career facts remain traceable to a direct user source", async () => {
  const data = await loadCareerData();
  const directSource = data.direct_sources.find((source) => source.id === "USR-20260809-001");
  const confirmedClaimIds = [
    "CLAIM-0115",
    "CLAIM-0116",
    "CLAIM-0117",
    "CLAIM-0118",
    "CLAIM-0119",
  ];

  assert.ok(directSource);
  for (const claimId of confirmedClaimIds) {
    const claim = data.claims.find((item) => item.id === claimId);
    assert.equal(claim.status, "usable");
    assert.equal(claim.confidence, "high");
    assert.equal(claim.source_ids.includes(directSource.id), true);
  }

  const phoneSource = data.direct_sources.find((source) => source.id === "USR-20260809-002");
  const phones = data.profile.contacts.filter((contact) => contact.kind === "phone");
  assert.ok(phoneSource);
  assert.equal(phones.length, 2);
  for (const phone of phones) {
    assert.equal(phone.status, "usable");
    assert.equal(phone.whatsapp, true);
    assert.equal(phone.source_ids.includes(phoneSource.id), true);
  }

  const practicesSource = data.direct_sources.find((source) => source.id === "USR-20260810-001");
  const practicesClaim = data.claims.find((claim) => claim.id === "CLAIM-0120");
  assert.ok(practicesSource);
  assert.equal(practicesClaim.status, "usable");
  assert.equal(practicesClaim.confidence, "high");
  assert.equal(practicesClaim.source_ids.includes(practicesSource.id), true);
  assert.equal(data.claims.find((claim) => claim.id === "CLAIM-0005").source_ids.includes(practicesSource.id), true);
  assert.equal(data.claims.find((claim) => claim.id === "CLAIM-0032").source_ids.includes(practicesSource.id), true);
});

test("Portugal-market CV uses only the confirmed Portugal WhatsApp number", async () => {
  const data = await loadCareerData();
  const { resume, audit } = buildResume(data, {
    language: "en",
    market: "pt",
    trackId: "architecture-staff",
  });
  const html = await renderResume(resume);

  // 2026-09-12: the user asked the generic tracks to surface the facts confirmed
  // on 2026-09-10/11 and approved IEEE Senior Member and AZ-204 for the CV, so
  // those no longer belong in the blocked list. What must stay out: blocked
  // metrics, the Brazil phone in a Portugal CV, and review-gated legacy contacts.
  for (const blockedText of ["$1M+", "~60%", "70+", "+55 11", "geiltonxavier.dev"]) {
    assert.equal(html.includes(blockedText), false, `must exclude ${blockedText}`);
  }
  for (const promotedText of ["900K", "99.9%", "IEEE Senior Member", "Azure Service Bus", "RabbitMQ"]) {
    assert.equal(html.includes(promotedText), true, `must include ${promotedText}`);
  }
  assert.equal(html.includes("+351 910 702 889 (WhatsApp)"), true);
  assert.deepEqual(audit.selected_contact_ids.sort(), [
    "contact-email",
    "contact-linkedin",
    "contact-phone-pt",
  ]);
  assert.equal(audit.market, "pt");
  assert.equal(audit.selected_source_ids.includes("USR-20260809-002"), true);
  assert.equal(audit.selected_source_ids.includes("SRC-017"), false);
  assert.equal(audit.excluded_source_ids.includes("SRC-017"), true);
});

test("Brazil-market CV uses only the confirmed Brazil WhatsApp number", async () => {
  const data = await loadCareerData();
  const { resume, audit } = buildResume(data, {
    language: "en",
    market: "br",
    trackId: "architecture-staff",
  });
  const html = await renderResume(resume);

  assert.equal(html.includes("+55 11 92648-6761 (WhatsApp)"), true);
  assert.equal(html.includes("+351 910 702 889"), false);
  assert.deepEqual(audit.selected_contact_ids.sort(), [
    "contact-email",
    "contact-linkedin",
    "contact-phone-br",
  ]);
  assert.equal(audit.market, "br");
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
  assert.match(html, /data-claim-id="CLAIM-0093"/);
});

test("architecture CV includes confirmed ATS terms and an intentional second-page boundary", async () => {
  const data = await loadCareerData();
  const { resume, audit } = buildResume(data, {
    language: "en",
    trackId: "architecture-staff",
  });
  const html = await renderResume(resume);

  for (const expected of [
    "Platform Engineering",
    "Terraform",
    "Specification-Driven Development (SDD)",
    "AI-assisted development",
    "Trained 300+ developers",
    "cross-team",
    "Scrum",
    "Kanban",
    "Docker",
    "TDD",
  ]) {
    assert.equal(html.includes(expected), true, `must include ${expected}`);
  }

  assert.equal(resume.targetPages, 2);
  assert.equal(audit.target_pages, 2);
  assert.equal(audit.page_break_before_experience, "mttechne-ticket");
  assert.equal(audit.selected_source_ids.includes("USR-20260809-001"), true);
  assert.match(
    html,
    /class="job page-break-before"[^>]*>[\s\S]*Experience \(continued\)[\s\S]*Mttechne/,
  );
});

test("reference validation rejects unknown direct evidence", async () => {
  const data = await loadCareerData();
  const unsafe = structuredClone(data);
  unsafe.claims.find((claim) => claim.id === "CLAIM-0115").source_ids = [
    "USR-20260809-999",
  ];

  const errors = validateReferences(unsafe);
  assert.ok(errors.some((error) => error.includes("unknown direct source USR-20260809-999")));
});
