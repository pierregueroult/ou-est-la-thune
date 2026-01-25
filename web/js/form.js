let searchTimeout = null;
let startPointDisplay = null;
let destinationSelect = null;

async function calculateAndShowItinerary(targetCoords, feature = null) {
	itineraryLayer = await itineraryCalcul(
		globalUserPosition,
		targetCoords,
		globalMap,
	);

	if (feature && feature._layer) {
		setTimeout(() => {
			feature._layer.openPopup();
		}, 600);
	}
}

// Mise à jour de l'affichage de la position de départ
function updateStartPointDisplay() {
	if (globalUserPosition) {
		const [lat, lng] = globalUserPosition;
		startPointDisplay.textContent = `Ma position (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
	}
}

// Récupérer tous les distributeurs disponibles
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

// TO TEST, + verif
function isOpenCashPoint(openingHours) {

	if (!openingHours) return false;
	if (openingHours === "24/7") return true;

	const now = new Date();
	const currentDay = now.getDay(); // 0 = Dim, 1 = Lun, 6 = Sam
	const currentMinutes = now.getHours() * 60 + now.getMinutes();

	const dayMap = {
		Mo: 1,
		Tu: 2,
		We: 3,
		Th: 4,
		Fr: 5,
		Sa: 6,
		Su: 0,
	};

	const normalized = openingHours.replace(
		/([0-9:]+|off)\s*,\s*(Mo|Tu|We|Th|Fr|Sa|Su)/g,
		"$1; $2",
	);

	const segments = normalized.split(";");

	for (let segment of segments) {
		segment = segment.trim();
		if (!segment || segment.includes("off")) continue;

		const spaceIndex = segment.indexOf(" ");
		if (spaceIndex === -1) continue;

		const daysPart = segment.substring(0, spaceIndex);
		const hoursPart = segment.substring(spaceIndex + 1);

		// Days
		let validDay = false;

		if (daysPart.includes("-")) {
			// Exemple : Mo-Fr
			const [start, end] = daysPart.split("-");
			const startDay = dayMap[start];
			const endDay = dayMap[end];

			if (startDay <= endDay) {
				validDay =
					currentDay >= startDay && currentDay <= endDay;
			} else {
				// Cas rare : Su-Mo
				validDay =
					currentDay >= startDay || currentDay <= endDay;
			}
		} else {
			// Exemple : Mo ou Sa
			const day = dayMap[daysPart];
			validDay = currentDay === day;
		}

		if (!validDay) continue;

		// ---- Gestion des heures ----
		const [startTime, endTime] = hoursPart.split("-");
		if (!startTime || !endTime) continue;

		const [sh, sm] = startTime.split(":").map(Number);
		const [eh, em] = endTime.split(":").map(Number);

		const startMinutes = sh * 60 + sm;
		const endMinutes = eh * 60 + em;

		if (
			currentMinutes >= startMinutes &&
			currentMinutes <= endMinutes
		) {
			return true;
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
			
			// Is the cash point open ?
			let atLeastOneOpen = false;
			for(cashPoint of globalClosestCashPoints){
				if(cashPoint.feature.properties.type === "atm"
					|| isOpenCashPoint(cashPoint.feature.properties.opening_hours)){
					atLeastOneOpen = true;
					await calculateAndShowItinerary(
						cashPoint.feature.geometry.coordinates,
						cashPoint.feature,
					);
				}
			}
			if(!atLeastOneOpen){
				throw "Erreur : Aucun distributeur proche n'est ouvert."
			}

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
			// Trouver la feature pour ouvrir la popup si elle existe
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

			await calculateAndShowItinerary(selectedCoords, feature);
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
