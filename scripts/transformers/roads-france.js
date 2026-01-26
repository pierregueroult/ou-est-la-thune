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
const {
	startTransform,
	endTransform,
	stepInfo,
	stat,
	progressIncremental,
	info,
} = require("../log.js");

const TRANSFORMER_NAME = "roads-france";

// Configuration
const WRITE_BUFFER_SIZE = 100; // Nombre de features à mettre en buffer avant écriture

/**
 * Format du graphe généré :
 * {
 *   roadNames: [                      // Dictionnaire des noms de routes
 *     "Rue de la République",
 *     "Avenue des Champs",
 *     ...
 *   ],
 *   nodes: [                          // Liste des nœuds du graphe
 *     [
 *       [latitude, longitude],        // Index 0: Coordonnées arrondies à 5 décimales (~1m)
 *       [                             // Index 1: Liste des neighbors
 *         [toPoint, cost, nameIdx],   // toPoint: index du nœud de destination
 *                                     // cost: distance en mètres (arrondie)
 *                                     // nameIdx: index dans roadNames
 *         ...
 *       ]
 *     ],
 *     ...
 *   ]
 * }
 */

// Arrondir les coordonnées à 5 décimales (~1m de précision)
// OSM GeoJSON coords are [long, lat], convert to [lat, long] for graph storage
function roundCoord(coord) {
	return [
		Math.round(coord[1] * 100000) / 100000,
		Math.round(coord[0] * 100000) / 100000,
	];
}

// Arrondir le coût au mètre près
function roundCost(cost) {
	return Math.round(cost);
}

function processDepartments(geoJsonString) {
	stepInfo(TRANSFORMER_NAME, 1, "Processing department boundaries");
	const data = JSON.parse(geoJsonString);
	stat(TRANSFORMER_NAME, "Total departments", data.features.length);

	return data.features.map(({ properties, geometry }) => {
		const polygonList =
			geometry.type === "Polygon"
				? [geometry.coordinates]
				: geometry.coordinates;

		return {
			code: properties.code,
			bbox: getBoundingBox(geometry.coordinates),
			polygons: polygonList.map((poly) => poly[0]),
		};
	});
}

async function initializeWriters(departments) {
	stepInfo(TRANSFORMER_NAME, 2, "Initializing output streams");
	const streams = new Map();
	const buffers = new Map();

	const roadsDirPath = path.join(__dirname, "..", "results", "roads");
	await fs.promises.mkdir(roadsDirPath, { recursive: true });

	for (const dept of departments) {
		const filename = `roads/roads-france-${dept.code}.geojson`;
		const stream = await writeResultStream(filename);
		stream.write('{"type":"FeatureCollection","features":[\n');
		stream.hasWritten = false;
		streams.set(dept.code, stream);
		buffers.set(dept.code, []);
	}

	stat(TRANSFORMER_NAME, "Output streams created", streams.size);
	return { streams, buffers };
}

function flushBuffer(streams, buffers, departmentCode) {
	const buffer = buffers.get(departmentCode);
	if (!buffer || buffer.length === 0) return;

	const stream = streams.get(departmentCode);
	if (!stream) return;

	for (const feature of buffer) {
		const prefix = stream.hasWritten ? ",\n" : "";
		stream.write(prefix + JSON.stringify(feature));
		stream.hasWritten = true;
	}

	buffer.length = 0;
}

function writeToStream(streams, buffers, departmentCode, feature) {
	const buffer = buffers.get(departmentCode);
	if (!buffer) return;

	buffer.push(feature);

	if (buffer.length >= WRITE_BUFFER_SIZE) {
		flushBuffer(streams, buffers, departmentCode);
	}
}

function closeWriters(streams, buffers) {
	// Flush tous les buffers restants
	for (const [code, _] of buffers) {
		flushBuffer(streams, buffers, code);
	}

	// Fermer tous les streams
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

async function buildGraphForDepartment(departmentCode) {
	const geojsonPath = path.join(
		__dirname,
		"..",
		"results",
		"roads",
		`roads-france-${departmentCode}.geojson`,
	);

	info(TRANSFORMER_NAME, `Building graph for department ${departmentCode}`);

	// Streaming JSON parsing pour éviter de charger tout en mémoire
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
			nodes.push([roundedCoord, []]);
		}
		return indexByCoord.get(key);
	}

	function getRoadNameIndex(name) {
		if (!roadNameToIndex.has(name)) {
			roadNameToIndex.set(name, roadNames.length);
			roadNames.push(name);
		}
		return roadNameToIndex.get(name);
	}

	// Lire le fichier ligne par ligne
	const fileStream = fs.createReadStream(geojsonPath);
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	let featureCount = 0;
	for await (const line of rl) {
		const feature = parseGeoJSONLine(line);
		if (!feature) continue;

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

			nodes[a][1].push([b, cost, roadNameIdx]);

			if (!oneway) {
				nodes[b][1].push([a, cost, roadNameIdx]);
			}
		}

		featureCount++;
	}

	stat(`${TRANSFORMER_NAME}:${departmentCode}`, "Features", featureCount);
	stat(`${TRANSFORMER_NAME}:${departmentCode}`, "Graph nodes", nodes.length);
	stat(`${TRANSFORMER_NAME}:${departmentCode}`, "Road names", roadNames.length);

	// Écrire le graphe en streaming pour éviter JSON.stringify sur des gros objets
	const graphPath = path.join(
		__dirname,
		"..",
		"results",
		"graphs",
		`roads-france-${departmentCode}.json`,
	);

	const writeStream = fs.createWriteStream(graphPath);

	// Écrire la structure JSON manuellement en streaming
	writeStream.write('{"roadNames":');
	writeStream.write(JSON.stringify(roadNames));
	writeStream.write(',"nodes":[');

	// Écrire les nœuds par chunks pour éviter de tout garder en mémoire
	const CHUNK_SIZE = 1000;
	for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
		const chunk = nodes.slice(i, Math.min(i + CHUNK_SIZE, nodes.length));
		const chunkJson = chunk.map((node) => JSON.stringify(node)).join(",");

		if (i > 0) {
			writeStream.write(",");
		}
		writeStream.write(chunkJson);

		// Permettre au GC de s'exécuter entre les chunks
		await new Promise((resolve) => setImmediate(resolve));
	}

	writeStream.write("]}");
	writeStream.end();

	// Attendre que le stream soit fermé
	await new Promise((resolve, reject) => {
		writeStream.on("finish", resolve);
		writeStream.on("error", reject);
	});

	// Libérer la mémoire
	indexByCoord.clear();
	roadNameToIndex.clear();
	nodes.length = 0;

	return `graphs/roads-france-${departmentCode}.json`;
}

async function buildGraphsInBatches(departments) {
	stepInfo(TRANSFORMER_NAME, 4, "Building graphs sequentially");

	const graphFilenames = [];

	// Traiter séquentiellement pour éviter de saturer la mémoire
	for (let i = 0; i < departments.length; i++) {
		const dept = departments[i];
		info(
			TRANSFORMER_NAME,
			`Processing department ${i + 1}/${departments.length}: ${dept.code}`,
		);

		const graphFile = await buildGraphForDepartment(dept.code);
		graphFilenames.push(graphFile);

		// Force garbage collection entre chaque département si disponible
		if (global.gc) {
			global.gc();
		}
	}

	stat(TRANSFORMER_NAME, "Graphs generated", graphFilenames.length);
	return graphFilenames;
}

async function roadsFranceTransformer(inputStreamData, inputStreamDepartments) {
	const startTime = Date.now();
	startTransform(TRANSFORMER_NAME, [
		"osm-france-roads.geojson",
		"departements-france.geojson",
	]);

	const departmentsRaw = await streamToString(inputStreamDepartments);
	const processedDepartments = processDepartments(departmentsRaw);

	const { streams, buffers } = await initializeWriters(processedDepartments);

	stepInfo(TRANSFORMER_NAME, 3, "Dispatching road features to departments");

	const rlData = readline.createInterface({
		input: inputStreamData,
		crlfDelay: Infinity,
	});

	let processedCount = 0;
	let assignedCount = 0;

	for await (const line of rlData) {
		const feature = parseGeoJSONLine(line);
		if (!feature) continue;

		const matchedDepts = getMatchingDepartments(feature, processedDepartments);

		for (const code of matchedDepts) {
			writeToStream(streams, buffers, code, feature);
			assignedCount++;
		}

		processedCount++;
		progressIncremental(
			TRANSFORMER_NAME,
			processedCount,
			10000,
			"road features processed",
		);
	}

	stat(TRANSFORMER_NAME, "Total road features processed", processedCount);
	stat(TRANSFORMER_NAME, "Total feature assignments", assignedCount);

	closeWriters(streams, buffers);

	// Créer le dossier des graphes
	const graphsDirPath = path.join(__dirname, "..", "results", "graphs");
	await fs.promises.mkdir(graphsDirPath, { recursive: true });

	// Construire les graphes par batch pour éviter de saturer la mémoire
	const graphFilenames = await buildGraphsInBatches(processedDepartments);

	const filenames = processedDepartments.map(
		(dept) => `roads/roads-france-${dept.code}.geojson`,
	);

	const duration = Date.now() - startTime;
	endTransform(TRANSFORMER_NAME, [...filenames, ...graphFilenames], duration);

	return [...filenames, ...graphFilenames];
}

module.exports = roadsFranceTransformer;
