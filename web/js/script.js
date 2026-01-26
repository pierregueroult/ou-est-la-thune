const CONSTANTS = {
	EARTH_RADIUS_METERS: 6371000,
	MAP_DEFAULTS: {
		ZOOM: 14,
	},
	TOP_CLOSEST_POINTS: 3,
	DISTANCE_THRESHOLDS: {
		KM_THRESHOLD: 1000,
	},
	DEBOUNCE_DELAY_MS: 500,
	POSITION_UPDATE_INTERVAL_MS: 30000,
	POSITION_UPDATE_THRESHOLD_METERS: 0,
};

const URLS = {
	GEOJSON: "../data/osm-france-bank.geojson",
	TILE_LAYER: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
	MARKER_BANK: "../assets/images/marker-bank.png",
	MARKER_ATM: "../assets/images/marker-atm.png",
	MARKER_SHADOW: "../assets/images/marker-shadow.png",
	MARKER_USER: "../assets/images/marker-user.png",
};

// Variables globales pour gérer l'état de l'application
let globalUserPosition = null;
let globalRadiusMeters = 2000;
let globalGeoLayer = null;
let globalClosestCashPoints = [];
let globalMap = null;
let globalCircle = null;
let globalUserMarker = null;
let globalData = null;
let globalItineraryLayer = null;
let globalItineraryTarget = null;
let globalDestinationMarker = null;

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

function debounce(func, delay) {
	let timeoutId;
	return function (...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func.apply(this, args), delay);
	};
}

function formatRadiusDisplay(meters) {
	if (meters >= CONSTANTS.DISTANCE_THRESHOLDS.KM_THRESHOLD) {
		const km = meters / 1000;
		return km % 1 === 0 ? `${km}km` : `${km.toFixed(1)}km`;
	}
	return `${meters}m`;
}

function translateType(type) {
	const types = {
		bank: "Banque",
		atm: "Distributeur Automatique",
	};
	return types[type.toLowerCase()] || type;
}

function translateAccessibility(access) {
	if (!access) return "Non";
	const types = {
		yes: "Oui",
		limited: "Partiel",
		no: "Non",
	};
	return types[access.toLowerCase()] || access;
}

function getOpeningHoursHTML(openingHoursString) {
	if (!openingHoursString) return "";

	if (openingHoursString === "24/7") {
		return `
		<table class="hours-table">
			<tr>
				<td class="hours-day">Lun-Dim</td>
				<td class="hours-time">24h/24</td>
			</tr>
		</table>`;
	}

	const daysMap = {
		Mo: "Lun",
		Tu: "Mar",
		We: "Mer",
		Th: "Jeu",
		Fr: "Ven",
		Sa: "Sam",
		Su: "Dim",
		PH: "Férié",
	};

	const normalizedString = openingHoursString.replace(
		/([0-9:]+|off)\s*,\s*(Mo|Tu|We|Th|Fr|Sa|Su|PH)/g,
		"$1; $2",
	);

	const segments = normalizedString.split(";");
	let rowsHTML = "";

	segments.forEach((segment) => {
		segment = segment.trim();
		if (!segment) return;
		if (segment.includes("off")) return;

		const firstSpaceIndex = segment.indexOf(" ");
		if (firstSpaceIndex === -1) return;

		let daysPart = segment.substring(0, firstSpaceIndex);
		let hoursPart = segment.substring(firstSpaceIndex + 1);

		Object.entries(daysMap).forEach(([en, fr]) => {
			daysPart = daysPart.replace(new RegExp(en, "g"), fr);
		});

		rowsHTML += `
		<tr>
			<td class="hours-day">${daysPart}</td>
			<td class="hours-time">${hoursPart}</td>
		</tr>`;
	});

	if (!rowsHTML) return "";

	return `<table class="hours-table">${rowsHTML}</table>`;
}

function addEventOnPoint(feature) {
	const p = feature.properties;
	const container = document.createElement("div");
	container.className = "bank-popup";

	const locationParts = [p.meta_name_com, p.meta_name_dep].filter(Boolean);
	const location = locationParts.length > 0 ? locationParts.join(", ") : null;

	const infoItems = [
		{ label: "Opérateur", value: p.operator },
		{ label: "Accessibilité", value: translateAccessibility(p.wheelchair) },
		{ label: "Lieu", value: location },
	];

	let openingHours = p.opening_hours;
	if (!openingHours && p.type === "atm") openingHours = "24/7";

	let hoursHTML = "";
	if (openingHours) {
		hoursHTML = getOpeningHoursHTML(openingHours);
	} else {
		hoursHTML = `
		<div class="bank-info-row">
			<span class="bank-info-label">Horaires : </span>
			<span>Inconnus</span>
		</div>`;
	}

	const infosHTML = infoItems
		.filter((item) => item.value)
		.map(
			(item) => `
		<div class="bank-info-row">
			<span class="bank-info-label">${item.label} :</span>
			<span class="bank-info-value">${item.value}</span>
		</div>`,
		)
		.join("");

	container.innerHTML = `
		${p.image ? `<img src="${p.image}" alt="${p.brand || p.name || "Image de la banque"}" class="bank-popup-image">` : ""}
		<h3>${p.brand || p.name || "Point Cash"}</h3>
		${p.type ? `<span class="bank-popup-type">${translateType(p.type)}</span>` : ""}
		${infosHTML}
		${hoursHTML}
		<button class="distance-badge itinerary-btn">Lancer l'itinéraire</button>
	`;

	const itineraryBtn = container.querySelector(".itinerary-btn");
	itineraryBtn.addEventListener("click", async () => {
		// État de chargement
		const originalText = itineraryBtn.textContent;
		itineraryBtn.disabled = true;
		itineraryBtn.classList.add("loading");
		itineraryBtn.innerHTML = '<span class="btn-spinner"></span>Calcul en cours...';

		try {
			globalItineraryTarget = feature.geometry.coordinates;
			updateDestinationMarker(feature);

			const itinerary = await itineraryCalcul(
				globalUserPosition,
				globalItineraryTarget,
			);

			// Displaying the itinerary
			document.getElementById("sidebar").style.display = "none";
			document.getElementById("itinerary-sidebar").style.display = "flex";

			// Displaying total distance
			const totalDistance = document.getElementById("itinerary-total-distance");
			totalDistance.innerHTML = "";
			if (itinerary[0] >= CONSTANTS.DISTANCE_THRESHOLDS.KM_THRESHOLD) {
				totalDistance.textContent = `${roundToTwoDecimals(itinerary[0] / 1000)}km`;
			} else {
				totalDistance.textContent = `${roundToInteger(itinerary[0])}m`;
			}

			// Displaying each roads informations
			const stepsList = document.getElementById("itinerary-steps");
			stepsList.innerHTML = "";

			itinerary[1].forEach((step) => {
				const li = document.createElement("li");

				const distanceSpan = document.createElement("span");
				const nameSpan = document.createElement("span");

				nameSpan.textContent = `${step.road}`;
				const roadDistances = step.distance;
				if (roadDistances >= CONSTANTS.DISTANCE_THRESHOLDS.KM_THRESHOLD) {
					distanceSpan.textContent = `${roundToTwoDecimals(roadDistances / 1000)}km`;
				} else {
					distanceSpan.textContent = `${roundToInteger(roadDistances)}m`;
				}

				li.appendChild(nameSpan);
				li.appendChild(distanceSpan);

				stepsList.appendChild(li);
			});
		} catch (error) {
			console.error("Erreur lors du calcul de l'itinéraire:", error);
			alert("Impossible de calculer l'itinéraire");
		} finally {
			// Réinitialiser l'état du bouton
			itineraryBtn.disabled = false;
			itineraryBtn.classList.remove("loading");
			itineraryBtn.innerHTML = originalText;
		}
	});

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
	const userIcon = new L.Icon({
		iconUrl: URLS.MARKER_USER,
		iconSize: [40, 40],
		iconAnchor: [20, 20],
		popupAnchor: [0, -20],
		className: "user-marker",
	});
	return L.marker(userPosition, { icon: userIcon });
}

function updateDestinationMarker(feature) {
	if (globalDestinationMarker) {
		globalMap.removeLayer(globalDestinationMarker);
	}

	if (feature._layer) {
		feature._layer.closePopup();
	}

	const [lng, lat] = feature.geometry.coordinates;

	globalDestinationMarker = L.marker([lat, lng], {
		icon: createIcon(feature),
	});

	globalDestinationMarker.addTo(globalMap);
}

async function fetchOutlinesDepartmentsData() {
	const response = await fetch("../data/departements-france.geojson");
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

function createGeoLayer(data, userPosition, radiusMeters) {
	return L.geoJSON(data, {
		filter: (feature) => {
			// on prend que les features qui sont à proximité
			const distance = distanceMeters(userPosition, feature.geometry.coordinates);
			return distance <= radiusMeters;
		},
		pointToLayer: (feature) => {
			// petit icone sympa
			return L.marker(feature.geometry.coordinates, { icon: createIcon(feature) });
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
		const distance = distanceMeters(userPosition, feature.geometry.coordinates);
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

		// on met à jour le cercle
		globalCircle.setLatLng(newPosition);

		// on retire l'ancien layer
		if (globalGeoLayer) {
			globalMap.removeLayer(globalGeoLayer);
			globalGeoLayer = null;
		}

		// on recrée le geolayer avec la nouvelle position
		const newGeoLayer = createGeoLayer(
			globalData,
			newPosition,
			globalRadiusMeters,
		);
		newGeoLayer.addTo(globalMap);
		globalGeoLayer = newGeoLayer;

		// la position de l'utilisateur a changé, on recalcule les distributeurs les plus proches
		globalClosestCashPoints = defineClosestCashPoints(globalData, newPosition);
		printClosestCashPoints(globalClosestCashPoints);

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

let globalPositionIntervalId = null;

function startPositionAutoUpdate() {
	if (globalPositionIntervalId) {
		clearInterval(globalPositionIntervalId);
	}

	globalPositionIntervalId = setInterval(async () => {
		try {
			const newPosition = await getLocation();
			const [oldLat, oldLng] = globalUserPosition;
			const [newLat, newLng] = newPosition;

			const distanceMoved = distanceMeters([oldLat, oldLng], [newLat, newLng]);

			if (distanceMoved > CONSTANTS.POSITION_UPDATE_THRESHOLD_METERS) {
				globalUserMarker.setLatLng(newPosition);
				globalUserPosition = newPosition;
				globalCircle.setLatLng(newPosition);

				if (globalGeoLayer) {
					globalMap.removeLayer(globalGeoLayer);
				}

				const newGeoLayer = createGeoLayer(
					globalData,
					newPosition,
					globalRadiusMeters,
				);
				newGeoLayer.addTo(globalMap);
				globalGeoLayer = newGeoLayer;

				globalClosestCashPoints = defineClosestCashPoints(globalData, newPosition);
				printClosestCashPoints(globalClosestCashPoints);

				if (globalItineraryTarget) {
					if (globalItineraryLayer) {
						globalMap.removeLayer(globalItineraryLayer);
						globalItineraryLayer = null;
					}
					globalItineraryLayer = await itineraryCalcul(
						newPosition,
						globalItineraryTarget,
					);
				}
			}
		} catch (error) {
			console.warn("Erreur lors de la mise à jour automatique de la position:", error);
		}
	}, CONSTANTS.POSITION_UPDATE_INTERVAL_MS);
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

			// on attend la fin du mouvement pour ouvrir la popup
			globalMap.once("moveend", () => {
				feature._layer.openPopup();
			});

			globalMap.setView(feature.geometry.coordinates, 18);
		});

		// Ajouter un bouton pour lancer l'itinéraire
		const badgeEl = card.getElementsByClassName("distance-badge")[0];
		if (badgeEl) {
			badgeEl.style.cursor = "pointer";
			badgeEl.title = "Cliquer pour lancer l'itinéraire";

			badgeEl.addEventListener("click", async (e) => {
				e.stopPropagation(); // Empêcher le clic sur la carte

				const targetCoords = feature.geometry.coordinates;

				// Désactiver temporairement le badge
				const originalText = badgeEl.textContent;
				badgeEl.textContent = "...";
				badgeEl.style.pointerEvents = "none";

				try {
					itineraryLayer = await itineraryCalcul(
						globalUserPosition,
						targetCoords,
						globalMap,
					);

					// Ouvrir la popup après le calcul
					setTimeout(() => {
						if (feature._layer) {
							feature._layer.openPopup();
						}
					}, 600);
				} catch (error) {
					console.error("Erreur lors du calcul de l'itinéraire:", error);
					alert("Impossible de calculer l'itinéraire");
				} finally {
					badgeEl.textContent = originalText;
					badgeEl.style.pointerEvents = "auto";
				}
			});
		}
	}
}

function setupRadiusControl() {
	const radiusSlider = document.getElementById("selected_radius");
	const radiusValueDisplay = document.getElementById("radius-value");
	const radiusLoader = document.getElementById("radius-loader");

	const updateRadius = (newRadiusMeters) => {
		globalRadiusMeters = newRadiusMeters;

		if (globalGeoLayer) {
			globalMap.removeLayer(globalGeoLayer);
			globalGeoLayer = null;
		}

		// Deleting the previous itinerary if its out of the new radius
		if (globalItineraryLayer) {
			globalMap.removeLayer(globalItineraryLayer);
			globalItineraryLayer = null;
		}

		// on recrée le geolayer avec le nouveau rayon
		const newGeoLayer = createGeoLayer(
			globalData,
			globalUserPosition,
			globalRadiusMeters,
		);

		newGeoLayer.addTo(globalMap);
		globalGeoLayer = newGeoLayer;
		globalCircle.setRadius(globalRadiusMeters);

		radiusLoader.classList.add("hidden");
	};

	const debouncedUpdate = debounce(updateRadius, CONSTANTS.DEBOUNCE_DELAY_MS);

	radiusSlider.addEventListener("input", (e) => {
		const newRadiusMeters = parseInt(e.target.value, 10);

		radiusValueDisplay.textContent = formatRadiusDisplay(newRadiusMeters);

		radiusLoader.classList.remove("hidden");

		debouncedUpdate(newRadiusMeters);
	});
}

function setupMapEvents() {
	globalMap.whenReady(setupForm);
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
	setupMapEvents();
	setupCreditsModal();
	setupItineraryEvent();
	startPositionAutoUpdate();
};

function setupCreditsModal() {
	const modal = document.getElementById("credits-modal");
	const openButton = document.getElementById("open-credits");
	const closeButton = document.getElementById("close-credits");

	// Ouvrir la modal
	openButton.addEventListener("click", () => {
		modal.showModal();
	});

	// Fermer avec le bouton X
	closeButton.addEventListener("click", () => {
		modal.close();
	});

	// Fermer en cliquant sur l'overlay (backdrop)
	modal.addEventListener("click", (e) => {
		if (e.target === modal) {
			modal.close();
		}
	});
}

async function setupItineraryEvent() {
	document.getElementById("btn-stop-itinerary").addEventListener("click", async () => {
		document.getElementById("sidebar").style.display = "flex";
		document.getElementById("itinerary-sidebar").style.display = "none";
		globalMap.removeLayer(globalItineraryLayer);
		globalItineraryLayer = null;
		await updateUserLocation();
	});
}