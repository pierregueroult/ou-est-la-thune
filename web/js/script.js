const CONSTANTS = {
	EARTH_RADIUS_METERS: 6371000,
	MAP_DEFAULTS: {
		ZOOM: 14,
	},
	TOP_CLOSEST_POINTS: 3,
	DISTANCE_THRESHOLDS: {
		KM_THRESHOLD: 1000,
	},
};

const URLS = {
	GEOJSON: "../data/osm-france-bank.geojson",
	TILE_LAYER: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
	MARKER_BANK: "../assets/images/marker-bank.png",
	MARKER_ATM: "../assets/images/marker-atm.png",
	MARKER_SHADOW: "../assets/images/marker-shadow.png",
};

// Variables globales pour gérer l'état de l'application
let globalUserPosition = null;
let globalRadiusMeters = 2000;
let globalGeoLayer = null;
let globalClosestCashPoints = [];
let globalFreeMode = false;
let globalMap = null;
let globalCircle = null;
let globalUserMarker = null;
let globalData = null;
let itineraryLayer = null;

function distanceMeters([lat1, lng1], [lat2, lng2]) {
	// calcule de distance entre deux lat,long avec la formule de Haversine formula

	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);

	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return CONSTANTS.EARTH_RADIUS_METERS * c;
}

function roundToTwoDecimals(number) {
	return Math.round(number * 100) / 100;
}

function roundToInteger(number) {
	return Math.round(number);
}

function toRad(x) {
	return (x * Math.PI) / 180;
}

function createPopupListItem(label, value) {
	if (!value) return null;

	// création d'un item pour la popup sur la carte
	const li = document.createElement("li");
	const strong = document.createElement("strong");
	strong.textContent = `${label}: `;
	li.appendChild(strong);
	li.appendChild(document.createTextNode(value));

	return li;
}

function addEventOnPoint(feature) {
	// on créer la pop up pour la feature données + on la bind au marker

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
	itineraryButton.addEventListener("click", async () => {
		itineraryLayer = await itineraryCalcul(
			globalUserPosition,
			feature.geometry.coordinates,
			globalMap,
		);
	});
	container.appendChild(itineraryButton);

	feature._layer.bindPopup(container);
}

function printClosestCashPoints(closestCashPoints) {
	const cards = document.getElementsByClassName("card-left");

	// on crée les éléments des trucs à proximité
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

function createTileLayer() {
	return L.tileLayer(URLS.TILE_LAYER, {
		maxZoom: 20,
	});
}

function createIcon(feature) {
	const iconUrl =
		feature.properties.type === "atm" ? URLS.MARKER_ATM : URLS.MARKER_BANK;

	return new L.Icon({
		iconUrl: iconUrl,
		shadowUrl: URLS.MARKER_SHADOW,
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowSize: [41, 41],
	});
}

function createUserMarker(userPosition) {
	return L.marker(userPosition);
}

async function fetchOutlinesDepartmentsData() {
	const response = await fetch("../data/departements-france.geojson");
	return await response.json();
}

async function fetchRoadsData(numDep) {
	const response = await fetch(
		"../data/roads/roads-france-" + numDep + ".geojson",
	);
	return await response.json();
}

function createCircle(userPosition, radiusMeters) {
	return L.circle(userPosition, {
		radius: radiusMeters,
		color: "#1b615a",
		fillOpacity: 0.1,
	});
}

async function fetchGeoData() {
	const response = await fetch(URLS.GEOJSON);
	return await response.json();
}

function createGeoLayer(data, userPosition, radiusMeters, freeMode = false) {
	// le geolayer qui limite avec la position seulement dans le mode normal
	if (freeMode) return null;

	return L.geoJSON(data, {
		filter: (feature) => {
			// on prend que les features qui sont à proximité
			const [lng, lat] = feature.geometry.coordinates;
			const distance = distanceMeters(userPosition, [lat, lng]);
			return distance <= radiusMeters;
		},
		pointToLayer: (feature, latlng) => {
			// petit icone sympa
			return L.marker(latlng, { icon: createIcon(feature) });
		},
		onEachFeature: (feature, layer) => {
			// on stocke la référence du layer sur la feature pour pouvoir l'utiliser plus tard
			feature._layer = layer;
			// on ajoute les events sur chaque point pour les modals
			addEventOnPoint(feature);
		},
	});
}

function defineClosestCashPoints(data, userPosition) {
	// on calcule les distances pour chaque feature
	const distances = data.features.map((feature) => {
		const [lng, lat] = feature.geometry.coordinates;
		const distance = distanceMeters(userPosition, [lat, lng]);
		return { feature, distance };
	});

	// on les trie + on prend les plus proches
	distances.sort((a, b) => a.distance - b.distance);
	return distances.slice(0, CONSTANTS.TOP_CLOSEST_POINTS);
}

function createMap(userPosition, layer) {
	return L.map("map", {
		center: userPosition,
		zoomControl: false,
		zoom: CONSTANTS.MAP_DEFAULTS.ZOOM,
		attributionControl: false,
		layers: [layer],
	});
}

async function updateUserLocation() {
	try {
		// on récupère la position et réinitialise le zoom
		const newPosition = await getLocation();
		globalMap.setView(newPosition, CONSTANTS.MAP_DEFAULTS.ZOOM);

		// on met à jour la position du marker + dans l'objet
		globalUserMarker.setLatLng(newPosition);
		globalUserPosition = newPosition;

		if (!globalFreeMode) {
			// si on n'est pas en mode free on met à jour le cercle
			globalCircle.setLatLng(newPosition);

			// on retire l'ancien layer
			if (globalGeoLayer) {
				globalMap.removeLayer(globalGeoLayer);
			}

			// on recrée le geolayer avec la nouvelle position
			const newGeoLayer = createGeoLayer(
				globalData,
				newPosition,
				globalRadiusMeters,
				false,
			);
			newGeoLayer.addTo(globalMap);
			globalGeoLayer = newGeoLayer;

			// la position de l'utilisateur a changé, on recalcule les distributeurs les plus proches
			globalClosestCashPoints = defineClosestCashPoints(
				globalData,
				newPosition,
			);
			printClosestCashPoints(globalClosestCashPoints);
		}

		return newPosition;
	} catch (error) {
		console.error("Error updating user location:", error);
		alert("Impossible de récupérer votre nouvelle position.");
		throw error;
	}
}

function setupLocateButton() {
	const locateButton = document.getElementById("locate");
	locateButton.addEventListener("click", async () => {
		await updateUserLocation();
	});
}

function setupZoomControls() {
	document.getElementById("zoom-in").addEventListener("click", () => {
		globalMap.zoomIn();
	});

	document.getElementById("zoom-out").addEventListener("click", () => {
		globalMap.zoomOut();
	});
}

function setupClickOnClosestCashPoints(closestCashPoints) {
	const cards = document.getElementsByClassName("card-left");

	for (let i = 0; i < closestCashPoints.length; i++) {
		const card = cards[i];
		const cashPoint = closestCashPoints[i];
		const { feature } = cashPoint;

		// quand on clique sur la card, on reset le zoom + on ouvre la popup
		card.addEventListener("click", () => {
			const [lng, lat] = feature.geometry.coordinates;

			// on attend la fin du mouvement pour ouvrir la popup
			globalMap.once("moveend", () => {
				feature._layer.openPopup();
			});

			globalMap.setView([lat, lng], 18);
		});
	}
}

function setupModeSwitch() {
	const modeSwitch = document.getElementById("mode");

	const toggleMode = () => {
		const isChecked = modeSwitch.getAttribute("aria-checked") === "true";
		const newState = !isChecked;

		modeSwitch.setAttribute("aria-checked", newState);
		globalFreeMode = newState;

		// on retire le layer présent (outdated)
		if (globalGeoLayer) {
			globalMap.removeLayer(globalGeoLayer);
			globalGeoLayer = null;
		}

		if (globalFreeMode) {
			// si on passe en freemode alors on retire le cercle du mode normal
			if (globalCircle) globalMap.removeLayer(globalCircle);

			// on crée un layer vide pour le remplir après
			globalGeoLayer = L.layerGroup().addTo(globalMap);
			updateClusterLayer(globalMap, globalData);
		} else {
			// en mode normal on remet le cercle sur la carte
			if (globalCircle) globalCircle.addTo(globalMap);

			// on recrée le geolayer principal avec seulement les éléments dans le rayon
			const newGeoLayer = createGeoLayer(
				globalData,
				globalUserPosition,
				globalRadiusMeters,
				false,
			);

			// on l'ajoute à la carte
			newGeoLayer.addTo(globalMap);
			globalGeoLayer = newGeoLayer;
		}
	};

	modeSwitch.addEventListener("click", toggleMode);
}

function setupRadiusControl() {
	const radius = document.getElementById("selected_radius");

	radius.addEventListener("change", () => {
		// quand on change le radius on change le radius dans la variable globale
		globalRadiusMeters = radius.value;

		// si on est dans le mode normal
		if (!globalFreeMode) {
			if (globalGeoLayer) {
				globalMap.removeLayer(globalGeoLayer);
			}

			// on recrée le geolayer avec le nouveau rayon
			const newGeoLayer = createGeoLayer(
				globalData,
				globalUserPosition,
				globalRadiusMeters,
				false,
			);

			newGeoLayer.addTo(globalMap);
			globalGeoLayer = newGeoLayer;
			globalCircle.setRadius(globalRadiusMeters);
		}
	});
}

function setupMapEvents() {
	const onMove = () => {
		if (globalFreeMode) {
			// en mode libre on met à jour les clusters à chaque fois
			// ou alors les markers affichés
			updateClusterLayer(globalMap, globalData);
		}
	};

	globalMap.on("moveend", onMove);
	globalMap.on("zoomend", onMove);
}

window.onload = async () => {
	globalRadiusMeters = document.getElementById("selected_radius").value;

	const tiles = createTileLayer();
	globalData = await fetchGeoData();
	globalUserPosition = await getLocation();

	globalMap = createMap(globalUserPosition, tiles);

	globalGeoLayer = createGeoLayer(
		globalData,
		globalUserPosition,
		globalRadiusMeters,
		false,
	);
	globalGeoLayer.addTo(globalMap);

	globalCircle = createCircle(globalUserPosition, globalRadiusMeters);
	globalCircle.addTo(globalMap);

	globalUserMarker = createUserMarker(globalUserPosition);
	globalUserMarker.addTo(globalMap);

	globalClosestCashPoints = defineClosestCashPoints(
		globalData,
		globalUserPosition,
	);
	printClosestCashPoints(globalClosestCashPoints);

	setupLocateButton();
	setupZoomControls();
	setupRadiusControl();
	setupClickOnClosestCashPoints(globalClosestCashPoints);
	setupModeSwitch();
	setupMapEvents();
};
