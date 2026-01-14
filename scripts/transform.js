const { pipeline } = require("stream/promises");
const {
  readSource,
  writeResult,
  readSourceStream,
  writeResultStream,
} = require("./file-system");

const ensureArray = (inputs) => (Array.isArray(inputs) ? inputs : [inputs]);

function normalizeOutput(output) {
  if (Array.isArray(output)) return output;
  if (output?.filename && (output?.content || output?.stream)) return [output];
  return [];
}

async function transformInputToSource(inputFiles, transformFn) {
  const fileList = ensureArray(inputFiles);

  // Lecture en parallèle des fichiers de sources
  const contents = await Promise.all(fileList.map(readSource));

  // Transformation et normalisation des données
  const outputs = normalizeOutput(await transformFn(...contents));

  // Écriture en parallèle des fichiers de résultats
  await Promise.all(
    outputs.map(async ({ filename, content }) => {
      await writeResult(filename, content);
      console.log(
        `Success: ${filename} generated from [${fileList.join(", ")}]`,
      );
    }),
  );
}

async function transformInputToSourceStream(inputFiles, transformFn) {
  const fileList = ensureArray(inputFiles);

  // Création des flux d'entrée
  const inputStreams = await Promise.all(fileList.map(readSourceStream));

  // Transformation en flux
  const outputs = normalizeOutput(await transformFn(...inputStreams));

  // await Promise.all(
  //   outputs.map(async ({ filename, stream }) => {
  //     const destination = await writeResultStream(filename);

  //     // pipeline() gère les erreurs et les fermetures de stream
  //     await pipeline(stream, destination);

  //     console.log(
  //       `Success: ${filename} generated from [${fileList.join(", ")}]`,
  //     );
  //   }),
  // );
}

module.exports = { transformInputToSource, transformInputToSourceStream };
