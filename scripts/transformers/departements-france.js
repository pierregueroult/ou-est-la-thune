const { streamToString, getBoundingBox } = require("../utils.js");
const { writeResult } = require("../file-system.js");
const { startTransform, endTransform, stepInfo, stat } = require("../log.js");

const TRANSFORMER_NAME = "departements-france";

// Inverse les coordonnées de [long, lat] vers [lat, long]
function swapCoordinates(coords) {
	if (typeof coords[0] === "number") {
		// Point simple: [long, lat] -> [lat, long]
		return [coords[1], coords[0]];
	}
	// Récursif pour les tableaux imbriqués (Polygon, MultiPolygon)
	return coords.map(swapCoordinates);
}

// Inverse une bbox de [minLong, minLat, maxLong, maxLat] vers [minLat, minLong, maxLat, maxLong]
function swapBbox(bbox) {
	return [bbox[1], bbox[0], bbox[3], bbox[2]];
}

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

		// Calculer bbox avec les coordonnées originales [long, lat]
		const bboxLongLat = getBoundingBox(coordinates);

		// Inverser les coordonnées de [long, lat] vers [lat, long]
		const swappedCoordinates = swapCoordinates(newCoordinates);
		const swappedBbox = swapBbox(bboxLongLat);

		return {
			type: "Feature",
			bbox: swappedBbox,
			geometry: {
				type: type,
				coordinates: swappedCoordinates,
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
