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

async function streamToString(stream) {
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}
	return chunks.join("");
}

function toRad(degrees) {
	return degrees * (Math.PI / 180);
}

function distanceMeters([lat1, lng1], [lat2, lng2]) {
	// calcule de distance entre deux lat,long avec la formule de Haversine formula
	const EARTH_RADIUS_METERS = 6371000;

	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);

	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return EARTH_RADIUS_METERS * c;
}

module.exports = {
	isPointInPolygon,
	getBoundingBox,
	isPointInBox,
	streamToString,
	distanceMeters,
};
