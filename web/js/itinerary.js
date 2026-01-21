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

function buildGraphFromGeoJSON(geojson) {
  const graph = [];
  const indexByCoord = new Map(); // usage interne uniquement

  function getNodeIndex(coord) {
    const key = coord[0] + "," + coord[1]; // interne, pas exposé
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

    for (let i = 0; i < coords.length - 1; i++) {
      const a = getNodeIndex(coords[i]);
      const b = getNodeIndex(coords[i + 1]);

      const cost = distanceMeters(
        [coords[i][1], coords[i][0]],
        [coords[i + 1][1], coords[i + 1][0]]
      );

      graph[a].neighbors.push({ to: b, cost });

      if (!oneway) {
        graph[b].neighbors.push({ to: a, cost });
      }
    }
  }

  return graph;
}

function findClosestNodeIndex(coordLngLat, graph) {
  let bestIndex = -1;
  let bestDist = Infinity;

  for (let i = 0; i < graph.length; i++) {
    const node = graph[i];

    const d = distanceMeters(
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



function heuristic(graph, from, to) {
  const a = graph[from].coord;
  const b = graph[to].coord;

  return distanceMeters(
    [a[1], a[0]],
    [b[1], b[0]]
  );
}

function weightedAStar(graph, start, goal, weight = 1.4) {
  const openSet = [];
  const closedSet = new Set();

  openSet.push({
    node: start,
    g: 0,
    f: weight * heuristic(graph, start, goal),
    parent: -1
  });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();

    if (current.node === goal) {
      return reconstructPath(current);
    }

    closedSet.add(current.node);

    for (const neighbor of graph[current.node].neighbors) {
      if (closedSet.has(neighbor.to)) continue;

      const g = current.g + neighbor.cost;
      const h = weight * heuristic(graph, neighbor.to, goal);
      const f = g + h;

      const existing = openSet.find(n => n.node === neighbor.to);

      if (!existing || g < existing.g) {
        if (existing) {
          existing.g = g;
          existing.f = f;
          existing.parent = current;
        } else {
          openSet.push({
            node: neighbor.to,
            g,
            f,
            parent: current
          });
        }
      }
    }
  }

  return null;
}

function reconstructPath(node) {
  const path = [];
  let current = node;

  while (current !== -1 && current !== null) {
    path.push(current.node);
    current = current.parent;
  }

  return path.reverse();
}

function pathIndexesToCoords(path, graph) {
  return path.map(i => graph[i].coord);
}




// Itinerary calcul, based on the WA* (weighted A star) algorithm
async function itineraryCalcul(userPosition, positionToReach, map){
  userPosition = [userPosition[1], userPosition[0]]; // TODO, adaptation à ce qui est bad

  // Getting the graph of roads datas

  // 1. Define which department
  const outlinesDep = await fetchOutlinesDepartmentsData();
  const depUser = getDepartmentFromCoords(userPosition, outlinesDep);
  const depPositionToReach = getDepartmentFromCoords(positionToReach, outlinesDep);
  let graph = await fetchRoadsData(depUser);

  // When the dep of user != dep of positionToReach, we suppose that the 2 dep are neighbor
  if(depUser != depPositionToReach){
      console.log("DEP DIFF");
      const secondGraph = await fetchRoadsData(depPositionToReach); 
      const mergedGraph = {
          type: "FeatureCollection",
          features: [...graph.features, ...secondGraph.features]
      }; // Each elements in secondGraph goes in graph
      graph = mergedGraph;
  }

  // 2. Algo :))))

  const graphe = buildGraphFromGeoJSON(graph);

  const start = findClosestNodeIndex(userPosition, graphe);
  const goal = findClosestNodeIndex(positionToReach, graphe);

  const pathIndexes = weightedAStar(graphe, start, goal, 1.4);
  if (!pathIndexes) return null;

  const pathCoordsLngLat = pathIndexesToCoords(pathIndexes, graphe);

  // Conversion Leaflet : [lat, lng] TODO Ca va disparaître normalement
  const latLngs = pathCoordsLngLat.map(([lng, lat]) => [lat, lng]);

  if (itineraryLayer) {
    map.removeLayer(itineraryLayer);
  }

  // Display the itinerary
  itineraryLayer = L.polyline(latLngs, {
    color: "#2563eb",
    weight: 5,
    opacity: 0.9
  }).addTo(map);

  // Zoom on the itinerary
  map.fitBounds(itineraryLayer.getBounds());

  return itineraryLayer;
}