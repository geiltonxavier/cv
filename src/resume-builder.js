const crypto = require("crypto");

const LABELS = {
  pt: {
    summary: "Resumo profissional",
    experience: "Experiência",
    skills: "Habilidades técnicas",
    education: "Formação",
    present: "Presente",
    earlyCareer: "Início da carreira",
    earlyCareerSummary:
      "Experiência em desenvolvimento de software e TI nos domínios de loyalty, varejo, governo eletrônico, energia, ERP e sistemas enterprise.",
  },
  en: {
    summary: "Professional Summary",
    experience: "Experience",
    skills: "Technical Skills",
    education: "Education",
    present: "Present",
    earlyCareer: "Earlier Career",
    earlyCareerSummary:
      "Software development and IT experience across loyalty, retail, e-government, energy, ERP, and enterprise systems.",
  },
};

const EARLY_CAREER_IDS = [
  "fcamara-via-varejo",
  "deal-ltm",
  "vizir-first",
  "sofhar-prodesp",
  "confitec",
  "fcamara-first",
  "eris",
  "pkz",
];

const MONTHS = {
  pt: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

function localized(value, language) {
  if (!value) return null;
  return typeof value === "string" ? value : value[language];
}

function formatDate(value, language) {
  if (value === "present") return LABELS[language].present;
  const normalized = String(value);
  const match = normalized.match(/^(\d{4})(?:-(\d{2}))?$/);
  if (!match) return normalized;
  if (!match[2]) return match[1];
  return `${MONTHS[language][Number(match[2]) - 1]} ${match[1]}`;
}

function unique(values) {
  return [...new Set(values)];
}

function buildResume(data, { language, trackId }) {
  if (!LABELS[language]) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const track = data.tracks[trackId];
  if (!track) {
    throw new Error(`Unknown track: ${trackId}`);
  }

  const experienceById = new Map(data.experiences.map((item) => [item.id, item]));
  const claimById = new Map(data.claims.map((item) => [item.id, item]));
  const selectedClaimIds = [];

  const experiences = Object.entries(track.experience_claims).map(
    ([experienceId, claimIds]) => {
      const experience = experienceById.get(experienceId);
      const claims = claimIds.map((claimId) => {
        const claim = claimById.get(claimId);
        selectedClaimIds.push(claimId);
        return {
          id: claim.id,
          text: localized(claim.text, language),
        };
      });

      return {
        id: experience.id,
        company: experience.company,
        role: localized(experience.role, language),
        location: localized(experience.location, language),
        date: `${formatDate(experience.start, language)} – ${formatDate(experience.end, language)}`,
        claims,
      };
    },
  );

  selectedClaimIds.push(...track.summary_claim_ids);
  for (const group of track.skill_groups) {
    selectedClaimIds.push(...group.evidence_claim_ids);
  }

  const earlyExperiences = EARLY_CAREER_IDS.map((id) => experienceById.get(id)).filter(Boolean);
  const earlyCompanies = unique(
    earlyExperiences.map((experience) =>
      experience.company
        .replace(" · Via Varejo", "")
        .replace(" · PRODESP", "")
        .replace(" · Grupo LTM", ""),
    ),
  );

  const contacts = data.profile.contacts
    .filter((contact) => contact.status === "usable")
    .map(({ kind, label, href }) => ({ kind, label, href }));

  const education = data.education
    .filter((item) => item.status === "usable")
    .map((item) => ({
      id: item.id,
      institution: item.institution,
      degree: localized(item.degree, language),
      date: `${formatDate(item.start, language)} – ${formatDate(item.end, language)}`,
    }));

  const skillGroups = track.skill_groups.map((group) => ({
    label: localized(group.label, language),
    items: group.items,
  }));

  const uniqueClaimIds = unique(selectedClaimIds);
  const selectedClaims = uniqueClaimIds.map((id) => claimById.get(id));
  const selectedSourceIds = unique(selectedClaims.flatMap((claim) => claim.source_ids)).sort();
  const fingerprintPayload = JSON.stringify({
    language,
    trackId,
    claims: selectedClaims.map(({ id, text, source_ids }) => ({ id, text, source_ids })),
  });

  const resume = {
    language,
    labels: LABELS[language],
    person: {
      name: data.profile.person.professional_name,
      headline: localized(track.headline, language),
      subheadline: localized(track.subheadline, language),
      contacts,
    },
    summary: localized(track.summary, language),
    experiences,
    earlyCareer: {
      title: LABELS[language].earlyCareer,
      date: "2010 – 2017",
      companies: earlyCompanies.join(" · "),
      summary: LABELS[language].earlyCareerSummary,
    },
    skillGroups,
    education,
  };

  const audit = {
    schema_version: 1,
    mode: "general",
    language,
    track: trackId,
    data_fingerprint: crypto.createHash("sha256").update(fingerprintPayload).digest("hex"),
    selected_claim_ids: uniqueClaimIds.sort(),
    selected_source_ids: selectedSourceIds,
    excluded_source_ids: data.profile.evidence.excluded_source_ids,
    blocked_metric_ids: data.metrics
      .filter((metric) => metric.status !== "usable")
      .map((metric) => metric.id)
      .sort(),
    open_conflict_ids: data.conflicts
      .filter((conflict) => conflict.status === "open")
      .map((conflict) => conflict.id)
      .sort(),
    policy: "Only usable claims and metrics may enter generated output.",
  };

  return { resume, audit };
}

module.exports = { buildResume, formatDate, localized, LABELS };
