const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

module.exports = {
  ROOT_DIR,
  DATA_DIR: path.join(ROOT_DIR, "data"),
  CONFIG_DIR: path.join(ROOT_DIR, "config"),
  SCHEMA_DIR: path.join(ROOT_DIR, "schemas"),
  TEMPLATE_DIR: path.join(ROOT_DIR, "templates"),
  OUTPUT_DIR: path.join(ROOT_DIR, "outputs"),
};
