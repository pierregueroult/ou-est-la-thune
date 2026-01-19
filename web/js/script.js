const CONSTANTS = {
	EARTH_RADIUS_METERS: 6371000,
	CLUSTER_THRESHOLD_ZOOM: 14,
	CLUSTER_SIZES: {
		SMALL: 30,
		MEDIUM: 40,
		LARGE: 50,
		XLARGE: 60,
	},
	MAP_DEFAULTS: {
		ZOOM: 14,
		ZOOM_ON_CLUSTER_CLICK: 2,
		BOUNDS_PADDING: 0.2,
	},
	DEBOUNCE_DELAY_MS: 100,
	TOP_CLOSEST_POINTS: 3,
	DISTANCE_THRESHOLDS: {
		KM_THRESHOLD: 1000,
	},
};

const URLS = {
	GEOJSON: "../data/osm-france-bank.geojson",
	TILE_LAYER: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
	MARKER_ICON: "../assets/images/marker-icon-2x-red.png",
	MARKER_SHADOW: "../assets/images/marker-shadow.png",
};

/**
 * Calculates the distance between two geographic coordinates using the Haversine formula
 */
function distanceMeters([lat1, lng1], [lat2, lng2]) {
	const toRad = (x) => (x * Math.PI) / 180;

	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);

	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return CONSTANTS.EARTH_RADIUS_METERS * c;
}

/**
 * Rounds a number to 2 decimal places
 */
function roundToTwoDecimals(number) {
	return Math.round(number * 100) / 100;
}

/**
 * Rounds a number to the nearest integer
 */
function roundToInteger(number) {
	return Math.round(number);
}

/**
 * Creates a list item for the popup
 */
function createPopupListItem(label, value) {
	if (!value) return null;

	const li = document.createElement("li");
	const strong = document.createElement("strong");
	strong.textContent = `${label}: `;
	li.appendChild(strong);
	li.appendChild(document.createTextNode(value));

	return li;
}

/**
 * Binds a popup with bank information to a map layer
 */
function addEventOnPoint(feature, layer) {
	const p = feature.properties;
	const container = document.createElement("div");
	container.className = "bank-popup";

	if (p.image) {
		const img = document.createElement("img");
		img.src = p.image;
		img.alt = p.brand || p.name || "Image de la banque";
		img.className = "bank-popup-image";
		container.appendChild(img);
	}

	if (p.brand || p.name) {
		const title = document.createElement("h3");
		title.textContent = p.brand || p.name;
		container.appendChild(title);
	}

	const list = document.createElement("ul");
	list.className = "bank-details";

	const items = [
		["Type", p.type],
		["Opérateur", p.operator],
		["Accessibilité", p.wheelchair],
		["Horaires", p.opening_hours],
	];

	items.forEach(([label, value]) => {
		const item = createPopupListItem(label, value);
		if (item) list.appendChild(item);
	});

	const locationParts = [p.meta_name_com, p.meta_name_dep].filter(Boolean);
	if (locationParts.length > 0) {
		const locationItem = createPopupListItem("Lieu", locationParts.join(", "));
		if (locationItem) list.appendChild(locationItem);
	}

	if (p.meta_osm_url) {
		const li = document.createElement("li");
		const link = document.createElement("a");
		link.href = p.meta_osm_url;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		link.textContent = "Voir sur OpenStreetMap";
		li.appendChild(link);
		list.appendChild(li);
	}

	container.appendChild(list);

	const itineraryButton = document.createElement("button");
	itineraryButton.className = "distance-badge";
	itineraryButton.textContent = "Lancer l'itinéraire";
	container.appendChild(itineraryButton);

	layer.bindPopup(container);
}

/**
 * Prints the closest cash points in the UI cards
 */
function printClosestCashPoints(closestCashPoints) {
	const cards = document.getElementsByClassName("card-left");

	for (let i = 0; i < closestCashPoints.length; i++) {
		if (!cards[i]) continue;

		const card = cards[i];
		const cashPoint = closestCashPoints[i];
		const { feature, distance } = cashPoint;

		const nameEl = card.getElementsByClassName("bank-name")[0];
		const cityEl = card.getElementsByClassName("bank-city")[0];
		const badgeEl = card.getElementsByClassName("distance-badge")[0];

		if (nameEl) {
			nameEl.textContent = feature.properties.brand || "Distributeur";
		}

		if (cityEl) {
			cityEl.textContent = feature.properties.meta_name_com || "";
		}

		if (badgeEl) {
			if (distance >= CONSTANTS.DISTANCE_THRESHOLDS.KM_THRESHOLD) {
				badgeEl.textContent = `${roundToTwoDecimals(distance / 1000)}km`;
			} else {
				badgeEl.textContent = `${roundToInteger(distance)}m`;
			}
		}
	}
}

/**
 * Creates the tile layer for the map
 */
function createTileLayer() {
	return L.tileLayer(URLS.TILE_LAYER, {
		maxZoom: 20,
	});
}

/**
 * Creates a Leaflet map centered on the user position
 */
function createMap(userPosition) {
	return L.map("map", {
		center: userPosition,
		zoomControl: false,
		zoom: CONSTANTS.MAP_DEFAULTS.ZOOM,
		attributonControl: false,
	});
}

/**
 * Creates a red marker icon
 */
function createRedIcon() {
	return new L.Icon({
		iconUrl: URLS.MARKER_ICON,
		shadowUrl: URLS.MARKER_SHADOW,
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowSize: [41, 41],
	});
}

/**
 * Creates a marker for the user's position
 */
function createUserMarker(userPosition, icon) {
	return L.marker(userPosition, { icon });
}

/**
 * Creates a circle representing the search radius
 */
function createCircle(userPosition, radiusMeters) {
	return L.circle(userPosition, {
		radius: radiusMeters,
		color: "blue",
		fillOpacity: 0.1,
	});
}

/**
 * Determines the cluster marker size based on point count
 */
function getClusterSize(count) {
	if (count > 1000) return CONSTANTS.CLUSTER_SIZES.XLARGE;
	if (count > 100) return CONSTANTS.CLUSTER_SIZES.LARGE;
	if (count > 10) return CONSTANTS.CLUSTER_SIZES.MEDIUM;
	return CONSTANTS.CLUSTER_SIZES.SMALL;
}

/**
 * Creates a cluster marker
 */
function createClusterMarker(lat, lng, count, map) {
	const size = getClusterSize(count);

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

	marker.on("click", () => {
		const newZoom =
			map.getZoom() + CONSTANTS.MAP_DEFAULTS.ZOOM_ON_CLUSTER_CLICK;
		map.setView([lat, lng], newZoom);
	});

	return marker;
}

/**
 * Generates cluster layers based on current map view and zoom level
 */
function generateClusterLayers(map, data) {
	if (!map || !data) return [];

	const zoom = map.getZoom();
	const bounds = map.getBounds();
	const paddedBounds = bounds.pad(CONSTANTS.MAP_DEFAULTS.BOUNDS_PADDING);

	const gridSize = 30 / Math.pow(2, zoom);
	const clusters = new Map();
	const visibleFeatures = [];

	for (const feature of data.features) {
		const [lng, lat] = feature.geometry.coordinates;

		if (
			lat < paddedBounds.getSouth() ||
			lat > paddedBounds.getNorth() ||
			lng < paddedBounds.getWest() ||
			lng > paddedBounds.getEast()
		) {
			continue;
		}

		if (zoom >= CONSTANTS.CLUSTER_THRESHOLD_ZOOM) {
			visibleFeatures.push({ type: "marker", feature, lat, lng });
			continue;
		}

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
		cluster.count++;
		cluster.latSum += lat;
		cluster.lngSum += lng;
		cluster.features.push(feature);
	}

	// Generate layers
	const layers = [];

	if (zoom >= CONSTANTS.CLUSTER_THRESHOLD_ZOOM) {
		visibleFeatures.forEach((item) => {
			const marker = L.marker([item.lat, item.lng], {
				icon: createRedIcon(),
			});
			addEventOnPoint(item.feature, marker);
			item.feature._layer = marker;
			layers.push(marker);
		});
	} else {
		clusters.forEach((cluster) => {
			const lat = cluster.latSum / cluster.count;
			const lng = cluster.lngSum / cluster.count;
			const clusterMarker = createClusterMarker(lat, lng, cluster.count, map);
			layers.push(clusterMarker);
		});
	}

	return layers;
}

/**
 * Updates the cluster layer after a debounce delay
 */
function updateClusterLayer(map, data, state) {
	if (state.debounceTimer) {
		clearTimeout(state.debounceTimer);
	}

	state.debounceTimer = setTimeout(() => {
		if (!state.freeMode) return;

		if (!state.geoLayer || !state.geoLayer.clearLayers) {
			state.geoLayer = L.layerGroup().addTo(map);
		} else {
			state.geoLayer.clearLayers();
		}

		const newLayers = generateClusterLayers(map, data);
		newLayers.forEach((layer) => layer.addTo(state.geoLayer));
	}, CONSTANTS.DEBOUNCE_DELAY_MS);
}

/**
 * Fetches the GeoJSON data from the server
 */
async function fetchGeoData() {
	const response = await fetch(URLS.GEOJSON);
	return await response.json();
}

/**
 * Creates a GeoJSON layer filtered by radius (normal mode only)
 */
function createGeoLayer(data, userPosition, radiusMeters, freeMode = false) {
	if (freeMode) return null;

	return L.geoJSON(data, {
		filter: (feature) => {
			const [lng, lat] = feature.geometry.coordinates;
			const distance = distanceMeters(userPosition, [lat, lng]);
			return distance <= radiusMeters;
		},
		pointToLayer: (_feature, latlng) => {
			return L.marker(latlng, { icon: createRedIcon() });
		},
		onEachFeature: (feature, layer) => {
			addEventOnPoint(feature, layer);
			feature._layer = layer;
		},
	});
}

/**
 * Finds the closest cash points to the user
 */
function defineClosestCashPoints(data, userPosition) {
	const distances = data.features.map((feature) => {
		const [lng, lat] = feature.geometry.coordinates;
		const distance = distanceMeters(userPosition, [lat, lng]);
		return { feature, distance };
	});

	distances.sort((a, b) => a.distance - b.distance);
	return distances.slice(0, CONSTANTS.TOP_CLOSEST_POINTS);
}

/**
 * Updates the user's location and refreshes the map
 */
async function updateUserLocation(map, circle, userMarker, data, state) {
	try {
		const newPosition = await getLocation();
		map.setView(newPosition, CONSTANTS.MAP_DEFAULTS.ZOOM);

		userMarker.setLatLng(newPosition);
		state.userPosition = newPosition;

		if (!state.freeMode) {
			circle.setLatLng(newPosition);
			map.removeLayer(state.geoLayer);

			const newGeoLayer = createGeoLayer(data, newPosition, state.radiusMeters);
			newGeoLayer.addTo(map);
			state.geoLayer = newGeoLayer;

			state.closestCashPoints = defineClosestCashPoints(data, newPosition);
			printClosestCashPoints(state.closestCashPoints);
		}

		return newPosition;
	} catch (error) {
		console.error("Error updating user location:", error);
		alert("Impossible de récupérer votre nouvelle position.");
		throw error;
	}
}

/**
 * Sets up the locate button event listener
 */
function setupLocateButton(map, circle, userMarker, data, state) {
	const locateButton = document.getElementById("locate");
	locateButton.addEventListener("click", async () => {
		await updateUserLocation(map, circle, userMarker, data, state);
	});
}

/**
 * Sets up zoom control button event listeners
 */
function setupZoomControls(map) {
	document.getElementById("zoom-in").addEventListener("click", () => {
		map.zoomIn();
	});

	document.getElementById("zoom-out").addEventListener("click", () => {
		map.zoomOut();
	});
}

/**
 * Sets up click events on closest cash point cards
 */
function setupClickOnClosestCashPoints(closestCashPoints, map) {
	const cards = document.getElementsByClassName("card-left");

	for (let i = 0; i < closestCashPoints.length; i++) {
		const card = cards[i];
		const cashPoint = closestCashPoints[i];
		const { feature } = cashPoint;

		card.addEventListener("click", () => {
			const [lng, lat] = feature.geometry.coordinates;
			map.setView([lat, lng], 16);

			if (feature._layer && map.hasLayer(feature._layer)) {
				feature._layer.openPopup();
			}
		});
	}
}

/**
 * Sets up the mode switch toggle between normal and free mode
 */
function setupModeSwitch(map, data, state, circle) {
	const modeSwitch = document.getElementById("mode");

	const toggleMode = () => {
		const isChecked = modeSwitch.getAttribute("aria-checked") === "true";
		const newState = !isChecked;

		modeSwitch.setAttribute("aria-checked", newState);
		state.freeMode = newState;

		if (state.geoLayer) {
			map.removeLayer(state.geoLayer);
			state.geoLayer = null;
		}

		if (state.freeMode) {
			if (circle) map.removeLayer(circle);

			state.geoLayer = L.layerGroup().addTo(map);
			updateClusterLayer(map, data, state);
		} else {
			if (circle) circle.addTo(map);

			const newGeoLayer = createGeoLayer(
				data,
				state.userPosition,
				state.radiusMeters,
				false,
			);
			newGeoLayer.addTo(map);
			state.geoLayer = newGeoLayer;
		}
	};

	modeSwitch.addEventListener("click", toggleMode);
}

/**
 * Sets up the radius control event listener
 */
function setupRadiusControl(map, circle, data, state) {
	const radius = document.getElementById("selected_radius");

	radius.addEventListener("change", () => {
		const newRadiusMeters = parseInt(radius.value, 10);
		state.radiusMeters = newRadiusMeters;

		if (!state.freeMode) {
			map.removeLayer(state.geoLayer);

			const newGeoLayer = createGeoLayer(
				data,
				state.userPosition,
				newRadiusMeters,
			);
			newGeoLayer.addTo(map);
			state.geoLayer = newGeoLayer;
			circle.setRadius(newRadiusMeters);
		}
	});
}

/**
 * Sets up map event listeners for move and zoom
 */
function setupMapEvents(map, data, state) {
	const onMove = () => {
		if (state.freeMode) {
			updateClusterLayer(map, data, state);
		}
	};

	map.on("moveend", onMove);
	map.on("zoomend", onMove);
}

/**
 * Initializes the application when the page loads
 */
window.onload = async () => {
	const radiusMeters = parseInt(
		document.getElementById("selected_radius").value,
		10,
	);

	const tiles = createTileLayer();
	const data = await fetchGeoData();
	const userPosition = await getLocation();

	const map = createMap(userPosition);
	tiles.addTo(map);

	const geoLayer = createGeoLayer(data, userPosition, radiusMeters);
	geoLayer.addTo(map);

	const circle = createCircle(userPosition, radiusMeters);
	circle.addTo(map);

	const icon = createRedIcon();
	const userMarker = createUserMarker(userPosition, icon);
	userMarker.addTo(map);

	const closestCashPoints = defineClosestCashPoints(data, userPosition);
	printClosestCashPoints(closestCashPoints);

	const state = {
		userPosition,
		radiusMeters,
		geoLayer,
		closestCashPoints,
		freeMode: false,
		debounceTimer: null,
	};

	setupLocateButton(map, circle, userMarker, data, state);
	setupZoomControls(map);
	setupRadiusControl(map, circle, data, state);
	setupClickOnClosestCashPoints(closestCashPoints, map);
	setupModeSwitch(map, data, state, circle);
	setupMapEvents(map, data, state);
};
