# Evidence-backed CV generator

This repository generates deterministic, ATS-friendly CVs from reviewed career data. Facts are stored separately from presentation, and every generated bullet maps to an evidence claim.

The project supports two-page general CVs and per-application CVs, in Portuguese and English, with market-specific contact selection for Portugal/international and Brazil. Tailoring selects and reorders curated claims for a specific job posting, so presentation changes per application while every bullet still resolves to a claim ID with a source.

## Safety model

- `source-material/` contains private historical documents and is ignored by Git.
- `data/` contains the curated, versionable career record.
- Only records with `status: usable` may enter a generated CV.
- Conflicting or weak claims remain `needs_confirmation` or `blocked`.
- Legacy-only statements awaiting confirmation live in `data/review-queue.yml` and cannot enter generated CVs.
- Facts confirmed directly by Geilton are registered in `data/sources.yml` with `USR-*` IDs instead of being attributed to historical CVs.
- `SRC-017` belongs to a third-party template and is explicitly forbidden.
- Each generated CV includes an `audit.json` with selected claim and source IDs.

## Structure

```text
config/tracks.yml       CV positioning and deterministic selections
config/jobs/            Per-application configs (gitignored; _template.yml ships)
data/                   Canonical facts, direct sources, open conflicts, and review queue
schemas/                JSON Schema for canonical data
src/                    Validation, composition, rendering, and CLI
templates/              Single semantic HTML template and print CSS
test/                   Data-safety and rendering tests
outputs/                Generated HTML, PDF, and audit files (ignored)
source-material/        Private imported evidence (ignored)
```

## Requirements

- Node.js 18+
- Playwright Chromium for PDF generation

```bash
npm install
npm run pdf:install
```

## Commands

Interactive generation:

```bash
npm run cv
```

Explicit generation:

```bash
npm run cv -- generate --lang en --market pt --track architecture-staff --format all
npm run cv -- generate --lang pt --market br --track backend-dotnet --format html
npm run cv -- generate --job acme-staff-backend --format all
```

Available tracks:

```bash
npm run cv -- list
```

Validate all canonical data and cross-references:

```bash
npm run cv:validate
```

Run the test suite:

```bash
npm test
```

## Tailoring a CV to a job posting

A per-application config lives in `config/jobs/<slug>.yml` and reuses the track shape, plus a `job:` metadata block (`company`, `title`, optional `url`, `captured_at`, `source`, `notes`, and `defaults`). Nothing about the evidence gate changes: the config still selects claim IDs, and only `usable` claims can be selected.

```bash
cp config/jobs/_template.yml config/jobs/acme-staff-backend.yml
# edit job metadata, summary, claim IDs, and skill groups
npm run cv:validate
npm run cv -- generate --job acme-staff-backend --format all
```

Output goes to `outputs/jobs/<slug>/<language>-<market>/`, and the audit records `mode: "job"`, `config_id`, `job_id`, the job metadata, and the base track.

A job can inherit from a track with `based_on`, which keeps the file short and makes the diff against the base track readable:

- Every field the job declares replaces the base value wholesale.
- `experience_claims` merges per experience, and the job's key order becomes the CV order. Use `"inherit"` as the value to keep the base bullets for that role.
- `early_career_claim_ids: inherit` reuses the base early-career selection.
- Without `based_on`, the job must define every field a track defines.
- `based_on: <unknown track>` is a validation error.

`job.defaults.language` and `job.defaults.market` are fallbacks only: an explicit `--lang` or `--market` wins, so the same job can be regenerated for another market.

Job configs are gitignored (`config/jobs/*`; only `_template.yml` is versioned) because a job file names the companies being applied to and this repository is public.

### Evidence-first rule for tailoring

Tailoring may select, reorder, and rewrite presentation (headline, subheadline, summary, skill order). It may not introduce a fact.

1. Map every must-have requirement to a claim in `data/claims.yml`.
2. A requirement covered by a `usable` claim can be used directly.
3. A requirement that only exists as `needs_confirmation`, `blocked`, or in `data/review-queue.yml` must be confirmed before it enters the CV. A confirmed fact gets a new `USR-<YYYYMMDD>-NNN` entry in `data/sources.yml` plus a claim, so the fact base grows and the same question is never asked twice.
4. A requirement with no evidence stays out of the CV and is reported as a gap instead of written.

Metrics follow the same rule: `data/metrics.yml` marks some as `usable` and the rest as `blocked` behind an open conflict, and the audit lists what was excluded from the generation.

## Generated files

Language and market are independent. Use `--market pt` for Portugal/international applications and `--market br` for Brazilian companies. Each market includes only its confirmed WhatsApp phone number.

For example, the Portugal-market architecture/staff English CV is written to:

```text
outputs/general/pt/en/architecture-staff/
  resume.html
  resume.pdf
  audit.json
```

A job CV is written to `outputs/jobs/<slug>/<language>-<market>/` with the same three files.

`audit.json` records the mode, the config id (`track` or `job_id`), the job metadata and base track for a job run, the market, selected contacts, claims and sources used, target page count and page boundary, blocked metrics excluded from generation, open conflicts, and a deterministic data fingerprint.

## Editing career information

Do not edit generated HTML or PDF files. Update the corresponding file in `data/`, preserve its `source_ids`, and choose a review status:

- `usable`: sufficiently supported and allowed in generated output.
- `needs_confirmation`: plausible but awaiting direct confirmation.
- `blocked`: conflicting, sensitive, or too weak to use.

Then run validation and tests before generating a new CV.

Information found only in removed legacy CVs is preserved in `data/review-queue.yml`. Confirm a candidate against real experience before promoting it into the canonical profile, claims, or contacts.

## Current limitations

- The imported historical inventory has not been independently verified inside this repository because the original CV files are not present here.
- Current formal job title, master's status, AZ-204 validity, IEEE membership status, and several strong metrics remain blocked.
- The CLI does not read job postings: turning a posting into `config/jobs/<slug>.yml` is the agent's job. There is no URL ingestion and no text scraping anywhere in `src/`.
