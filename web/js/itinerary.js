//TODO : Verify and clear
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);

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
    return geometry.coordinates.some(multiPoly =>
      pointInPolygon(point, multiPoly[0])
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
    //position = [position[1], position[0]]; // Reversing lat/long to long/lat / TODO
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

//TODO : Verify and clear : IN BACK
function buildGraphFromGeoJSON(geojson) {
  const graph = [];
  const indexByCoord = new Map();

  function getNodeIndex(coord) {
    const key = coord[0] + "," + coord[1];
    if (!indexByCoord.has(key)) {
      indexByCoord.set(key, graph.length);
      graph.push({
        coord,
        neighbors: []
      });
    }
    return indexByCoord.get(key);
  }

  for (const feature of geojson.features) {
    const coords = feature.geometry.coordinates;
    const oneway = feature.properties.oneway === "yes";
    const roadName = feature.properties.name || "Route inconnue";

    for (let i = 0; i < coords.length - 1; i++) {
      const a = getNodeIndex(coords[i]);
      const b = getNodeIndex(coords[i + 1]);

      const cost = distanceMeters( // TODO inverser
        [coords[i][1], coords[i][0]],
        [coords[i + 1][1], coords[i + 1][0]]
      );

      graph[a].neighbors.push({ toPoint: b, cost, name: roadName });

      if (!oneway) {
        graph[b].neighbors.push({ toPoint: a, cost, name: roadName });
      }
    }
  }

  return graph;
}

//TODO : Verify and clear
function findClosestNodeIndex(coordLngLat, graph) {
  let bestIndex = -1;
  let bestDist = Infinity;

  for (let i = 0; i < graph.length; i++) {
    const node = graph[i];

    const d = distanceMeters( // INVERSER TODO
      [coordLngLat[1], coordLngLat[0]],  // lat, lng
      [node.coord[1], node.coord[0]]     // lat, lng
    );

    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  return bestIndex;
}


// Estimate the resting distance (crow fly with distanceMeters (haversine formula)) 
function heuristic(graph, point, dest) { // TODO, on inversera lat et long
  return distanceMeters(
    [graph[point].coord[1], graph[point].coord[0]],
    [graph[dest].coord[1], graph[dest].coord[0]]
  );
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
    f: 0 + weight * heuristic(graph, start, goal),
    parent: -1
  });

  // While there is still nodes to explore
  while (openSet.length > 0) {

    openSet.sort((a, b) => a.f - b.f); // Taking the best node (lowest evaluating function's result) and explore it
    const currentNode = openSet.shift();

    // If the node is the final destination, return
    if (currentNode.node === goal) {
      return reconstructPath(currentNode);
    }

    closedSet.add(currentNode.node);

    //For all the neighbors of the current node
    for (const neighbor of graph[currentNode.node].neighbors) {
      if (closedSet.has(neighbor.toPoint)) continue; // We don't explore neighbor that are already explored

      // Defining the evaluating function
      const g = currentNode.g + neighbor.cost;
      const f = g + weight * heuristic(graph, neighbor.toPoint, goal);

      const existing = openSet.find(n => n.node === neighbor.toPoint);

      if (!existing || g < existing.g) {
        // Better way found, actialising the existant path
        if (existing) {
          existing.g = g;
          existing.f = f;
          existing.parent = currentNode;
        }
        // Making new node to explore
        else {
          openSet.push({
            node: neighbor.toPoint,
            g,
            f,
            parent: currentNode
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
  return path.map(i => graph[i].coord);
}

function defineTotalDistanceItinerary(roadsItinerary){
  let totalDistance = 0;
  for (let i = 0; i < roadsItinerary.length - 1; i++) {
    totalDistance += distanceMeters(roadsItinerary[i], roadsItinerary[i + 1]);
  }
  return totalDistance;
}

//TODO : Verify and clear
function buildRoadsRecap(pathIndexes, roadsGraph) {
  const recap = [];

  let currentRoad = null;
  let currentDistance = 0;

  for (let i = 0; i < pathIndexes.length - 1; i++) {
    const from = pathIndexes[i];
    const toPoint = pathIndexes[i + 1];

    const edge = roadsGraph[from].neighbors.find(n => n.toPoint === toPoint);
    if (!edge) continue;

    if (edge.name !== currentRoad) {
      if (currentRoad !== null) {
        recap.push({
          road: currentRoad,
          distance: Math.round(currentDistance)
        });
      }
      currentRoad = edge.name;
      currentDistance = edge.cost;
    } else {
      currentDistance += edge.cost;
    }
  }

  if (currentRoad !== null) {
    recap.push({
      road: currentRoad,
      distance: Math.round(currentDistance)
    });
  }

  return recap;
}





// Itinerary calcul, based on the WA* (weighted A star) algorithm
async function itineraryCalcul(userPosition, positionToReach){
  userPosition = [userPosition[1], userPosition[0]]; // TODO, adaptation à ce qui est bad

  // Deleting the previous itinérary
  if (globalItineraryLayer) {
    globalMap.removeLayer(globalItineraryLayer);
  }

  // 1. Define which department is necessary
  const outlinesDep = await fetchOutlinesDepartmentsData();
  const depUser = getDepartmentFromCoords(userPosition, outlinesDep);
  const depPositionToReach = getDepartmentFromCoords(positionToReach, outlinesDep);
  let roadsDep = await fetchRoadsData(depUser);

  // When the dep of userPosition != dep of positionToReach, we suppose that the 2 dep are neighbor (not prefect, simplified solution :( )
  if(depUser != depPositionToReach){
      const secondRoadsDep = await fetchRoadsData(depPositionToReach); 
      const mergedRoadsDep = {
          type: "FeatureCollection",
          features: [...roadsDep.features, ...secondRoadsDep.features]
      }; // Each elements in secondRoadsDep goes in roadsDep
      roadsDep = mergedRoadsDep;
  }

  // 2. Building the graph // TODO - ça sera passé en back

  const roadsGraph = buildGraphFromGeoJSON(roadsDep);

  // 3. define a point in graph for the 2 positions
  const indexGraphStart = findClosestNodeIndex(userPosition, roadsGraph);
  const indexGraphGoal = findClosestNodeIndex(positionToReach, roadsGraph);

  // 4. Using the WA* algorithm with a weight of 1.5

  const pathIndexes = weightedAStar(roadsGraph, indexGraphStart, indexGraphGoal, 1.5);
  if (!pathIndexes){
    alert("Echec du calcul d'itinéraire");
    return null;
  }

  const pathCoordsLngLat = pathIndexesToCoords(pathIndexes, roadsGraph);

  // Conversion Leaflet : [lat, lng] TODO Ca va disparaître normalement
  const roadsItinerary = pathCoordsLngLat.map(([lng, lat]) => [lat, lng]);

  // Adding recap informations
  console.log("Distance totale :", Math.round(defineTotalDistanceItinerary(roadsItinerary)), "m");
  const roadsRecap = buildRoadsRecap(pathIndexes, roadsGraph);
  console.log("Récap de l’itinéraire :");
  roadsRecap.forEach(step => {
    console.log(`- ${step.distance} m sur ${step.road}`);
  });


  // Display the itinerary
  globalItineraryLayer = L.polyline(roadsItinerary, {
    color: "#2563eb",
    weight: 5,
    opacity: 0.9
  }).addTo(globalMap);

  // Zoom on the itinerary
  globalMap.fitBounds(globalItineraryLayer.getBounds());

  return globalItineraryLayer;
}