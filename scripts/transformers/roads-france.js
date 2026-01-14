const readline = require("readline");
const { writeResultStream } = require("../file-system.js");
const {
  getBoundingBox,
  isPointInBox,
  isPointInPolygon,
  streamToString,
} = require("../utils.js");

function processDepartments(geoJsonString) {
  const data = JSON.parse(geoJsonString);

  // pour chaque département
  return data.features.map(({ properties, geometry }) => {
    const { type, coordinates } = geometry;

    // normalisation des coordonnées vers une array de paire de coordonnées
    const polygonList = type === "Polygon" ? [coordinates] : coordinates;

    // la première valeurs correspond au contour du département
    const outerRings = polygonList.map((poly) => poly[0]);

    return {
      code: properties.code,
      bbox: getBoundingBox(coordinates), // utile pour localiser rapidement (si très loin alors on prend pas la peine de faire le précis)
      polygons: outerRings, // permet de savoir précisemment si un point est dans le département
    };
  });
}

async function initializeWriters(departments) {
  // on créer une map pour stocker les streams qui écrivent les données par département
  const streams = new Map();
  let filenames = [];
  for (const dept of departments) {
    const filename = `roads-france-${dept.code}.geojson`;
    filenames.push(filename);
    const stream = await writeResultStream(filename);
    // on écrit le header du fichier geojson
    stream.write('{"type":"FeatureCollection","features":[\n');
    streams.set(dept.code, stream);
  }
  return [streams, filenames];
}

function writeToStream(streams, departmentCode, lineRaw) {
  const stream = streams.get(departmentCode);
  if (stream) {
    stream.write(lineRaw + ",");
  }
}

function closeWriters(streams) {
  for (const stream of streams.values()) {
    // on retire le dernier caractère + on ajoute le footer
    stream.end("null]}");
  }
}

function parseGeoJSONLine(line) {
  // on ignore les headers et footers du fichier lu
  if (line.startsWith("]") || line.startsWith('{"type":"FeatureCollection"')) {
    return null;
  }

  // on retire la virgule pour qu'on puisse ensuite parse en JSON
  const cleanLine = line.endsWith(",") ? line.slice(0, -1) : line;

  try {
    const feature = JSON.parse(cleanLine);
    if (
      !feature.geometry ||
      !feature.geometry.coordinates ||
      feature.geometry.coordinates.length === 0
    ) {
      return null; // on ignore les features mal formées
    }
    return { feature, rawLine: cleanLine };
  } catch (error) {
    return null;
  }
}

function getMatchingDepartments(feature, departments) {
  const coords = feature.geometry.coordinates;
  const pointsToCheck = [coords[0], coords[coords.length - 1]];
  const matchedDepts = new Set();

  for (const pt of pointsToCheck) {
    for (const dept of departments) {
      // si on a déjà trouvé ce département, on passe
      if (matchedDepts.has(dept.code)) continue;
      // on ignore les points hors du département
      if (!isPointInBox(pt, dept.bbox)) continue;

      // on regarde précisément si le point est dans le département
      for (const poly of dept.polygons) {
        if (isPointInPolygon(pt, poly)) {
          matchedDepts.add(dept.code);
          break; // Département valide trouvé
        }
      }
    }
  }

  return matchedDepts;
}

async function roadsFranceTransformer(inputStreamData, inputStreamDepartments) {
  // 1. On traite les données du département
  const departmentsRaw = await streamToString(inputStreamDepartments);
  const processedDepartments = processDepartments(departmentsRaw);

  // 2. On créer les writers à l'avance (cache)
  const [streams, filenames] = await initializeWriters(processedDepartments);

  // 3. On créer un stream du fichier de données (lourd)
  // Pour le lire ligne par ligne et ne pas saturer la mémoire
  const rlData = readline.createInterface({
    input: inputStreamData,
    crlfDelay: Infinity,
  });

  let processedCount = 0;

  for await (const line of rlData) {
    const parsed = parseGeoJSONLine(line);
    if (!parsed) continue;

    const { feature, rawLine } = parsed;
    const matchedDepts = getMatchingDepartments(feature, processedDepartments);

    matchedDepts.forEach((code) => {
      writeToStream(streams, code, rawLine);
    });

    processedCount++;
    if (processedCount % 1000 === 0) {
      console.log(`Processed ${processedCount} features;`);
    }
  }

  closeWriters(streams);

  return filenames;
}

module.exports = roadsFranceTransformer;
