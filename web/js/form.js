let searchTimeout = null;
let startPointDisplay = null;
let destinationSelect = null;

async function showItinerary(feature) {
	const targetCoords = feature.geometry.coordinates;

	globalItineraryTarget = targetCoords;
	updateDestinationMarker(feature);

	const itinerary = await itineraryCalcul(globalUserPosition, targetCoords);

	document.getElementById("sidebar").style.display = "none";
	document.getElementById("itinerary-sidebar").style.display = "flex";

	const totalDistance = document.getElementById("itinerary-total-distance");
	if (itinerary[0] >= CONSTANTS.DISTANCE_THRESHOLDS.KM_THRESHOLD) {
		totalDistance.textContent = `${roundToTwoDecimals(itinerary[0] / 1000)}km`;
	} else {
		totalDistance.textContent = `${roundToInteger(itinerary[0])}m`;
	}

	const stepsList = document.getElementById("itinerary-steps");
	stepsList.innerHTML = "";

	itinerary[1].forEach((step) => {
		const li = document.createElement("li");
		const nameSpan = document.createElement("span");
		const distanceSpan = document.createElement("span");

		nameSpan.textContent = step.road;
		if (step.distance >= CONSTANTS.DISTANCE_THRESHOLDS.KM_THRESHOLD) {
			distanceSpan.textContent = `${roundToTwoDecimals(step.distance / 1000)}km`;
		} else {
			distanceSpan.textContent = `${roundToInteger(step.distance)}m`;
		}

		li.appendChild(nameSpan);
		li.appendChild(distanceSpan);
		stepsList.appendChild(li);
	});

	// Ferme la popup après l'affichage de l'itinéraire
	if (feature._layer) {
		feature._layer.closePopup();
	}

	return itinerary;
}

function updateStartPointDisplay() {
	if (globalUserPosition) {
		const [lat, lng] = globalUserPosition;
		startPointDisplay.textContent = `Ma position (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
	}
}

function getAvailableATMs() {
	const atms = [];

	if (!globalGeoLayer) return atms;

	globalGeoLayer.eachLayer((layer) => {
		if (layer.feature && layer.feature.geometry) {
			atms.push({
				feature: layer.feature,
				coords: layer.feature.geometry.coordinates,
			});
		}
	});

	return atms;
}

function isOpenCashPoint(openingHours) {
	if (!openingHours) return false;
	if (openingHours === "24/7" || openingHours === "Mo-Su 00:00-24:00")
		return true;

	const now = new Date();
	const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
	const today = days[now.getDay()];
	const nowMinutes = now.getHours() * 60 + now.getMinutes();

	// Normalise les virgules entre segments en point-virgules
	const normalized = openingHours.replace(
		/([0-9:]+|off)\s*,\s*(Mo|Tu|We|Th|Fr|Sa|Su|PH)/g,
		"$1; $2",
	);

	for (const segment of normalized.split(";")) {
		const part = segment.trim();
		if (!part || part.includes("off")) continue;

		const spaceIdx = part.indexOf(" ");
		if (spaceIdx === -1) continue;

		const dayExpr = part.slice(0, spaceIdx);
		const timeExpr = part.slice(spaceIdx + 1);

		// Vérifie si aujourd'hui est inclus dans l'expression des jours
		if (!matchesDay(dayExpr, today, days)) continue;

		// Vérifie si l'heure actuelle est dans les plages horaires
		if (matchesTime(timeExpr, nowMinutes)) return true;
	}

	return false;
}

function matchesDay(expr, today, days) {
	const todayIdx = days.indexOf(today);

	for (const part of expr.split(",")) {
		if (part.includes("-")) {
			const [start, end] = part.split("-");
			const startIdx = days.indexOf(start);
			const endIdx = days.indexOf(end);
			if (startIdx === -1 || endIdx === -1) continue;

			// Gère les ranges normales (Mo-Fr) et circulaires (Fr-Mo)
			const inRange =
				startIdx <= endIdx
					? todayIdx >= startIdx && todayIdx <= endIdx
					: todayIdx >= startIdx || todayIdx <= endIdx;

			if (inRange) return true;
		} else if (part === today) {
			return true;
		}
	}
	return false;
}

function matchesTime(expr, nowMinutes) {
	for (const range of expr.split(",")) {
		const [start, end] = range.trim().split("-");
		if (!start || !end) continue;

		const toMin = (s) => {
			const [h, m] = s.split(":").map(Number);
			return isNaN(h) || isNaN(m) ? null : h * 60 + m;
		};

		const startMin = toMin(start);
		const endMin = toMin(end);

		if (startMin !== null && endMin !== null) {
			if (nowMinutes >= startMin && nowMinutes <= endMin) return true;
		}
	}
	return false;
}

// Recherche et mise à jour des résultats
function searchATMs(searchTerm) {
	clearTimeout(searchTimeout);

	searchTimeout = setTimeout(() => {
		const atms = getAvailableATMs();
		const lowerSearch = searchTerm.toLowerCase().trim();

		// Filtrer selon la recherche
		let results = atms.filter((atm) => {
			const props = atm.feature.properties;
			const brand = (props.brand || "").toLowerCase();
			const operator = (props.operator || "").toLowerCase();
			const city = (props.meta_name_com || "").toLowerCase();
			const name = (props.name || "").toLowerCase();

			return (
				!lowerSearch ||
				brand.includes(lowerSearch) ||
				operator.includes(lowerSearch) ||
				city.includes(lowerSearch) ||
				name.includes(lowerSearch)
			);
		});

		// Trier par distance si beaucoup de résultats
		if (results.length > 10) {
			results = results
				.map((atm) => ({
					...atm,
					distance: distanceMeters(atm.coords, globalUserPosition),
				}))
				.sort((a, b) => a.distance - b.distance);
		}

		// Vider le select
		if (!destinationSelect) return;
		destinationSelect.innerHTML = "";

		if (results.length === 0) {
			const option = document.createElement("option");
			option.value = "";
			option.textContent = "Aucun résultat";
			option.disabled = true;
			destinationSelect.appendChild(option);
			return;
		}

		// Ajouter les 10 premiers résultats
		const displayLimit = 10;
		const toDisplay = results.slice(0, displayLimit);

		toDisplay.forEach((atm, index) => {
			const props = atm.feature.properties;
			const brand =
				props.brand || props.operator || props.name || "Distributeur";
			const city = props.meta_name_com || "";
			const type = props.type === "atm" ? "DAB" : "Banque";

			const option = document.createElement("option");
			option.value = JSON.stringify(atm.coords);
			option.textContent = `${brand} - ${city} (${type})`;
			option.dataset.index = index;
			destinationSelect.appendChild(option);
		});

		// Stocker les résultats pour référence
		destinationSelect._resultsCache = results;

		// Afficher le nombre de résultats restants
		if (results.length > displayLimit) {
			const option = document.createElement("option");
			option.value = "";
			option.textContent = `... ${results.length - displayLimit} autres résultats (affinez votre recherche)`;
			option.disabled = true;
			destinationSelect.appendChild(option);
		}
	}, 300); // Debounce de 300ms
}

function setupForm() {
	const form = document.querySelector(".search-section form");
	startPointDisplay = document.getElementById("start-point");
	const destinationSearch = document.getElementById("destination-search");
	destinationSelect = document.getElementById("destination-select");
	const submitButton = form.querySelector(".btn-go");
	const closestButton = document.getElementById("btn-closest");

	let selectedCoords = null;

	// Fonction réutilisable pour calculer l'itinéraire et ouvrir la popup

	// Événement sur le champ de recherche
	destinationSearch.addEventListener("input", (e) => {
		const value = e.target.value;
		if (value.trim()) {
			destinationSelect.style.display = "block";
			searchATMs(value);
		} else {
			destinationSelect.style.display = "none";
		}
	});

	// Cacher quand on clique ailleurs
	document.addEventListener("click", (e) => {
		if (
			!destinationSearch.contains(e.target) &&
			!destinationSelect.contains(e.target)
		) {
			destinationSelect.style.display = "none";
		}
	});

	// Sélection d'un résultat
	destinationSelect.addEventListener("change", (e) => {
		const option = e.target.selectedOptions[0];
		if (option && option.value) {
			selectedCoords = JSON.parse(option.value);
			destinationSearch.value = option.textContent;
			destinationSelect.style.display = "none";
		}
	});

	// Bouton "Le distributeur le plus proche"
	closestButton.addEventListener("click", async () => {
		if (
			!globalUserPosition ||
			!globalClosestCashPoints ||
			globalClosestCashPoints.length === 0
		) {
			alert("Aucun distributeur trouvé à proximité");
			return;
		}

		closestButton.disabled = true;
		const originalText = closestButton.textContent;
		closestButton.textContent = "Calcul en cours...";

		try {
			// Trouver le premier distributeur ouvert parmi les plus proches
			let openCashPoint = null;

			for (const cashPoint of globalClosestCashPoints) {
				// Les ATM sont considérés comme toujours ouverts (24/7)
				const isATM = cashPoint.feature.properties.type === "atm";
				const isOpen = isOpenCashPoint(
					cashPoint.feature.properties.opening_hours,
				);

				if (isATM || isOpen) {
					openCashPoint = cashPoint;
					break; // Prendre le premier ouvert (le plus proche)
				}
			}

			if (!openCashPoint) {
				throw new Error("Aucun distributeur proche n'est ouvert actuellement.");
			}

			await showItinerary(openCashPoint.feature);
		} catch (error) {
			console.error("Erreur lors du calcul de l'itinéraire : ", error);
			alert("Impossible de calculer l'itinéraire");
		} finally {
			closestButton.disabled = false;
			closestButton.textContent = originalText;
		}
	});

	// Soumission du formulaire (destination manuelle)
	form.addEventListener("submit", async (e) => {
		e.preventDefault();

		if (!selectedCoords) {
			alert("Veuillez sélectionner une destination");
			return;
		}

		if (!globalUserPosition) {
			alert("Position utilisateur non disponible");
			return;
		}

		submitButton.disabled = true;

		try {
			// Trouver la feature pour ouvrir la popup
			let feature = null;
			const selectedOption = destinationSelect.selectedOptions[0];
			if (
				selectedOption &&
				selectedOption.dataset.index &&
				destinationSelect._resultsCache
			) {
				const index = parseInt(selectedOption.dataset.index);
				const atm = destinationSelect._resultsCache[index];
				if (atm && atm.feature) {
					feature = atm.feature;
				}
			}

			if (feature) {
				await showItinerary(feature);
			} else {
				alert("Impossible de trouver le distributeur sélectionné");
			}
		} catch (error) {
			console.error("Erreur lors du calcul de l'itinéraire:", error);
			alert("Impossible de calculer l'itinéraire");
		} finally {
			submitButton.disabled = false;
		}
	});

	// Initialisation
	updateStartPointDisplay();
	destinationSelect.style.display = "none";

	// Mettre à jour quand la position change
	const locateButton = document.getElementById("locate");
	if (locateButton) {
		locateButton.addEventListener("click", () => {
			setTimeout(() => {
				updateStartPointDisplay();
				searchATMs(destinationSearch.value);
			}, 800);
		});
	}

	// Mettre à jour quand le rayon change (mode normal)
	const radiusSlider = document.getElementById("selected_radius");
	if (radiusSlider) {
		radiusSlider.addEventListener("change", () => {
			setTimeout(() => searchATMs(destinationSearch.value), 600);
		});
	}

	// Mettre à jour après le mouvement de la carte (mode normal uniquement)
	if (globalMap) {
		globalMap.on("moveend", () => {
			setTimeout(() => searchATMs(destinationSearch.value), 200);
		});
	}
}
