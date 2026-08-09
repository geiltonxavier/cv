# Evidence-backed CV generator

This repository generates deterministic, ATS-friendly CVs from reviewed career data. Facts are stored separately from presentation, and every generated bullet maps to an evidence claim.

The project currently supports two-page general CVs in Portuguese and English, with market-specific contact selection for Portugal/international and Brazil. Job-description matching and AI-assisted rewriting are planned, but are intentionally not enabled until the canonical fact base is validated.

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

## Generated files

Language and market are independent. Use `--market pt` for Portugal/international applications and `--market br` for Brazilian companies. Each market includes only its confirmed WhatsApp phone number.

For example, the Portugal-market architecture/staff English CV is written to:

```text
outputs/general/pt/en/architecture-staff/
  resume.html
  resume.pdf
  audit.json
```

`audit.json` records the market, selected contacts, claims and sources used, target page count and page boundary, blocked metrics excluded from generation, open conflicts, and a deterministic data fingerprint.

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
- URL/job-description ingestion and AI-assisted tailoring are not implemented yet.
