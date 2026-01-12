const fs = require("node:fs/promises");
const path = require("node:path");

async function transformInputToSource(
  inputFileName, // nom de l'entrée (peut être un tableau)
  outputFileName, // nom de la sortie
  transformFunction, // fonction de traitement
) {
  const inputs = Array.isArray(inputFileName) ? inputFileName : [inputFileName];

  const contents = await Promise.all(
    inputs.map((file) =>
      fs.readFile(path.join(__dirname, "sources", file), "utf8"),
    ),
  );

  const outputPath = path.join(__dirname, "results", outputFileName);

  // On passe le contenu de chaque fichier comme un argument séparé à la fonction de transformation
  const transformedContent = transformFunction(...contents);
  await fs.writeFile(outputPath, transformedContent);
}

module.exports = { transformInputToSource };