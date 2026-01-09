#!/usr/bin/env node

const { transformInputToSource } = require("./transform.js");
const ipFranceTransformer = require("./transformers/ip-france.js");

async function main() {
  console.log("Starting transformations...");

  try {
    // Transformation 1: Passage de la database des ips de france vers du geojson
    await transformInputToSource(
      "database-ip-france.csv",
      "database-ip-france.geojson",
      ipFranceTransformer,
    );

    // TODO: les autres transformations genre prendre que les data nécessaire dans le truc de la banque

    console.log("All transformations completed!");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
