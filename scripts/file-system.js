const fs = require("node:fs");
const path = require("node:path");

async function readSource(filename) {
  const filePath = path.join(__dirname, "sources", filename);
  return fs.promises.readFile(filePath, "utf8");
}

async function writeResult(filename, content) {
  const filePath = path.join(__dirname, "results", filename);
  await fs.promises.writeFile(filePath, content);
}

async function writeResultStream(filename) {
  const filePath = path.join(__dirname, "results", filename);
  const stream = fs.createWriteStream(filePath, {
    encoding: "utf-8",
    highWaterMark: 64 * 1024, // 64KB writing chunk
    flags: "w",
  });
  return stream;
}

async function readSourceStream(filename) {
  const filePath = path.join(__dirname, "sources", filename);
  const stream = fs.createReadStream(filePath, {
    encoding: "utf-8",
    highWaterMark: 64 * 1024, // 64KB reading chunk
  });
  return stream;
}

module.exports = {
  readSource,
  writeResult,
  writeResultStream,
  readSourceStream,
};
