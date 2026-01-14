#!/usr/bin/env node
"use strict";

const { transform } = require("./transform.js");
const ipFranceTransformer = require("./transformers/ip-france.js");
const bankFranceTransformer = require("./transformers/bank-france.js");
const roadsFranceTransformer = require("./transformers/roads-france.js");

async function main() {
  console.log("Starting transformations...");

  try {
    // Transformation 1: Passage de la database des ips de france vers du geojson
    await transform("database-ip-france.csv", ipFranceTransformer);

    // Transformation 2: Nettoyage du fichier des banks (on retire ce dont à n'a pas besoin)
    await transform(
      ["osm-france-bank.geojson", "osm-bank-enriched-data.json"],
      bankFranceTransformer,
    );

    // Transformation 3: Extraction des routes département par département
    await transform(
      ["osm-france-roads.geojson", "departements-france.geojson"],
      roadsFranceTransformer,
    );

    console.log("Transformations completed successfully.");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
