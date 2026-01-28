//TODO : Verify and clear
function pointInPolygon(point, polygon) {
	const [x, y] = point;
	let inside = false;

	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i];
		const [xj, yj] = polygon[j];
		if ((yi > y !== yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}

	return inside;
}

// Verify if a point is in a department polygon
function isPointInDepartment(point, geometry) {
	if (geometry.type === "Polygon") {
		return pointInPolygon(point, geometry.coordinates[0]);
	}
	if (geometry.type === "MultiPolygon") {
		return geometry.coordinates.some((multiPoly) => pointInPolygon(point, multiPoly[0]));
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
	for (const feature of outlinesDep.features) {
		if (!bboxContains(position, feature.bbox)) continue;
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
		const distance = distanceMeters(coordLatLng, graph.nodes[i][0]);
		if (distance < bestDist) {
			bestDist = distance;
			bestIndex = i;
		}
	}

	return bestIndex;
}

// Estimate remaining distance using haversine formula (crow fly distance)
function heuristic(graph, pointIndex, destIndex) {
	return distanceMeters(graph.nodes[pointIndex][0], graph.nodes[destIndex][0]);
}

// Evaluating function : f(n) = g(n) + w * h(n)
// g : node cost
// w : weight (importance factor given by the WA* algorithm)
// h : heuristic (evaluating the resting distance to reach the destination)
function weightedAStar(graph, start, goal, weight) {
	const openSet = []; // Nodes to explores
	const closedSet = new Set(); // Already explored nodes. Set for no doublons

	// Obviously we firstly have the start node, the starting point
	openSet.push({
		node: start,
		g: 0,
		f: weight * heuristic(graph, start, goal),
		parent: -1,
	});

	// While there is still nodes to explore
	while (openSet.length > 0) {
		openSet.sort((a, b) => a.f - b.f); // Taking the best node (lowest evaluating function's result) and explore it
		const current = openSet.shift();

		// If the node is the final destination, return
		if (current.node === goal) {
			return reconstructPath(current);
		}

		closedSet.add(current.node);

		//For all the neighbors of the current node
		for (const [neighborIndex, cost] of graph.nodes[current.node][1]) {
			if (closedSet.has(neighborIndex)) continue; // We don't explore neighbor that are already explored

			// Defining the evaluating function
			const g = current.g + cost;
			const f = g + weight * heuristic(graph, neighborIndex, goal);

			const existing = openSet.find((n) => n.node === neighborIndex);

			if (!existing || g < existing.g) {
				// Better way found, actialising the existant path
				if (existing) {
					existing.g = g;
					existing.f = f;
					existing.parent = current;
				}
				// Making new node to explore
				else {
					openSet.push({ node: neighborIndex, g, f, parent: current });
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

function defineTotalDistanceItinerary(coords) {
	let total = 0;
	for (let i = 0; i < coords.length - 1; i++) {
		total += distanceMeters(coords[i], coords[i + 1]);
	}
	return total;
}

// Calcule l'azimut entre deux points et retourne la direction du virage
function getTurnDirection(before, at, after, nodes) {
	if (!before || !after) return null;

	const [c1, c2, c3] = [nodes[before][0], nodes[at][0], nodes[after][0]];

	const bearing = (from, to) => {
		const dLng = toRad(to[1] - from[1]);
		const lat1 = toRad(from[0]);
		const lat2 = toRad(to[0]);
		return Math.atan2(
			Math.sin(dLng) * Math.cos(lat2),
			Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
		) * 180 / Math.PI;
	};

	let angle = bearing(c2, c3) - bearing(c1, c2);
	while (angle > 180) angle -= 360;
	while (angle < -180) angle += 360;

	return angle > 30 ? "right" : angle < -30 ? "left" : "straight";
}

function buildRoadsRecap(pathIndexes, roadsGraph) {
	const recap = [];
	let currentRoad = null;
	let currentDistance = 0;
	let turnIndex = 0;

	for (let i = 0; i < pathIndexes.length - 1; i++) {
		const neighbors = roadsGraph.nodes[pathIndexes[i]][1];
		const edge = neighbors.find(([n]) => n === pathIndexes[i + 1]);
		if (!edge) continue;

		const roadName = roadsGraph.roadNames[edge[2]];

		if (roadName !== currentRoad) {
			if (currentRoad) {
				const direction = recap.length > 0 && turnIndex > 0
					? getTurnDirection(pathIndexes[turnIndex - 1], pathIndexes[turnIndex], pathIndexes[turnIndex + 1], roadsGraph.nodes)
					: null;
				recap.push({ road: currentRoad, distance: Math.round(currentDistance), direction });
			}
			turnIndex = i;
			currentRoad = roadName;
			currentDistance = edge[1];
		} else {
			currentDistance += edge[1];
		}
	}

	if (currentRoad) {
		const direction = recap.length > 0 && turnIndex > 0 && pathIndexes[turnIndex + 1]
			? getTurnDirection(pathIndexes[turnIndex - 1], pathIndexes[turnIndex], pathIndexes[turnIndex + 1], roadsGraph.nodes)
			: null;
		recap.push({ road: currentRoad, distance: Math.round(currentDistance), direction });
	}

	return recap;
}

async function fetchRoadsGraph(numDep) {
	const response = await fetch(`../data/graphs/roads-france-${numDep}.json`);
	return response.json();
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
		const key = `${node[0][0]},${node[0][1]}`;
		coordToNodeIndex.set(key, idx);
	});

	// Map graph2 node indices to final merged indices
	const nodeIndexMap = new Map();
	graph2.nodes.forEach((node, idx) => {
		const key = `${node[0][0]},${node[0][1]}`;

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
			mergedNodes.push([node[0], []]);
		}
	});

	// Update neighbors for all graph2 nodes
	graph2.nodes.forEach((node, idx) => {
		const neighbors = node[1];
		const finalNodeIdx = nodeIndexMap.get(idx);

		const updatedNeighbors = neighbors.map(([toPoint, cost, nameIdx]) => [
			nodeIndexMap.get(toPoint),
			cost,
			roadNameMap.get(nameIdx),
		]);

		if (finalNodeIdx < nodeOffset) {
			// Duplicate node - merge neighbors
			const [existingCoord, existingNeighbors] = mergedNodes[finalNodeIdx];
			const existingSet = new Set(existingNeighbors.map(([toPoint]) => toPoint));
			const newNeighbors = updatedNeighbors.filter(([toPoint]) => !existingSet.has(toPoint));
			mergedNodes[finalNodeIdx] = [existingCoord, [...existingNeighbors, ...newNeighbors]];
		} else {
			// Unique node - set neighbors
			mergedNodes[finalNodeIdx][1] = updatedNeighbors;
		}
	});

	return { roadNames: mergedRoadNames, nodes: mergedNodes };
}

// Get all departments crossed by a straight line between two points
function getDepartmentsAlongLine(start, end, outlinesDep, numSamples = 20) {
	const depStart = getDepartmentFromCoords(start, outlinesDep);
	const depEnd = getDepartmentFromCoords(end, outlinesDep);

	if (depStart && depStart === depEnd) return [depStart];

	const departments = new Set();
	if (depStart) departments.add(depStart);
	if (depEnd) departments.add(depEnd);

	for (let i = 1; i < numSamples; i++) {
		const t = i / numSamples;
		const point = [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])];
		const dep = getDepartmentFromCoords(point, outlinesDep);
		if (dep) departments.add(dep);
	}

	return Array.from(departments);
}

async function itineraryCalcul(userPosition, positionToReach) {

	// Remove previous itinerary
	if (globalItineraryLayer) {
		globalMap.removeLayer(globalItineraryLayer);
	}

	const outlinesDep = await fetchOutlinesDepartmentsData();
	const departments = getDepartmentsAlongLine(userPosition, positionToReach, outlinesDep);

	let roadsGraph = null;
	for (const dep of departments) {
		try {
			const graph = await fetchRoadsGraph(dep);
			roadsGraph = roadsGraph ? mergeGraphs(roadsGraph, graph) : graph;
		} catch (e) {
			console.warn(`Could not load graph for department ${dep}:`, e);
		}
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
	// Log itinerary information
	const totalDistance = defineTotalDistanceItinerary(pathCoords);
	const roadRecap = buildRoadsRecap(pathIndexes, roadsGraph);

	// Display itinerary on map
	globalItineraryLayer = L.polyline(pathCoords, {
		color: "#2563eb",
		weight: 5,
		opacity: 0.9,
	}).addTo(globalMap);

	globalMap.fitBounds(globalItineraryLayer.getBounds());

	return [totalDistance, roadRecap];
}

const ITINERARY_ICONS = {
	straight: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6L12 2L16 6"/><path d="M12 2V22"/></svg>',
	right: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>',
	left: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20v-7a4 4 0 0 0-4-4H4"/><path d="M9 14 4 9l5-5"/></svg>'
};

async function showItinerary(feature) {
	const targetCoords = feature.geometry.coordinates;
	globalItineraryTarget = targetCoords;
	updateDestinationMarker(feature);

	const itinerary = await itineraryCalcul(globalUserPosition, targetCoords);

	document.getElementById("sidebar").style.display = "none";
	document.getElementById("itinerary-sidebar").style.display = "flex";

	const p = feature.properties;
	document.getElementById("destination-name").textContent = p.brand || p.name || "Distributeur";
	document.getElementById("destination-type").textContent = translateType(p.type);

	const locationEl = document.getElementById("destination-location");
	const locationParts = [p.meta_name_com, p.meta_name_dep].filter(Boolean);
	locationEl.textContent = locationParts.join(", ");
	locationEl.style.display = locationParts.length ? "block" : "none";

	const operatorRow = document.getElementById("destination-operator-row");
	const operatorValue = document.getElementById("destination-operator");
	operatorValue.textContent = p.operator || "-";
	operatorRow.style.display = p.operator ? "" : "none";
	operatorValue.style.display = p.operator ? "" : "none";

	const accessRow = document.getElementById("destination-accessibility-row");
	const accessValue = document.getElementById("destination-accessibility");
	accessValue.textContent = translateAccessibility(p.wheelchair);
	accessRow.style.display = p.wheelchair ? "" : "none";
	accessValue.style.display = p.wheelchair ? "" : "none";

	const hoursEl = document.getElementById("destination-hours");
	const openingHours = p.opening_hours || (p.type === "atm" ? "24/7" : null);
	hoursEl.innerHTML = openingHours ? getOpeningHoursHTML(openingHours) : "";
	hoursEl.style.display = openingHours ? "block" : "none";

	document.getElementById("itinerary-total-distance").textContent = formatDistance(itinerary[0]);
	const stepsList = document.getElementById("itinerary-steps");
	stepsList.innerHTML = "";

	for (const step of itinerary[1]) {
		const li = document.createElement("li");
		const icon = ITINERARY_ICONS[step.direction] || ITINERARY_ICONS.straight;
		li.innerHTML = `<span class="itinerary-icon">${icon}</span><span class="itinerary-road-name">${step.road}</span><span class="itinerary-distance">${formatDistance(step.distance)}</span>`;
		stepsList.appendChild(li);
	}

	if (feature._layer) feature._layer.closePopup();

	return itinerary;
}
