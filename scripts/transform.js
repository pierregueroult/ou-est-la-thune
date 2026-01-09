const fs = require("node:fs/promises");
const path = require("node:path");

async function transformInputToSource(
  inputFileName, // nom de l'entrée
  outputFileName, // nom de la sortie
  transformFunction, // fonction de traitement
) {
  const inputPath = path.join(__dirname, "sources", inputFileName);
  const outputPath = path.join(__dirname, "results", outputFileName);

  const content = await fs.readFile(inputPath, "utf8");
  const transformedContent = transformFunction(content);
  await fs.writeFile(outputPath, transformedContent);
}

module.exports = { transformInputToSource };
