const CLUSTER_SIZES = {
	SMALL: 30,
	MEDIUM: 40,
	LARGE: 50,
	XLARGE: 60,
};

const CLUSTER_THRESHOLD_ZOOM = 14;
const ZOOM_ON_CLUSTER_CLICK = 2;
const BOUNDS_PADDING = 0.2;

const CLUSTER_REFRESH_DELAY_MS = 100;

function createClusterMarker(lat, lng, count, map) {
	// on obtient une size par rapport au nombre d'élements dans le cluster
	const size = getClusterSize(count);

	// on crée l'élément
	const icon = L.divIcon({
		html: `<div class="cluster-marker" style="
			width: ${size}px;
			height: ${size}px;
			line-height: ${size}px;
			margin-top: -${size / 2}px;
			margin-left: -${size / 2}px;
		">${count}</div>`,
		className: "",
		iconSize: [size, size],
	});
	const marker = L.marker([lat, lng], { icon });

	// on bind l'event pour zoomer
	marker.on("click", () => {
		const newZoom = map.getZoom() + ZOOM_ON_CLUSTER_CLICK;
		map.setView([lat, lng], newZoom);
	});

	return marker;
}

function getClusterSize(count) {
	if (count > 1000) return CLUSTER_SIZES.XLARGE;
	if (count > 100) return CLUSTER_SIZES.LARGE;
	if (count > 10) return CLUSTER_SIZES.MEDIUM;
	return CLUSTER_SIZES.SMALL;
}

function generateClusterLayers(map, data) {
	// on récupère les propriétés de la carte
	const zoom = map.getZoom();
	const bounds = map.getBounds();
	const paddedBounds = bounds.pad(BOUNDS_PADDING);

	const gridSize = 30 / Math.pow(2, zoom);
	const clusters = new Map();
	const visibleFeatures = [];

	for (const feature of data.features) {
		const [lng, lat] = feature.geometry.coordinates;

		// si la feature est en dehors de la carte on skip
		if (
			lat < paddedBounds.getSouth() ||
			lat > paddedBounds.getNorth() ||
			lng < paddedBounds.getWest() ||
			lng > paddedBounds.getEast()
		) {
			continue;
		}

		// si on n'est pas en mode cluster, on ajoute simplement les features
		// pour qu'elles soient mises sur la carte
		if (zoom >= CLUSTER_THRESHOLD_ZOOM) {
			visibleFeatures.push({ type: "marker", feature, lat, lng });
			continue;
		}

		// sinon on créé des clusters en grille
		const gridX = Math.floor(lng / gridSize);
		const gridY = Math.floor(lat / gridSize);
		const key = `${gridX},${gridY}`;

		if (!clusters.has(key)) {
			clusters.set(key, {
				type: "cluster",
				latSum: 0,
				lngSum: 0,
				count: 0,
				features: [],
			});
		}

		const cluster = clusters.get(key);
		// on stocke les valeurs dans l'objet map pour plus tard
		cluster.count++;
		cluster.latSum += lat;
		cluster.lngSum += lng;
		cluster.features.push(feature);
	}

	const layers = [];

	if (zoom >= CLUSTER_THRESHOLD_ZOOM) {
		// dans le cas ou on affiche les markers on les ajoute au layer avec le bon marker
		visibleFeatures.forEach((item) => {
			const marker = L.marker([item.lat, item.lng], {
				icon: createIcon(item.feature),
			});
			marker.feature = item.feature;
			addEventOnPoint(item.feature, marker);
			item.feature._layer = marker;
			layers.push(marker);
		});
	} else {
		// dans le cas ou on affiche les clusters on les ajoute
		clusters.forEach((cluster) => {
			const lat = cluster.latSum / cluster.count;
			const lng = cluster.lngSum / cluster.count;
			const clusterMarker = createClusterMarker(lat, lng, cluster.count, map);
			layers.push(clusterMarker);
		});
	}

	return layers;
}

let globalDebounceTimer = null;

function updateClusterLayer(map, data) {
	// on utilise un debounce pour éviter de recalculer les clusters
	// trop fréquemment pendant le déplacement de la carte
	if (globalDebounceTimer) {
		clearTimeout(globalDebounceTimer);
	}

	globalDebounceTimer = setTimeout(() => {
		// on ne fait rien si on n'est pas en mode libre
		if (!globalFreeMode) return;

		// on s'assure que le layer group existe
		if (!globalGeoLayer) {
			globalGeoLayer = L.layerGroup().addTo(map);
		}

		// on vide complètement le layer group
		globalGeoLayer.clearLayers();

		// on génère les nouveaux layers (clusters ou markers) selon le zoom
		const newLayers = generateClusterLayers(map, data);

		// on ajoute tous les nouveaux layers à la carte
		newLayers.forEach((layer) => {
			globalGeoLayer.addLayer(layer);
		});
	}, CLUSTER_REFRESH_DELAY_MS);
}
