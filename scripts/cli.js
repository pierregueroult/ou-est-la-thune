#!/usr/bin/env node
"use strict";

const { transform } = require("./transform.js");
const ipFranceTransformer = require("./transformers/ip-france.js");
const bankFranceTransformer = require("./transformers/bank-france.js");
const roadsFranceTransformer = require("./transformers/roads-france.js");
const departementsFranceTransformer = require("./transformers/departements-france.js");
const { info, error } = require("./log.js");

const CONTEXT = "cli";

async function main() {
	const globalStartTime = Date.now();
	info(CONTEXT, "Starting all transformations");

	try {
		// Transformation 1: Passage de la database des ips de france vers du geojson
		info(CONTEXT, "Running transformation 1/4: IP France database to GeoJSON");
		await transform("database-ip-france.csv", ipFranceTransformer);

		// Transformation 2: Nettoyage du fichier des banks (on retire ce dont à n'a pas besoin)
		info(
			CONTEXT,
			"Running transformation 2/4: Bank data cleaning and enrichment",
		);
		await transform(
			["osm-france-bank.geojson", "osm-bank-enriched-data.json"],
			bankFranceTransformer,
		);

		// Transformation 3: Minification du fichier des départements (pour la localisation)
		info(
			CONTEXT,
			"Running transformation 3/4: Department boundaries minification",
		);
		await transform(
			"departements-france.geojson",
			departementsFranceTransformer,
		);

		// Transformation 4: Extraction des routes département par département
		info(
			CONTEXT,
			"Running transformation 4/4: Road extraction and graph generation",
		);
		await transform(
			["osm-france-roads.geojson", "departements-france.geojson"],
			roadsFranceTransformer,
		);

		const totalDuration = Date.now() - globalStartTime;
		info(
			CONTEXT,
			`All transformations completed successfully (total duration: ${totalDuration}ms)`,
		);
	} catch (err) {
		error(CONTEXT, "Transformation pipeline failed", {
			message: err.message,
			stack: err.stack,
		});
		process.exit(1);
	}
}

main();
