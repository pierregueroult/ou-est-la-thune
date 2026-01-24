const { readSourceStream } = require("./file-system");

const ensureArray = (inputs) => (Array.isArray(inputs) ? inputs : [inputs]);

async function transform(inputFiles, transformFn) {
  const fileList = ensureArray(inputFiles);

  console.log(`Starting transformation for: [${fileList.join(", ")}]`);

  // 1. Création des streams de réponses pour chaque fichiers d'entrée
  const inputStreams = await Promise.all(fileList.map(readSourceStream));

  // 2. Execution du transformer avec les streams
  const generatedFileNames = await transformFn(...inputStreams);

  for (const fileName of generatedFileNames) {
    if (fileName) {
      console.log(`Success: ${fileName} generated from ${fileList.join(", ")}`);
    }
  }
}

module.exports = { transform };
