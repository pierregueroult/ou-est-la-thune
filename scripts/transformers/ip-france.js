const { streamToString } = require("../utils.js");
const { writeResult } = require("../file-system.js");
const { startTransform, endTransform, stepInfo, stat } = require("../log.js");

const TRANSFORMER_NAME = "ip-france";

// la fonction est utilisé comme transformer et prends donc autant de streams en entrée que d'inputfiles
// on return les noms de fichiers produits pour log après
async function ipFranceTransformer(stream) {
	const startTime = Date.now();
	startTransform(TRANSFORMER_NAME, "database-ip-france.csv");

	stepInfo(TRANSFORMER_NAME, 1, "Reading CSV content");
	const content = await streamToString(stream);

	stepInfo(TRANSFORMER_NAME, 2, "Parsing CSV lines");
	const lines = content.trim().split("\r\n");
	stat(TRANSFORMER_NAME, "Total lines", lines.length);

	stepInfo(
		TRANSFORMER_NAME,
		3,
		"Processing IP ranges and grouping by coordinates",
	);
	const locations = new Map();

	lines.forEach((line) => {
		// on vire les guillemets du csv + on sépare par colonnes
		const parts = line.replaceAll('"', "").split(",");

		const lat = parts[6],
			long = parts[7],
			rangeStart = parts[0],
			rangeStop = parts[1];

		const key = `${lat},${long}`;
		let feature = locations.get(key);

		if (!feature) {
			feature = {
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [parseFloat(long), parseFloat(lat)],
				},
				properties: {
					// On peux ajouter la ville et la région si besoin
					ranges: [],
				},
			};
			locations.set(key, feature);
		}

		feature.properties.ranges.push([parseInt(rangeStart), parseInt(rangeStop)]);
	});

	const geojson = {
		type: "FeatureCollection",
		features: Array.from(locations.values()),
	};

	stat(TRANSFORMER_NAME, "Unique locations", locations.size);
	stat(TRANSFORMER_NAME, "Total features", geojson.features.length);

	stepInfo(TRANSFORMER_NAME, 4, "Writing GeoJSON output");
	await writeResult("database-ip-france.geojson", JSON.stringify(geojson));

	const duration = Date.now() - startTime;
	endTransform(TRANSFORMER_NAME, "database-ip-france.geojson", duration);

	return ["database-ip-france.geojson"];
}

module.exports = ipFranceTransformer;
