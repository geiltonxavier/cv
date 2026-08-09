const fs = require("fs/promises");
const path = require("path");
const { loadCareerData } = require("./data-loader");
const { validateCareerData } = require("./validator");
const { buildResume } = require("./resume-builder");
const { renderResume } = require("./renderer");
const { generatePdf } = require("./pdf-generator");
const { OUTPUT_DIR } = require("./paths");

async function assertValidData(data) {
  const result = await validateCareerData(data);
  if (!result.valid) {
    throw new Error(`Career data is invalid:\n- ${result.errors.join("\n- ")}`);
  }
}

async function generateResume({ language, trackId, format = "all", outputRoot = OUTPUT_DIR }) {
  const data = await loadCareerData();
  await assertValidData(data);
  const { resume, audit } = buildResume(data, { language, trackId });
  const html = await renderResume(resume);
  const outputDir = path.resolve(outputRoot, "general", language, trackId);
  const htmlPath = path.join(outputDir, "resume.html");
  const pdfPath = path.join(outputDir, "resume.pdf");
  const auditPath = path.join(outputDir, "audit.json");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(htmlPath, html, "utf8");
  await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

  if (format === "pdf" || format === "all") {
    await generatePdf({ htmlPath, pdfPath });
  }

  return {
    outputDir,
    htmlPath,
    pdfPath: format === "html" ? null : pdfPath,
    auditPath,
  };
}

module.exports = { assertValidData, generateResume };
