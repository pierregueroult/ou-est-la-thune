
const fs = require('fs');
const path = require('path');

// --- Utils (extracted from utils.js) ---
const CONSTANTS = {
    EARTH_RADIUS_METERS: 6371000,
};

const toRad = (x) => (x * Math.PI) / 180;

function distanceMeters([lat1, lng1], [lat2, lng2]) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return CONSTANTS.EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Itinerary Logic (extracted from itinerary.js) ---

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

    let nodesVisited = 0; // Added for benchmarking

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
        
        nodesVisited++;

		// If the node is the final destination, return
		if (current.node === goal) {
			return { path: reconstructPath(current), nodesVisited, cost: current.g };
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

// --- Benchmark Logic ---

function loadGraph(filePath) {
    console.log(`Loading graph from ${filePath}...`);
    const rawData = fs.readFileSync(filePath);
    return JSON.parse(rawData);
}

function getRandomNodeIndex(graph) {
    return Math.floor(Math.random() * graph.nodes.length);
}

function runBenchmark() {
    const graphPath = path.join(__dirname, '../web/data/graphs/roads-france-90.json');
    const graph = loadGraph(graphPath);
    console.log(`Graph loaded. Nodes: ${graph.nodes.length}`);

    const weights = [1.0, 1.1, 1.2, 1.5, 2.0, 3.0, 5.0];
    const numPairs = 50;
    const pairs = [];

    // Generate random pairs
    console.log(`Generating ${numPairs} random test pairs...`);
    for (let i = 0; i < numPairs; i++) {
        let start = getRandomNodeIndex(graph);
        let goal = getRandomNodeIndex(graph);
        while (start === goal) {
            goal = getRandomNodeIndex(graph);
        }
        pairs.push({ start, goal });
    }

    console.log('Starting benchmark...\n');
    console.log('Weight | Avg Time (ms) | Avg Visited | Avg Cost (m) | Success Rate');
    console.log('-------|---------------|-------------|--------------|-------------');

    for (const w of weights) {
        let totalTime = 0;
        let totalVisited = 0;
        let totalCost = 0;
        let successCount = 0;

        for (const { start, goal } of pairs) {
            const startTime = performance.now();
            const result = weightedAStar(graph, start, goal, w);
            const endTime = performance.now();

            if (result) {
                totalTime += (endTime - startTime);
                totalVisited += result.nodesVisited;
                totalCost += result.cost;
                successCount++;
            }
        }

        const avgTime = successCount > 0 ? (totalTime / successCount).toFixed(2) : 0;
        const avgVisited = successCount > 0 ? (totalVisited / successCount).toFixed(0) : 0;
        const avgCost = successCount > 0 ? (totalCost / successCount).toFixed(0) : 0;
        const successRate = ((successCount / numPairs) * 100).toFixed(0);

        console.log(`${w.toFixed(1).padEnd(6)} | ${avgTime.padStart(13)} | ${avgVisited.padStart(11)} | ${avgCost.padStart(12)} | ${successRate.padStart(11)}%`);
    }
}

runBenchmark();
