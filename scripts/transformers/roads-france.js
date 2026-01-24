const readline = require("readline");
const fs = require("node:fs");
const path = require("node:path");
const { writeResultStream } = require("../file-system.js");
const {
	getBoundingBox,
	isPointInBox,
	isPointInPolygon,
	streamToString,
	distanceMeters,
} = require("../utils.js");

/**
 * Format du graphe généré :
 * {
 *   roadNames: [                      // Dictionnaire des noms de routes (déduplication)
 *     "Rue de la République",
 *     "Avenue des Champs",
 *     ...
 *   ],
 *   nodes: [                          // Liste des nœuds du graphe
 *     [
 *       [longitude, latitude],        // Index 0: Coordonnées arrondies à 5 décimales (~1m)
 *       [                             // Index 1: Liste des neighbors (connexions)
 *         [toPoint, cost, nameIdx],   // toPoint: index du nœud de destination
 *                                     // cost: distance en mètres (arrondie)
 *                                     // nameIdx: index dans roadNames
 *         ...
 *       ]
 *     ],
 *     ...
 *   ]
 * }
 *
 * Note: Format compact sans clés JSON pour réduire la taille.
 * Chaque nœud = [coord, neighbors] au lieu de {coord: ..., neighbors: ...}
 * Les connexions sont bidirectionnelles (A↔B stocké dans les deux sens).
 */

// Arrondir les coordonnées à 5 décimales (~1m de précision)
function roundCoord(coord) {
	return [
		Math.round(coord[0] * 100000) / 100000,
		Math.round(coord[1] * 100000) / 100000,
	];
}

// Arrondir le coût au mètre près
function roundCost(cost) {
	return Math.round(cost);
}

function processDepartments(geoJsonString) {
	const data = JSON.parse(geoJsonString);

	// pour chaque département
	return data.features.map(({ properties, geometry }) => {
		// normalisation des coordonnées vers une array de paire de coordonnées
		const polygonList =
			geometry.type === "Polygon"
				? [geometry.coordinates]
				: geometry.coordinates;

		return {
			code: properties.code,
			bbox: getBoundingBox(geometry.coordinates),
			// la première valeur correspond au contour du département
			polygons: polygonList.map((poly) => poly[0]),
		};
	});
}

async function initializeWriters(departments) {
	const streams = new Map();
	let filenames = [];

	const roadsDirPath = path.join(__dirname, "..", "results", "roads");
	await fs.promises.mkdir(roadsDirPath, { recursive: true });

	for (const dept of departments) {
		const filename = `roads/roads-france-${dept.code}.geojson`;
		filenames.push(filename);
		const stream = await writeResultStream(filename);
		stream.write('{"type":"FeatureCollection","features":[\n');
		stream.hasWritten = false;
		streams.set(dept.code, stream);
	}
	return [streams, filenames];
}

function writeToStream(streams, departmentCode, feature) {
	const stream = streams.get(departmentCode);
	if (!stream) return;

	const prefix = stream.hasWritten ? ",\n" : "";
	stream.write(prefix + JSON.stringify(feature));
	stream.hasWritten = true;
}

function closeWriters(streams) {
	for (const stream of streams.values()) {
		stream.end("\n]}");
	}
}

function parseGeoJSONLine(line) {
	if (line.startsWith("]") || line.startsWith('{"type":"FeatureCollection"')) {
		return null;
	}

	try {
		const cleanLine = line.endsWith(",") ? line.slice(0, -1) : line;
		const feature = JSON.parse(cleanLine);

		return feature.geometry?.coordinates?.length > 0 ? feature : null;
	} catch {
		return null;
	}
}

function getMatchingDepartments(feature, departments) {
	const coords = feature.geometry.coordinates;
	const pointsToCheck = [coords[0], coords[coords.length - 1]];
	const matchedDepts = new Set();

	for (const pt of pointsToCheck) {
		for (const dept of departments) {
			if (matchedDepts.has(dept.code) || !isPointInBox(pt, dept.bbox)) {
				continue;
			}

			if (dept.polygons.some((poly) => isPointInPolygon(pt, poly))) {
				matchedDepts.add(dept.code);
			}
		}
	}

	return matchedDepts;
}

function buildGraphFromGeoJSON(geojson) {
	const nodes = [];
	const indexByCoord = new Map();
	const roadNames = [];
	const roadNameToIndex = new Map();

	const coordKey = (coord) => `${coord[0]},${coord[1]}`;

	function getNodeIndex(coord) {
		const roundedCoord = roundCoord(coord);
		const key = coordKey(roundedCoord);
		if (!indexByCoord.has(key)) {
			indexByCoord.set(key, nodes.length);
			// Format array: [coord, neighbors] au lieu de {coord, neighbors}
			nodes.push([roundedCoord, []]);
		}
		return indexByCoord.get(key);
	}

	// Obtenir ou créer l'index d'un nom de route
	function getRoadNameIndex(name) {
		if (!roadNameToIndex.has(name)) {
			roadNameToIndex.set(name, roadNames.length);
			roadNames.push(name);
		}
		return roadNameToIndex.get(name);
	}

	for (const feature of geojson.features) {
		const coords = feature.geometry.coordinates;
		const oneway = feature.properties.oneway === "yes";
		const roadName = feature.properties.name || "Route inconnue";
		const roadNameIdx = getRoadNameIndex(roadName);

		for (let i = 0; i < coords.length - 1; i++) {
			const a = getNodeIndex(coords[i]);
			const b = getNodeIndex(coords[i + 1]);

			const cost = roundCost(
				distanceMeters(
					[coords[i][1], coords[i][0]],
					[coords[i + 1][1], coords[i + 1][0]],
				),
			);

			// Format compact : neighbors = array à l'index 1 du nœud
			// [toPoint, cost, nameIdx]
			nodes[a][1].push([b, cost, roadNameIdx]);

			if (!oneway) {
				nodes[b][1].push([a, cost, roadNameIdx]);
			}
		}
	}

	return { roadNames, nodes };
}

async function buildGraphForDepartment(departmentCode) {
	const basePath = path.join(__dirname, "..", "results", "roads");
	const geojsonPath = path.join(
		basePath,
		`roads-france-${departmentCode}.geojson`,
	);
	const graphPath = path.join(
		basePath,
		"..",
		"graphs",
		`roads-france-${departmentCode}.json`,
	);

	console.log(`Construction du graphe pour ${departmentCode}...`);

	const geojsonContent = await fs.promises.readFile(geojsonPath, "utf-8");
	const geojson = JSON.parse(geojsonContent);

	const graph = buildGraphFromGeoJSON(geojson);

	await fs.promises.writeFile(graphPath, JSON.stringify(graph));

	return `graphs/roads-france-${departmentCode}.json`;
}

async function roadsFranceTransformer(inputStreamData, inputStreamDepartments) {
	const departmentsRaw = await streamToString(inputStreamDepartments);
	const processedDepartments = processDepartments(departmentsRaw);

	const [streams, filenames] = await initializeWriters(processedDepartments);

	const rlData = readline.createInterface({
		input: inputStreamData,
		crlfDelay: Infinity,
	});

	let processedCount = 0;

	for await (const line of rlData) {
		const feature = parseGeoJSONLine(line);
		if (!feature) continue;

		const matchedDepts = getMatchingDepartments(feature, processedDepartments);

		matchedDepts.forEach((code) => {
			writeToStream(streams, code, feature);
		});

		processedCount++;
		if (processedCount % 10000 === 0) {
			console.log(`${processedCount} features traitées`);
		}
	}

	closeWriters(streams);

	const graphFilenames = [];

	for (const dept of processedDepartments) {
		const graphFile = await buildGraphForDepartment(dept.code);
		graphFilenames.push(graphFile);
	}

	return [...filenames, ...graphFilenames];
}

module.exports = roadsFranceTransformer;
