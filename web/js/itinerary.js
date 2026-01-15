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
    position = [position[1], position[0]]; // Reversing lat/long to long/lat
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


// Itinerary calcul, based on the WA* (weighted A star) algorithm
async function itineraryCalcul(userPosition, positionToReach){
    console.log(userPosition);
    console.log(positionToReach);

    // Getting the graph of roads datas

    // 1. Define which department
    const outlinesDep = await fetchOutlinesDepartmentsData();
    const depUser = getDepartmentFromCoords(userPosition, outlinesDep);
    const depPositionToReach = getDepartmentFromCoords(positionToReach, outlinesDep);
    let graph = await fetchRoadsData(depUser);

    // When the dep of user != dep of positionToReach, we suppose that the 2 dep are neighbor
    // TODO if they are not
    if(depUser != depPositionToReach){
        const secondGraph = await fetchRoadsData(depUser); 
        const mergedGraph = {
            type: "FeatureCollection",
            features: [...graph.features, ...secondGraph.features]
        }; // Each elements in secondGraph goes in graph
        graph = mergedGraph;
    }

    // 2. Algo :))))
}