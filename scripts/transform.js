const { readSource, writeResult } = require("./file-system");

async function transformInputToSource(inputFiles, transformFn) {
  // 1. Standardize inputs to an array and read them in parallel
  const fileList = Array.isArray(inputFiles) ? inputFiles : [inputFiles];
  const contents = await Promise.all(fileList.map(readSource));

  // 2. Execute the transformation
  const transformationOutput = transformFn(...contents);

  // 3. Normalize the output into an array of { filename, content } objects
  const outputs = normalizeOutput(transformationOutput);

  // 4. Write all results to the file system
  await Promise.all(
    outputs.map(async ({ filename, content }) => {
      await writeResult(filename, content);
      console.log(
        `Success: ${filename} generated from [${fileList.join(", ")}]`,
      );
    }),
  );
}

function normalizeOutput(output) {
  if (Array.isArray(output)) return output;
  if (output && output.filename && output.content) return [output];
  return [];
}

module.exports = { transformInputToSource };
