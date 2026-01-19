/* Define the distance between 2 coords (crow fly)
	HAVERSINE FORMULA */
function distanceMeters([lat1, lng1], [lat2, lng2]) {
	const R = 6371000; // Earth radius (rayon)
	const toRad = (x) => (x * Math.PI) / 180;

	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);

	const distanceHaversineFormula =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

	const distance =
		2 *
		Math.atan2(
			Math.sqrt(distanceHaversineFormula),
			Math.sqrt(1 - distanceHaversineFormula),
		);
	return R * distance;
}

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

	const addListItem = (label, value) => {
		if (!value) return;
		const li = document.createElement("li");
		const strong = document.createElement("strong");
		strong.textContent = `${label}: `;
		li.appendChild(strong);
		li.appendChild(document.createTextNode(value));
		list.appendChild(li);
	};

	addListItem("Type", p.type);
	addListItem("Opérateur", p.operator);
	addListItem("Accessibilité", p.wheelchair);
	addListItem("Horaires", p.opening_hours);

	// Address/Location
	const locationParts = [p.meta_name_com, p.meta_name_dep].filter(Boolean);
	if (locationParts.length > 0) {
		addListItem("Lieu", locationParts.join(", "));
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
	itineraryButton.textContent = "Lancer l'initéraire";
	container.appendChild(itineraryButton);

	layer.bindPopup(container);
}

function createTileLayer() {
	return L.tileLayer(
		"https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
		{
			maxZoom: 20,
		},
	);
}

async function fetchGeoData() {
	const response = await fetch("../data/osm-france-bank.geojson");
	return await response.json();
}

// ----------------------------------------------------
// SYSTEME DE CLUSTERING OPTIMISÉ (Grid-Based + Viewport Filter)
// ----------------------------------------------------

const ClusterSystem = {
	layerGroup: null,
	debounceTimer: null,

	init(map) {
		this.layerGroup = L.layerGroup().addTo(map);
	},

	clear() {
		if (this.layerGroup) {
			this.layerGroup.clearLayers();
		}
	},

	update(map, data) {
		// Debounce to prevent lag during rapid movement
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			this._performUpdate(map, data);
		}, 100);
	},

	_performUpdate(map, data) {
		if (!map || !data) return;

		this.clear();
		const zoom = map.getZoom();
		const bounds = map.getBounds();

		// Configuration
		const CLUSTER_THRESHOLD_ZOOM = 14; // Zoom level where we stop clustering
		// Grid size in degrees. Decreases as we zoom in.
		// At zoom 10, approx 0.05 deg. At zoom 15, approx 0.002 deg.
		const gridSize = 30 / Math.pow(2, zoom);

		const clusters = new Map();
		const visibleFeatures = [];

		// 1. FILTER: Only process features inside the viewport (plus padding)
		// Buffering bounds to avoid "popping" at edges
		const paddedBounds = bounds.pad(0.2);

		for (const feature of data.features) {
			const [lng, lat] = feature.geometry.coordinates;

			// Quick bound check before anything else
			if (lat < paddedBounds.getSouth() || lat > paddedBounds.getNorth() ||
				lng < paddedBounds.getWest() || lng > paddedBounds.getEast()) {
				continue;
			}

			// If zoomed in enough, we don't cluster, we just list features
			if (zoom >= CLUSTER_THRESHOLD_ZOOM) {
				visibleFeatures.push({ type: 'marker', feature, lat, lng });
				continue;
			}

			// 2. CLUSTER: Group by Grid
			// Simple grid hashing
			const gridX = Math.floor(lng / gridSize);
			const gridY = Math.floor(lat / gridSize);
			const key = `${gridX},${gridY}`;

			if (!clusters.has(key)) {
				clusters.set(key, {
					type: 'cluster',
					latSum: 0,
					lngSum: 0,
					count: 0,
					features: []
				});
			}

			const cluster = clusters.get(key);
			cluster.count++;
			cluster.latSum += lat;
			cluster.lngSum += lng;
			cluster.features.push(feature);
		}

		// 3. RENDER
		const layersToAdd = [];

		// Render individual markers (High Zoom)
		if (zoom >= CLUSTER_THRESHOLD_ZOOM) {
			visibleFeatures.forEach(item => {
				const marker = L.marker([item.lat, item.lng], {
					icon: createRedIcon() // Re-use standard icon
				});
				addEventOnPoint(item.feature, marker);
				item.feature._layer = marker; // Link for external access
				layersToAdd.push(marker);
			});
		}
		// Render Clusters (Low Zoom)
		else {
			clusters.forEach((cluster) => {
				// Calculate centroid
				const lat = cluster.latSum / cluster.count;
				const lng = cluster.lngSum / cluster.count;

				// Always Render as Cluster, even if count is 1
				const clusterMarker = this._createClusterMarker(lat, lng, cluster.count, map);
				layersToAdd.push(clusterMarker);
			});
		}

		// Bulk add for performance
		this.layerGroup = L.layerGroup(layersToAdd).addTo(map);
	},

	_createClusterMarker(lat, lng, count, map) {
		// Dynamic size based on count
		let size = 30;
		if (count > 10) size = 40;
		if (count > 100) size = 50;
		if (count > 1000) size = 60;

		const icon = L.divIcon({
			html: `<div class="cluster-marker" style="
				width: ${size}px; 
				height: ${size}px;
				line-height: ${size}px;
				margin-top: -${size / 2}px;
				margin-left: -${size / 2}px;
			">${count}</div>`,
			className: '', // disable default leaflet styles
			iconSize: [size, size]
		});

		const marker = L.marker([lat, lng], { icon });

		marker.on('click', () => {
			map.setView([lat, lng], map.getZoom() + 2);
		});

		return marker;
	}
};

// ----------------------------------------------------
// STANDARD LAYERS (For Normal Mode)
// ----------------------------------------------------

function createGeoLayer(data, userPosition, radiusMeters, freeMode = false) {
	// In Free Mode we use ClusterSystem now, checking just in case
	if (freeMode) return null;

	return L.geoJSON(data, {
		filter: (feature) => {
			const [lng, lat] = feature.geometry.coordinates;
			const distance = distanceMeters(userPosition, [lat, lng]);
			return distance <= radiusMeters;
		},
		pointToLayer: (feature, latlng) => {
			return L.marker(latlng, { icon: createRedIcon() });
		},
		onEachFeature: (feature, layer) => {
			addEventOnPoint(feature, layer);
			feature._layer = layer;
		},
	});
}

function createCircle(userPosition, radiusMeters) {
	return L.circle(userPosition, {
		radius: radiusMeters,
		color: "blue",
		fillOpacity: 0.1,
	});
}

function createRedIcon() {
	return new L.Icon({
		iconUrl: "../assets/images/marker-icon-2x-red.png",
		shadowUrl: "../assets/images/marker-shadow.png",
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowSize: [41, 41],
	});
}

function createUserMarker(userPosition, icon) {
	return L.marker(userPosition, {
		icon: icon,
	});
}

// ----------------------------------------------------
// INIT & LOGIC
// ----------------------------------------------------

function createMap(userPosition) {
	return L.map("map", {
		center: userPosition,
		zoomControl: false,
		zoom: 14,
		attributonControl: false,
		// No initial layers, added dynamically
	});
}

async function updateUserLocation(map, circle, userMarker, data, state) {
	try {
		const newPosition = await getLocation();
		map.setView(newPosition, 14);

		userMarker.setLatLng(newPosition);
		state.userPosition = newPosition;

		// Update logic depending on mode
		if (!state.freeMode) {
			circle.setLatLng(newPosition);
			map.removeLayer(state.geoLayer);

			const newGeoLayer = createGeoLayer(data, newPosition, state.radiusMeters);
			newGeoLayer.addTo(map);
			state.geoLayer = newGeoLayer;

			// Recalculate closest points only in normal mode usually, 
			// but we can do it in both if we want "closest to me" always visible
			state.closestCashPoints = defineClosestCashPoints(data, newPosition);
			printClosestCashPoints(state.closestCashPoints);
		}

		return newPosition;
	} catch (error) {
		console.error(error);
		alert("Impossible de récupérer votre nouvelle position.");
	}
}

function setupLocateButton(map, circle, userMarker, data, state) {
	const locateButton = document.getElementById("locate");
	locateButton.addEventListener("click", async () => {
		await updateUserLocation(map, circle, userMarker, data, state);
	});
}

function setupZoomControls(map) {
	document.getElementById("zoom-in").addEventListener("click", () => {
		map.zoomIn();
	});

	document.getElementById("zoom-out").addEventListener("click", () => {
		map.zoomOut();
	});
}

function setupClicOnClosestCashPoints(closestCashPoints, map) {
	const cards = document.getElementsByClassName("card-left");
	// Note: this logic might need refreshing if closest points change often
	// For now kept simple as per original
	for (let i = 0; i < closestCashPoints.length; i++) {
		const card = cards[i];
		const cashPoint = closestCashPoints[i];
		const feature = cashPoint.feature;

		card.addEventListener("click", () => {
			const [lng, lat] = feature.geometry.coordinates;
			map.setView([lat, lng], 16);
			// Must handle popup opening carefully if layer is not on map (e.g. cluster mode)
			// But for "closest" they are usually close enough to be rendered.
			if (feature._layer && map.hasLayer(feature._layer)) {
				feature._layer.openPopup();
			}
		});
	}
}

function setupModeSwitch(map, data, state, circle) {
	const modeSwitch = document.getElementById("mode");

	const toggleMode = () => {
		const isChecked = modeSwitch.getAttribute("aria-checked") === "true";
		const newState = !isChecked; // Toggle

		modeSwitch.setAttribute("aria-checked", newState);
		state.freeMode = newState;

		// 1. Cleanup Old State
		if (state.geoLayer) {
			map.removeLayer(state.geoLayer);
			state.geoLayer = null;
		}
		ClusterSystem.clear();

		// 2. Apply New State
		if (state.freeMode) {
			// FREE MODE
			if (circle) map.removeLayer(circle);

			// Initial Cluster Render
			ClusterSystem.init(map);
			ClusterSystem.update(map, data);

		} else {
			// NORMAL MODE
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

function setupRadiusControl(map, circle, data, state) {
	const radius = document.getElementById("selected_radius");
	radius.addEventListener("change", () => {
		const newRadiusMeters = parseInt(radius.value, 10);
		state.radiusMeters = newRadiusMeters;

		if (!state.freeMode) {
			map.removeLayer(state.geoLayer);
			const newGeoLayer = createGeoLayer(data, state.userPosition, newRadiusMeters);
			newGeoLayer.addTo(map);
			state.geoLayer = newGeoLayer;
			circle.setRadius(newRadiusMeters);

			// We might want to re-calc closest points here too if logic depends on radius 
			// (usually closest is absolute distance, but filtering hides them)
		}
	});
}

function setupMapEvents(map, data, state) {
	const onMove = () => {
		if (state.freeMode) {
			ClusterSystem.update(map, data);
		}
	};

	map.on("moveend", onMove);
	map.on("zoomend", onMove);
}

// Define the 3 closest cash points from user's position
function defineClosestCashPoints(data, userPosition) {
	const distances = data.features.map((feature) => {
		const [lng, lat] = feature.geometry.coordinates;
		const distance = distanceMeters(userPosition, [lat, lng]);
		return { feature, distance };
	});

	distances.sort((a, b) => a.distance - b.distance);
	return distances.slice(0, 3);
}

function roundNumberDecimalPoint(number) {
	return Math.round(number * 100) / 100;
}

function roundNumber(number) {
	return Math.round(number);
}

function printClosestCashPoints(closestCashPoints) {
	const cards = document.getElementsByClassName("card-left");

	for (let i = 0; i < closestCashPoints.length; i++) {
		if (!cards[i]) continue;
		const card = cards[i];
		const cashPoint = closestCashPoints[i];

		const nameEl = card.getElementsByClassName("bank-name")[0];
		const cityEl = card.getElementsByClassName("bank-city")[0];
		const badgeEl = card.getElementsByClassName("distance-badge")[0];

		if (nameEl) nameEl.textContent = cashPoint.feature.properties.brand || "Distributeur";
		if (cityEl) cityEl.textContent = cashPoint.feature.properties.meta_name_com || "";

		if (badgeEl) {
			if (cashPoint.distance >= 1000) {
				badgeEl.textContent = roundNumberDecimalPoint(cashPoint.distance / 1000) + "km";
			} else {
				badgeEl.textContent = roundNumber(cashPoint.distance) + "m";
			}
		}
	}
}

window.onload = async () => {
	const radiusMeters = parseInt(document.getElementById("selected_radius").value, 10);

	const tiles = createTileLayer();
	const data = await fetchGeoData();
	const userPosition = await getLocation();

	const map = createMap(userPosition);
	tiles.addTo(map);

	// Setup Initial State (Normal Mode)
	const geoLayer = createGeoLayer(data, userPosition, radiusMeters);
	geoLayer.addTo(map);

	const circle = createCircle(userPosition, radiusMeters);
	circle.addTo(map);

	const icon = createRedIcon();
	const userMarker = createUserMarker(userPosition, icon);
	userMarker.addTo(map);

	let closestCashPoints = defineClosestCashPoints(data, userPosition);
	printClosestCashPoints(closestCashPoints);

	const state = {
		userPosition: userPosition,
		radiusMeters: radiusMeters,
		geoLayer: geoLayer,
		closestCashPoints: closestCashPoints,
		freeMode: false,
	};

	setupLocateButton(map, circle, userMarker, data, state);
	setupZoomControls(map);
	setupRadiusControl(map, circle, data, state);
	setupClicOnClosestCashPoints(closestCashPoints, map);
	setupModeSwitch(map, data, state, circle);
	setupMapEvents(map, data, state);
};
