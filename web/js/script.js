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
let globalPositionIntervalId = null;
let globalFilterAccess = false;
let globalFilterOpen = true;

function isFeatureVisible(feature, userPosition, radiusMeters) {
	if (distanceMeters(userPosition, feature.geometry.coordinates) > radiusMeters) return false;
	if (globalFilterAccess && !isAccessible(feature)) return false;
	
	if (globalFilterOpen) {
		const p = feature.properties;
		const hours = p.opening_hours || (p.type === "atm" ? "24/7" : null);
		if (!isOpenCashPoint(hours)) return false;
	}
	
	return true;
}

function createIcon(feature) {
	const iconUrl = feature.properties.type === "atm" ? URLS.MARKER_ATM : URLS.MARKER_BANK;
	return new L.Icon({
		iconUrl,
		shadowUrl: URLS.MARKER_SHADOW,
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowSize: [41, 41],
	});
}

function createUserMarker(userPosition) {
	return L.marker(userPosition, {
		zIndexOffset: 1000,
		icon: new L.Icon({
			iconUrl: URLS.MARKER_USER,
			iconSize: [40, 40],
			iconAnchor: [20, 20],
			popupAnchor: [0, -20],
			className: "user-marker",
		}),
	});
}

function updateDestinationMarker(feature) {
	if (globalDestinationMarker) {
		globalMap.removeLayer(globalDestinationMarker);
	}
	const [lng, lat] = feature.geometry.coordinates;
	globalDestinationMarker = L.marker([lat, lng], { icon: createIcon(feature) }).addTo(globalMap);
}

const createTileLayer = () => L.tileLayer(URLS.TILE_LAYER, { maxZoom: 20 });

const createCircle = (pos, radius) => L.circle(pos, { radius, color: "#1b615a", fillOpacity: 0.1 });

const createMap = (pos, layer) => L.map("map", {
	center: pos,
	zoomControl: false,
	zoom: CONSTANTS.MAP_DEFAULTS.ZOOM,
	attributionControl: false,
	layers: [layer],
});

async function fetchGeoData() {
	const response = await fetch(URLS.GEOJSON);
	return response.json();
}

async function fetchOutlinesDepartmentsData() {
	const response = await fetch("../data/departements-france.geojson");
	return response.json();
}

function addEventOnPoint(feature) {
	const p = feature.properties;
	const container = document.createElement("div");
	container.className = "bank-popup";

	const location = [p.meta_name_com, p.meta_name_dep].filter(Boolean).join(", ");
	const openingHours = p.opening_hours || (p.type === "atm" ? "24/7" : null);

	const infoItems = [
		{ label: "Opérateur", value: p.operator },
		{ label: "Accessibilité", value: translateAccessibility(p.wheelchair) },
		{ label: "Lieu", value: location || null },
	].filter(item => item.value);

	const infosHTML = infoItems.map(item =>
		`<div class="bank-info-row"><span class="bank-info-label">${item.label} :</span><span class="bank-info-value">${item.value}</span></div>`
	).join("");

	const hoursHTML = openingHours
		? getOpeningHoursHTML(openingHours)
		: `<div class="bank-info-row"><span class="bank-info-label">Horaires : </span><span>Inconnus</span></div>`;

	container.innerHTML = `
		${p.image ? `<img src="${p.image}" alt="${p.brand || p.name || "Image"}" class="bank-popup-image">` : ""}
		<h3>${p.brand || p.name || "Point Cash"}</h3>
		${p.type ? `<span class="bank-popup-type">${translateType(p.type)}</span>` : ""}
		${infosHTML}
		${hoursHTML}
		<button class="distance-badge itinerary-btn">Lancer l'itinéraire</button>
	`;

	const itineraryBtn = container.querySelector(".itinerary-btn");
	itineraryBtn.addEventListener("click", async () => {
		const originalText = itineraryBtn.textContent;
		itineraryBtn.disabled = true;
			itineraryBtn.classList.add("loading");
		itineraryBtn.innerHTML = '<span class="btn-spinner"></span>Calcul en cours...';
		setSidebarInputsDisabled(true);

		try {
			await showItinerary(feature);
		} catch (error) {
			console.error("Erreur lors du calcul de l'itinéraire:", error);
			alert("Impossible de calculer l'itinéraire");
		} finally {
			itineraryBtn.disabled = false;
			itineraryBtn.classList.remove("loading");
			itineraryBtn.innerHTML = originalText;
			setSidebarInputsDisabled(false);
		}
	});

	feature._layer.bindPopup(container);
}

function createGeoLayer(data, userPosition, radiusMeters) {
	return L.geoJSON(data, {
		filter: (feature) => isFeatureVisible(feature, userPosition, radiusMeters),
		pointToLayer: (feature) => L.marker(feature.geometry.coordinates, { icon: createIcon(feature) }),
		onEachFeature: (feature, layer) => {
			feature._layer = layer;
			addEventOnPoint(feature);
		},
	});
}

function defineClosestCashPoints(data, userPosition) {
	return data.features
		.filter(feature => isFeatureVisible(feature, userPosition, globalRadiusMeters))
		.map((feature) => ({ feature, distance: distanceMeters(userPosition, feature.geometry.coordinates) }))
		.sort((a, b) => a.distance - b.distance)
		.slice(0, CONSTANTS.TOP_CLOSEST_POINTS);
}

function printClosestCashPoints(closestCashPoints) {
	const cards = document.getElementsByClassName("card-left");
	const noResultsEl = document.getElementById("no-results");

	if (closestCashPoints.length === 0) {
		noResultsEl.classList.remove("hidden");
	} else {
		noResultsEl.classList.add("hidden");
	}

	for (let i = 0; i < cards.length; i++) {
		const card = cards[i];
		const cardContainer = card.closest(".card");

		if (i >= closestCashPoints.length) {
			// No data for this slot, hide the card
			if (cardContainer) cardContainer.style.display = "none";
			continue;
		}

		// Has data, show and update card
		if (cardContainer) cardContainer.style.display = "block";

		const { feature, distance } = closestCashPoints[i];

		const nameEl = card.querySelector(".bank-name");
		const cityEl = card.querySelector(".bank-city");
		const badgeEl = card.querySelector(".distance-badge");

		if (nameEl) {
			nameEl.textContent = feature.properties.brand || "Distributeur";
			nameEl.classList.remove("skeleton");
		}
		if (cityEl) {
			cityEl.textContent = feature.properties.meta_name_com || "";
			cityEl.classList.remove("skeleton");
		}
		if (badgeEl) {
			badgeEl.textContent = formatDistance(distance);
			badgeEl.classList.remove("skeleton");
		}
	}
}

async function updateUserLocation() {
	try {
		const newPosition = await getLocation();
		globalMap.setView(newPosition, CONSTANTS.MAP_DEFAULTS.ZOOM);

		globalUserMarker.setLatLng(newPosition);
		globalUserPosition = newPosition;
		globalCircle.setLatLng(newPosition);

		if (globalGeoLayer) {
			globalMap.removeLayer(globalGeoLayer);
		}

		globalGeoLayer = createGeoLayer(globalData, newPosition, globalRadiusMeters);
		globalGeoLayer.addTo(globalMap);

		globalClosestCashPoints = defineClosestCashPoints(globalData, newPosition);
		printClosestCashPoints(globalClosestCashPoints);

		return newPosition;
	} catch (error) {
		console.error("Error updating user location:", error);
		alert("Impossible de récupérer votre nouvelle position.");
		throw error;
	}
}

function startPositionAutoUpdate() {
	if (globalPositionIntervalId) clearInterval(globalPositionIntervalId);

	globalPositionIntervalId = setInterval(async () => {
		try {
			const newPosition = await getLocation();
			const distanceMoved = distanceMeters(globalUserPosition, newPosition);

			if (distanceMoved > CONSTANTS.POSITION_UPDATE_THRESHOLD_METERS) {
				globalUserMarker.setLatLng(newPosition);
				globalUserPosition = newPosition;
				globalCircle.setLatLng(newPosition);

				if (globalGeoLayer) globalMap.removeLayer(globalGeoLayer);

				globalGeoLayer = createGeoLayer(globalData, newPosition, globalRadiusMeters);
				globalGeoLayer.addTo(globalMap);

				globalClosestCashPoints = defineClosestCashPoints(globalData, newPosition);
				printClosestCashPoints(globalClosestCashPoints);

				if (globalItineraryTarget) {
					await itineraryCalcul(newPosition, globalItineraryTarget);
				}
			}
		} catch (error) {
			console.warn("Erreur lors de la mise à jour automatique:", error);
		}
	}, CONSTANTS.POSITION_UPDATE_INTERVAL_MS);
}

function setupClickOnClosestCashPoints(closestCashPoints) {
	const cards = document.getElementsByClassName("card-left");

	for (let i = 0; i < closestCashPoints.length; i++) {
		const card = cards[i];
		const { feature } = closestCashPoints[i];

		card.onclick = () => {
			globalMap.once("moveend", () => feature._layer.openPopup());
			globalMap.setView(feature.geometry.coordinates, 18);
		};

		const badgeEl = card.querySelector(".distance-badge");
		if (badgeEl) {
			badgeEl.title = "Cliquer pour lancer l'itinéraire";

			badgeEl.onclick = async (e) => {
				e.stopPropagation();
				const originalText = badgeEl.textContent;
				badgeEl.disabled = true;
				badgeEl.classList.add("loading");
				badgeEl.innerHTML = '<span class="btn-spinner"></span>Calcul...';
				setSidebarInputsDisabled(true);
				
				try {
					await showItinerary(feature);
				} catch (error) {
					console.error("Erreur lors du calcul de l'itinéraire:", error);
					alert("Impossible de calculer l'itinéraire");
				} finally {
					badgeEl.disabled = false;
					badgeEl.classList.remove("loading");
					badgeEl.textContent = originalText;
					setSidebarInputsDisabled(false);
				}
			};
		}
	}
}

function updateMap() {
	if (globalGeoLayer) {
		globalMap.removeLayer(globalGeoLayer);
		globalGeoLayer = null;
	}

	if (globalItineraryLayer) {
		globalMap.removeLayer(globalItineraryLayer);
		globalItineraryLayer = null;
	}

	globalGeoLayer = createGeoLayer(globalData, globalUserPosition, globalRadiusMeters);
	globalGeoLayer.addTo(globalMap);
	globalCircle.setRadius(globalRadiusMeters);

	globalClosestCashPoints = defineClosestCashPoints(globalData, globalUserPosition);
	printClosestCashPoints(globalClosestCashPoints);
	setupClickOnClosestCashPoints(globalClosestCashPoints);
}

function setupFilterControl() {
	const accessCheckbox = document.getElementById("filter-access");
	const openCheckbox = document.getElementById("filter-open");

	if (accessCheckbox) {
		accessCheckbox.addEventListener("change", (e) => {
			globalFilterAccess = e.target.checked;
			updateMap();
		});
	}

	if (openCheckbox) {
		openCheckbox.addEventListener("change", (e) => {
			globalFilterOpen = e.target.checked;
			updateMap();
		});
	}
}

function setSidebarInputsDisabled(disabled) {
	const sidebar = document.querySelector(".sidebar");
	const inputs = sidebar.querySelectorAll("input, button, select");

	inputs.forEach(el => {
		if (el.id === "selected_radius") return;

		el.disabled = disabled;
		if (disabled) {
			el.classList.add("disabled-visual");
			const parent = el.closest(".filter-group, .radius-control"); 
			if (parent && !parent.classList.contains("radius-control")) {
				parent.style.opacity = "0.5";
				parent.style.cursor = "not-allowed";
			}
		} else {
			el.classList.remove("disabled-visual");
			const parent = el.closest(".filter-group");
			if (parent) {
				parent.style.opacity = "1";
				parent.style.cursor = "default";
			}
		}
	});
}

function setupRadiusControl() {
	const radiusSlider = document.getElementById("selected_radius");
	const radiusValueDisplay = document.getElementById("radius-value");
	const radiusLoader = document.getElementById("radius-loader");

	const updateRadius = (newRadiusMeters) => {
		globalRadiusMeters = newRadiusMeters;
		updateMap();
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

function setupCreditsModal() {
	const modal = document.getElementById("credits-modal");
	const openBtn = document.getElementById("open-credits");
	const closeBtn = document.getElementById("close-credits");

	openBtn.addEventListener("click", () => modal.showModal());
	closeBtn.addEventListener("click", () => modal.close());
	modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
}

function setupItineraryEvent() {
	document.getElementById("btn-stop-itinerary").addEventListener("click", async () => {
		document.getElementById("sidebar").style.display = "flex";
		document.getElementById("itinerary-sidebar").style.display = "none";
		
		if (globalItineraryLayer) {
			globalMap.removeLayer(globalItineraryLayer);
			globalItineraryLayer = null;
		}
		
		if (globalDestinationMarker) {
			globalMap.removeLayer(globalDestinationMarker);
			globalDestinationMarker = null;
		}

		globalItineraryTarget = null;
		await updateUserLocation();
	});
}

const showMapLoader = () => document.getElementById("map-loader")?.classList.remove("hidden");
const hideMapLoader = () => document.getElementById("map-loader")?.classList.add("hidden");

window.onload = async () => {
	globalRadiusMeters = parseInt(document.getElementById("selected_radius").value, 10);
	const filterOpenEl = document.getElementById("filter-open");
	if (filterOpenEl) globalFilterOpen = filterOpenEl.checked;

	const tiles = createTileLayer();
	globalUserPosition = await getLocation();
	globalMap = createMap(globalUserPosition, tiles);

	globalCircle = createCircle(globalUserPosition, globalRadiusMeters);
	globalCircle.addTo(globalMap);

	globalUserMarker = createUserMarker(globalUserPosition);
	globalUserMarker.addTo(globalMap);

	document.getElementById("locate").addEventListener("click", updateUserLocation);
	document.getElementById("zoom-in").addEventListener("click", () => globalMap.zoomIn());
	document.getElementById("zoom-out").addEventListener("click", () => globalMap.zoomOut());
	setupCreditsModal();
	setupItineraryEvent();
	showMapLoader();

	try {
		globalData = await fetchGeoData();

		globalGeoLayer = createGeoLayer(globalData, globalUserPosition, globalRadiusMeters);
		globalGeoLayer.addTo(globalMap);

		globalClosestCashPoints = defineClosestCashPoints(globalData, globalUserPosition);
		printClosestCashPoints(globalClosestCashPoints);

		setupRadiusControl();
		setupFilterControl();
		setupClickOnClosestCashPoints(globalClosestCashPoints);
		globalMap.whenReady(setupForm);
		startPositionAutoUpdate();
	} catch (error) {
		console.error("Erreur lors du chargement des données:", error);
	} finally {
		hideMapLoader();
	}
};