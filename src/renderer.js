const fs = require("fs/promises");
const path = require("path");
const nunjucks = require("nunjucks");
const { TEMPLATE_DIR } = require("./paths");

async function renderResume(resume) {
  const css = await fs.readFile(path.join(TEMPLATE_DIR, "resume.css"), "utf8");
  const environment = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(TEMPLATE_DIR, { noCache: true }),
    { autoescape: true, throwOnUndefined: true },
  );

  return environment.render("resume.njk", { resume, css });
}

module.exports = { renderResume };
