const readline = require("readline");
const { writeResultStream } = require("../file-system.js");
const {
  getBoundingBox,
  isPointInBox,
  isPointInPolygon,
} = require("../utils.js");

function processDepartments(geoJsonString) {
  const data = JSON.parse(geoJsonString);

  return data.features.map(({ properties, geometry }) => {
    const { type, coordinates } = geometry;

    // On normalise : on veut une liste de polygones (pour gérer les îles/enclaves)
    // Si c'est un Polygon, on le met dans un tableau [poly]
    // Si c'est un MultiPolygon, c'est déjà un tableau de polygones
    const polygonList = type === "Polygon" ? [coordinates] : coordinates;

    // On ne garde que l'anneau extérieur (le premier élément [0] de chaque polygone)
    const outerRings = polygonList.map((poly) => poly[0]);

    return {
      code: properties.code,
      bbox: getBoundingBox(coordinates),
      polygons: outerRings,
    };
  });
}

async function roadsFranceTransformer(inputStreamData, inputStreamDepartments) {
  const rl = readline.createInterface({
    input: inputStreamDepartments,
    crlfDelay: Infinity,
  });

  const departments = await new Promise((resolve) => {
    const data = [];
    rl.on("line", (line) => data.push(line));
    rl.on("close", () => resolve(data));
  });

  const rlData = readline.createInterface({
    input: inputStreamData,
    crlfDelay: Infinity,
  });

  const processedDepartments = await processDepartments(departments.join("\n"));

  const writeStreams = new Map();
  for (const dept of processedDepartments) {
    const stream = await writeResultStream(`roads-france-${dept.code}.geojson`);
    stream.write('{"type":"FeatureCollection","features":[\n');
    writeStreams.set(dept.code, stream);
  }
  let processedCount = 0;

  rlData.on("line", (line) => {
    // on ignore la dernière ligne
    if (line.startsWith("]")) return;
    // on ignore la première ligne
    if (line.startsWith('{"type":"FeatureCollection"')) return;
    // on retire la virgule à la fin de la ligne pour avoir du json valide
    if (line.endsWith(",")) line = line.slice(0, -1);

    try {
      const feature = JSON.parse(line);
      const coords = feature.geometry.coordinates;
      if (!coords || coords.length === 0) return;
      //                 start of road, end of road
      const pointsToCheck = [coords[0], coords[coords.length - 1]];
      const matchedDepts = new Set();

      for (const pt of pointsToCheck) {
        for (const dept of processedDepartments) {
          // si déja dans le département on skip
          if (matchedDepts.has(dept.code)) continue;

          // si on est loin du département on skip
          if (!isPointInBox(pt, dept.bbox)) continue;

          for (const poly of dept.polygons) {
            if (isPointInPolygon(pt, poly)) {
              matchedDepts.add(dept.code);
              break;
              // on a trouver le département on passe au suivant
            }
          }
        }
      }

      matchedDepts.forEach((code) => {
        const stream = writeStreams.get(code);
        stream.write(line + ",");
      });

      processedCount++;
      if (processedCount % 1000 === 0) {
        console.log(`Processed ${processedCount} features;`);
      }
    } catch {}
  });

  rlData.on("close", () => {
    for (const stream of writeStreams.values()) {
      // on enleve la virgule et on ferme le json proprement
      stream.end("null]}");
      console.log(`Finished writing to ${stream.path}`);
    }
    console.log(`Finished processing ${processedCount} features`);
  });

  return {
    filename: "roads-france.geojson",
  };
}

module.exports = roadsFranceTransformer;
