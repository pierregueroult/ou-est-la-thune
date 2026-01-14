function isPointInPolygon([px, py], vertices) {
  let isInside = false;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];

    // Vérifie si le point est entre les deux ordonnées (y) du segment
    const isBetweenY = yi > py !== yj > py;

    // Calcule l'intersection sur l'axe X (Théorème de Thalès / Equation de droite)
    const intersectX = ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (isBetweenY && px < intersectX) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function getBoundingBox(coords) {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  // On aplatit jusqu'à obtenir une liste de points [x, y]
  // .flat(coords[0][0][0] ? 2 : 1) permet de gérer Polygon et MultiPolygon
  // sans tout casser en une liste de nombres simples.
  const points = coords.flat(Infinity);

  // On itère par paires de coordonnées
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return [minX, minY, maxX, maxY];
}

function isPointInBox(point, bbox) {
  return (
    point[0] >= bbox[0] &&
    point[0] <= bbox[2] &&
    point[1] >= bbox[1] &&
    point[1] <= bbox[3]
  );
}

module.exports = { isPointInPolygon, getBoundingBox, isPointInBox };
