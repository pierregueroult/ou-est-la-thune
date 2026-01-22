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

// Récupérer tous les distributeurs disponibles selon le mode
function getAvailableATMs() {
	const atms = [];

	// En mode libre, on peut rechercher dans TOUS les DABs de France
	if (globalFreeMode && globalData) {
		// Parcourir toutes les features du dataset complet
		globalData.features.forEach((feature) => {
			if (feature.geometry && feature.geometry.coordinates) {
				atms.push({
					feature: feature,
					coords: feature.geometry.coordinates,
				});
			}
		});
		return atms;
	}

	// En mode normal, uniquement les DABs affichés
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

// Calculer la distance pour le tri
function getDistance(coords) {
	if (!globalUserPosition) return Infinity;
	const [lng, lat] = coords;
	return distanceMeters(globalUserPosition, [lat, lng]);
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
					distance: getDistance(atm.coords),
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
			const closest = globalClosestCashPoints[0];
			await calculateAndShowItinerary(
				closest.feature.geometry.coordinates,
				closest.feature,
			);
		} catch (error) {
			console.error("Erreur lors du calcul de l'itinéraire:", error);
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
			if (!globalFreeMode) {
				setTimeout(() => searchATMs(destinationSearch.value), 600);
			}
		});
	}

	// Mettre à jour quand on change de mode
	const modeSwitch = document.getElementById("mode");
	if (modeSwitch) {
		modeSwitch.addEventListener("click", () => {
			setTimeout(() => searchATMs(destinationSearch.value), 300);
		});
	}

	// Mettre à jour après le mouvement de la carte (mode normal uniquement)
	if (globalMap) {
		globalMap.on("moveend", () => {
			if (!globalFreeMode) {
				setTimeout(() => searchATMs(destinationSearch.value), 200);
			}
		});
	}
}
