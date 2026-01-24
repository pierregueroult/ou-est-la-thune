const { readSourceStream } = require("./file-system");
const { info, error } = require("./log.js");

const CONTEXT = "transform";

const ensureArray = (inputs) => (Array.isArray(inputs) ? inputs : [inputs]);

async function transform(inputFiles, transformFn) {
	const fileList = ensureArray(inputFiles);

	try {
		info(CONTEXT, `Reading source streams for: ${fileList.join(", ")}`);

		// 1. Création des streams de réponses pour chaque fichiers d'entrée
		const inputStreams = await Promise.all(fileList.map(readSourceStream));

		info(CONTEXT, `Executing transformer function`);

		// 2. Execution du transformer avec les streams
		const generatedFileNames = await transformFn(...inputStreams);

		for (const fileName of generatedFileNames) {
			if (fileName) {
				info(CONTEXT, `File generated: ${fileName}`);
			}
		}
	} catch (err) {
		error(CONTEXT, `Transform failed for inputs: ${fileList.join(", ")}`, {
			message: err.message,
			stack: err.stack,
		});
		throw err;
	}
}

module.exports = { transform };
