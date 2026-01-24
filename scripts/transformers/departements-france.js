const { streamToString, getBoundingBox } = require("../utils.js");
const { writeResult } = require("../file-system.js");

async function departementsFranceTransformer(stream) {
  const content = await streamToString(stream);
  const data = JSON.parse(content);

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

  const outputFilename = "departements-france.geojson";
  await writeResult(outputFilename, JSON.stringify(geojson));

  return [outputFilename];
}

module.exports = departementsFranceTransformer;
