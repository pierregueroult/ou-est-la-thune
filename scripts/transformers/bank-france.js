const { streamToString } = require("../utils.js");
const { writeResult } = require("../file-system.js");
const { startTransform, endTransform, stepInfo, stat } = require("../log.js");

const TRANSFORMER_NAME = "bank-france";

// la fonction est utilisé comme transformer et prends donc autant de streams en entrée que d'inputfiles
// on return les noms de fichiers produits pour log après
async function bankFranceTransformer(stream1, stream2) {
	const startTime = Date.now();
	startTransform(TRANSFORMER_NAME, [
		"osm-france-bank.geojson",
		"osm-bank-enriched-data.json",
	]);

	stepInfo(TRANSFORMER_NAME, 1, "Reading input files");
	const file1 = await streamToString(stream1);
	const file2 = await streamToString(stream2);

	stepInfo(TRANSFORMER_NAME, 2, "Parsing JSON data");

	const geojson = JSON.parse(file1);
	const data = JSON.parse(file2);

	stat(TRANSFORMER_NAME, "Total bank features", geojson.features.length);
	stat(TRANSFORMER_NAME, "Enriched data entries", data.length);

	stepInfo(
		TRANSFORMER_NAME,
		3,
		"Processing features and enriching with images",
	);

	const propertiesToRemove = [
		"bank_id_code",
		"brand_wikidata",
		"meta_code_com",
		"meta_code_dep",
		"meta_code_reg",
		"meta_first_update",
		"meta_last_update",
		"meta_osm_id",
		"meta_users_number",
		"meta_versions_number",
	];

	let enrichedCount = 0;

	geojson.features.forEach((feature) => {
		if (feature.properties) {
			const node = feature.properties.meta_osm_id;

			const enrichedData = data.find((item) => item.id === node);
			if (enrichedData && "panoramax_image" in enrichedData) {
				feature.properties.image = enrichedData.panoramax_image;
				enrichedCount++;
			}

			propertiesToRemove.forEach((prop) => {
				delete feature.properties[prop];
			});
		}
	});

	stat(TRANSFORMER_NAME, "Features enriched with images", enrichedCount);
	stat(
		TRANSFORMER_NAME,
		"Properties removed per feature",
		propertiesToRemove.length,
	);

	stepInfo(TRANSFORMER_NAME, 4, "Writing cleaned GeoJSON output");
	await writeResult("osm-france-bank.geojson", JSON.stringify(geojson));

	const duration = Date.now() - startTime;
	endTransform(TRANSFORMER_NAME, "osm-france-bank.geojson", duration);

	return ["osm-france-bank.geojson"];
}

module.exports = bankFranceTransformer;
