//TODO : Verify and clear
function pointInPolygon(point, polygon) {
	const [x, y] = point;
	let inside = false;

	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i];
		const [xj, yj] = polygon[j];

		const intersect =
			yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

		if (intersect) inside = !inside;
	}

	return inside;
}

// Verify if a point is in a department polygon
function isPointInDepartment(point, geometry) {
	if (geometry.type === "Polygon") {
		return pointInPolygon(point, geometry.coordinates[0]);
	}

	if (geometry.type === "MultiPolygon") {
		return geometry.coordinates.some((multiPoly) =>
			pointInPolygon(point, multiPoly[0]),
		);
	}

	return false;
}

// Making a first verification with a rectangle representing the dep
function bboxContains(point, bbox) {
	const [x, y] = point;
	const [minX, minY, maxX, maxY] = bbox;
	return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function getDepartmentFromCoords(position, outlinesDep) {
	// position is expected in [lat, long] format
	for (const feature of outlinesDep.features) {
		if (!bboxContains(position, feature.bbox)) {
			continue;
		}
		if (isPointInDepartment(position, feature.geometry)) {
			return feature.properties.code;
		}
	}
	return null;
}

function findClosestNodeIndex(coordLatLng, graph) {
	let bestIndex = -1;
	let bestDist = Infinity;

	for (let i = 0; i < graph.nodes.length; i++) {
		const [coord] = graph.nodes[i];
		// coord and coordLatLng are both [lat, long]
		const distance = distanceMeters(coordLatLng, coord);

		if (distance < bestDist) {
			bestDist = distance;
			bestIndex = i;
		}
	}

	return bestIndex;
}

// Estimate remaining distance using haversine formula (crow fly distance)
function heuristic(graph, pointIndex, destIndex) {
	const [pointCoord] = graph.nodes[pointIndex];
	const [destCoord] = graph.nodes[destIndex];
	// pointCoord and destCoord are [lat, long]
	return distanceMeters(pointCoord, destCoord);
}

// Weighted A* algorithm: f(n) = g(n) + weight * h(n)
// - g(n): actual cost from start to node n
// - h(n): heuristic estimate from node n to goal
// - weight: importance factor (> 1 favors speed over optimality)
function weightedAStar(graph, start, goal, weight) {
	const openSet = [];
	const closedSet = new Set();

	openSet.push({
		node: start,
		g: 0,
		f: weight * heuristic(graph, start, goal),
		parent: -1,
	});

	while (openSet.length > 0) {
		// Get node with lowest f value
		openSet.sort((a, b) => a.f - b.f);
		const current = openSet.shift();

		// Goal reached
		if (current.node === goal) {
			return reconstructPath(current);
		}

		closedSet.add(current.node);

		// Explore neighbors
		const [, neighbors] = graph.nodes[current.node];
		for (const [neighborIndex, cost] of neighbors) {
			if (closedSet.has(neighborIndex)) continue;

			const g = current.g + cost;
			const f = g + weight * heuristic(graph, neighborIndex, goal);

			const existing = openSet.find((n) => n.node === neighborIndex);

			if (!existing || g < existing.g) {
				if (existing) {
					existing.g = g;
					existing.f = f;
					existing.parent = current;
				} else {
					openSet.push({
						node: neighborIndex,
						g,
						f,
						parent: current,
					});
				}
			}
		}
	}

	return null;
}

// Explore every parent of a node, until reach the start point (with parent = -1)
function reconstructPath(node) {
	const path = [];
	let current = node;

	while (current !== -1) {
		path.push(current.node);
		current = current.parent;
	}

	return path.reverse();
}

function pathIndexesToCoords(path, graph) {
	return path.map((i) => graph.nodes[i][0]);
}

function defineTotalDistanceItinerary(roadsItinerary) {
	let totalDistance = 0;
	for (let i = 0; i < roadsItinerary.length - 1; i++) {
		totalDistance += distanceMeters(roadsItinerary[i], roadsItinerary[i + 1]);
	}
	return totalDistance;
}

function buildRoadsRecap(pathIndexes, roadsGraph) {
	const recap = [];
	let currentRoad = null;
	let currentDistance = 0;

	for (let i = 0; i < pathIndexes.length - 1; i++) {
		const from = pathIndexes[i];
		const to = pathIndexes[i + 1];

		const [, neighbors] = roadsGraph.nodes[from];
		const edge = neighbors.find(([neighborIndex]) => neighborIndex === to);
		if (!edge) continue;

		const [, cost, roadNameIndex] = edge;
		const roadName = roadsGraph.roadNames[roadNameIndex];

		if (roadName !== currentRoad) {
			if (currentRoad) {
				recap.push({
					road: currentRoad,
					distance: Math.round(currentDistance),
				});
			}
			currentRoad = roadName;
			currentDistance = cost;
		} else {
			currentDistance += cost;
		}
	}

	if (currentRoad) {
		recap.push({
			road: currentRoad,
			distance: Math.round(currentDistance),
		});
	}

	return recap;
}

async function fetchRoadsGraph(numDep) {
	const response = await fetch(`../data/graphs/roads-france-${numDep}.json`);

	return await response.json();
}

function mergeGraphs(graph1, graph2) {
	// Merge roadNames and create mapping
	const mergedRoadNames = [...graph1.roadNames];
	const roadNameMap = new Map();

	graph2.roadNames.forEach((name, idx) => {
		const existingIdx = mergedRoadNames.indexOf(name);
		if (existingIdx !== -1) {
			roadNameMap.set(idx, existingIdx);
		} else {
			roadNameMap.set(idx, mergedRoadNames.length);
			mergedRoadNames.push(name);
		}
	});

	// Build spatial index for graph1 nodes (for duplicate detection)
	const coordToNodeIndex = new Map();
	graph1.nodes.forEach((node, idx) => {
		const [coord] = node;
		const key = `${coord[0]},${coord[1]}`;
		coordToNodeIndex.set(key, idx);
	});

	// Map graph2 node indices to final merged indices
	const nodeIndexMap = new Map();
	graph2.nodes.forEach((node, idx) => {
		const [coord] = node;
		const key = `${coord[0]},${coord[1]}`;

		if (coordToNodeIndex.has(key)) {
			// Duplicate node at boundary - reuse graph1's index
			nodeIndexMap.set(idx, coordToNodeIndex.get(key));
		} else {
			// Unique node - will be added
			nodeIndexMap.set(idx, -1);
		}
	});

	// Start with all nodes from graph1
	const mergedNodes = [...graph1.nodes];
	const nodeOffset = graph1.nodes.length;

	// Add unique nodes from graph2
	graph2.nodes.forEach((node, idx) => {
		if (nodeIndexMap.get(idx) === -1) {
			nodeIndexMap.set(idx, mergedNodes.length);
			const [coord] = node;
			mergedNodes.push([coord, []]);
		}
	});

	// Update neighbors for all graph2 nodes
	graph2.nodes.forEach((node, idx) => {
		const [, neighbors] = node;
		const finalNodeIdx = nodeIndexMap.get(idx);

		const updatedNeighbors = neighbors.map(([toPoint, cost, nameIdx]) => [
			nodeIndexMap.get(toPoint),
			cost,
			roadNameMap.get(nameIdx),
		]);

		if (finalNodeIdx < nodeOffset) {
			// Duplicate node - merge neighbors
			const [existingCoord, existingNeighbors] = mergedNodes[finalNodeIdx];
			const existingSet = new Set(
				existingNeighbors.map(([toPoint]) => toPoint),
			);
			const newNeighbors = updatedNeighbors.filter(
				([toPoint]) => !existingSet.has(toPoint),
			);

			mergedNodes[finalNodeIdx] = [
				existingCoord,
				[...existingNeighbors, ...newNeighbors],
			];
		} else {
			// Unique node - set neighbors
			mergedNodes[finalNodeIdx][1] = updatedNeighbors;
		}
	});

	return {
		roadNames: mergedRoadNames,
		nodes: mergedNodes,
	};
}

async function itineraryCalcul(userPosition, positionToReach) {
	// userPosition comes as [lat, long] from Leaflet - already correct format
	// positionToReach comes as [long, lat] from GeoJSON, convert to [lat, long]
	positionToReach = [positionToReach[1], positionToReach[0]];

	// Remove previous itinerary
	if (globalItineraryLayer) {
		globalMap.removeLayer(globalItineraryLayer);
	}

	// Determine which departments are needed
	const outlinesDep = await fetchOutlinesDepartmentsData();
	const depUser = getDepartmentFromCoords(userPosition, outlinesDep);
	const depDestination = getDepartmentFromCoords(positionToReach, outlinesDep);

	// Load road graph(s)
	let roadsGraph = await fetchRoadsGraph(depUser);
	if (depUser !== depDestination) {
		const secondGraph = await fetchRoadsGraph(depDestination);
		roadsGraph = mergeGraphs(roadsGraph, secondGraph);
	}

	// Find closest nodes in graph for start and destination
	const startIndex = findClosestNodeIndex(userPosition, roadsGraph);
	const goalIndex = findClosestNodeIndex(positionToReach, roadsGraph);

	// Calculate path using Weighted A* (weight = 1.5)
	const pathIndexes = weightedAStar(roadsGraph, startIndex, goalIndex, 1.5);

	if (!pathIndexes) {
		alert("Echec du calcul d'itinéraire");
		return null;
	}

	// Convert path to coordinates
	const pathCoords = pathIndexesToCoords(pathIndexes, roadsGraph);

	// pathCoords are already [lat, long], perfect for Leaflet
	const leafletCoords = pathCoords;

	// Log itinerary information
	const totalDistance = defineTotalDistanceItinerary(leafletCoords);
	const roadRecap = buildRoadsRecap(pathIndexes, roadsGraph);
	console.log(`Distance totale: ${Math.round(totalDistance)} m`);
	console.log("Récap de l'itinéraire:");
	roadRecap.forEach((step) => {
		console.log(`- ${step.distance} m sur ${step.road}`);
	});

	// Display itinerary on map
	globalItineraryLayer = L.polyline(leafletCoords, {
		color: "#2563eb",
		weight: 5,
		opacity: 0.9,
	}).addTo(globalMap);

	globalMap.fitBounds(globalItineraryLayer.getBounds());

	return globalItineraryLayer;
}
