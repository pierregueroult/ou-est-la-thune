const { streamToString, getBoundingBox } = require("../utils.js");
const { writeResult } = require("../file-system.js");
const { startTransform, endTransform, stepInfo, stat } = require("../log.js");

const TRANSFORMER_NAME = "departements-france";

async function departementsFranceTransformer(stream) {
	const startTime = Date.now();
	startTransform(TRANSFORMER_NAME, "departements-france.geojson");

	stepInfo(TRANSFORMER_NAME, 1, "Reading GeoJSON content");
	const content = await streamToString(stream);

	stepInfo(TRANSFORMER_NAME, 2, "Parsing GeoJSON data");
	const data = JSON.parse(content);

	stat(TRANSFORMER_NAME, "Total departments", data.features.length);

	stepInfo(TRANSFORMER_NAME, 3, "Processing and minifying department features");

	const features = data.features.map((feature) => {
		const { geometry, properties } = feature;
		const { type, coordinates } = geometry;

		// On ne garde que les contours extérieurs pour minimiser la taille
		// (suppression des trous)
		let newCoordinates;
		if (type === "Polygon") {
			newCoordinates = [coordinates[0]];
		} else if (type === "MultiPolygon") {
			newCoordinates = coordinates.map((poly) => [poly[0]]);
		} else {
			newCoordinates = coordinates;
		}

		const bbox = getBoundingBox(coordinates);

		return {
			type: "Feature",
			bbox: bbox,
			geometry: {
				type: type,
				coordinates: newCoordinates,
			},
			properties: {
				code: properties.code,
				nom: properties.nom,
			},
		};
	});

	const geojson = {
		type: "FeatureCollection",
		features: features,
	};

	stat(TRANSFORMER_NAME, "Processed features", features.length);

	stepInfo(TRANSFORMER_NAME, 4, "Writing minified GeoJSON output");
	const outputFilename = "departements-france.geojson";
	await writeResult(outputFilename, JSON.stringify(geojson));

	const duration = Date.now() - startTime;
	endTransform(TRANSFORMER_NAME, outputFilename, duration);

	return [outputFilename];
}

module.exports = departementsFranceTransformer;
