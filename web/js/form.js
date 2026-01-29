let searchTimeout = null;
let startPointDisplay = null;
let destinationSelect = null;

function isOpenCashPoint(openingHours) {
	if (!openingHours) return false;
	if (openingHours === "24/7" || openingHours === "Mo-Su 00:00-24:00") return true;

	const now = new Date();
	const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
	const today = days[now.getDay()];
	const nowMinutes = now.getHours() * 60 + now.getMinutes();

	const normalized = openingHours.replace(/([0-9:]+|off)\s*,\s*(Mo|Tu|We|Th|Fr|Sa|Su|PH)/g, "$1; $2");

	for (const segment of normalized.split(";")) {
		const part = segment.trim();
		if (!part || part.includes("off")) continue;

		const spaceIdx = part.indexOf(" ");
		if (spaceIdx === -1) continue;

		const dayExpr = part.slice(0, spaceIdx);
		const timeExpr = part.slice(spaceIdx + 1);

		if (!matchesDay(dayExpr, today, days)) continue;
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

			const inRange = startIdx <= endIdx
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

		if (startMin !== null && endMin !== null && nowMinutes >= startMin && nowMinutes <= endMin) {
			return true;
		}
	}
	return false;
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
		if (layer.feature?.geometry) {
			atms.push({ feature: layer.feature, coords: layer.feature.geometry.coordinates });
		}
	});

	return atms;
}

function searchATMs(searchTerm) {
	clearTimeout(searchTimeout);

	searchTimeout = setTimeout(() => {
		const atms = getAvailableATMs();
		const lowerSearch = searchTerm.toLowerCase().trim();

		let results = atms.filter((atm) => {
			const props = atm.feature.properties;
			const searchFields = [props.brand, props.operator, props.meta_name_com, props.name]
				.filter(Boolean)
				.map(s => s.toLowerCase());
			return !lowerSearch || searchFields.some(f => f.includes(lowerSearch));
		});

		if (results.length > 10) {
			results = results
				.map((atm) => ({ ...atm, distance: distanceMeters(atm.coords, globalUserPosition) }))
				.sort((a, b) => a.distance - b.distance);
		}

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

		const displayLimit = 10;
		const toDisplay = results.slice(0, displayLimit);

		toDisplay.forEach((atm, index) => {
			const props = atm.feature.properties;
			const brand = props.brand || props.operator || props.name || "Distributeur";
			const city = props.meta_name_com || "";
			const type = props.type === "atm" ? "DAB" : "Banque";

			const option = document.createElement("option");
			option.value = JSON.stringify(atm.coords);
			option.textContent = `${brand} - ${city} (${type})`;
			option.dataset.index = index;
			destinationSelect.appendChild(option);
		});

		destinationSelect._resultsCache = results;

		if (results.length > displayLimit) {
			const option = document.createElement("option");
			option.value = "";
			option.textContent = `... ${results.length - displayLimit} autres résultats`;
			option.disabled = true;
			destinationSelect.appendChild(option);
		}
	}, 300);
}

function setupForm() {
	const form = document.querySelector(".search-section form");
	startPointDisplay = document.getElementById("start-point");
	const destinationSearch = document.getElementById("destination-search");
	destinationSelect = document.getElementById("destination-select");
	const submitButton = form.querySelector(".btn-go");
	const closestButton = document.getElementById("btn-closest");

	let selectedCoords = null;

	destinationSearch.addEventListener("input", (e) => {
		const value = e.target.value;
		destinationSelect.style.display = value.trim() ? "block" : "none";
		if (value.trim()) searchATMs(value);
	});

	document.addEventListener("click", (e) => {
		if (!destinationSearch.contains(e.target) && !destinationSelect.contains(e.target)) {
			destinationSelect.style.display = "none";
		}
	});

	destinationSelect.addEventListener("change", (e) => {
		const option = e.target.selectedOptions[0];
		if (option?.value) {
			selectedCoords = JSON.parse(option.value);
			destinationSearch.value = option.textContent;
			destinationSelect.style.display = "none";
		}
	});

	closestButton.addEventListener("click", async () => {
		if (!globalUserPosition || !globalClosestCashPoints?.length) {
			alert("Aucun distributeur trouvé à proximité");
			return;
		}

		closestButton.disabled = true;
		const originalText = closestButton.textContent;
		closestButton.textContent = "Calcul en cours...";

		try {
			const openCashPoint = globalClosestCashPoints.find((cp) => {
				const isATM = cp.feature.properties.type === "atm";
				return isATM || isOpenCashPoint(cp.feature.properties.opening_hours);
			});

			if (!openCashPoint) throw new Error("Aucun distributeur proche n'est ouvert.");

			await showItinerary(openCashPoint.feature);
		} catch (error) {
			console.error("Erreur lors du calcul de l'itinéraire:", error);
			alert("Impossible de calculer l'itinéraire");
		} finally {
			closestButton.disabled = false;
			closestButton.textContent = originalText;
		}
	});

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
			const selectedOption = destinationSelect.selectedOptions[0];
			if (selectedOption?.dataset.index && destinationSelect._resultsCache) {
				const atm = destinationSelect._resultsCache[parseInt(selectedOption.dataset.index)];
				if (atm?.feature) {
					await showItinerary(atm.feature);
				} else {
					alert("Impossible de trouver le distributeur sélectionné");
				}
			}
		} catch (error) {
			console.error("Erreur lors du calcul de l'itinéraire:", error);
			alert("Impossible de calculer l'itinéraire");
		} finally {
			submitButton.disabled = false;
		}
	});

	updateStartPointDisplay();
	destinationSelect.style.display = "none";

	document.getElementById("locate")?.addEventListener("click", () => {
		setTimeout(() => {
			updateStartPointDisplay();
			searchATMs(destinationSearch.value);
		}, 800);
	});

	document.getElementById("selected_radius")?.addEventListener("change", () => {
		setTimeout(() => searchATMs(destinationSearch.value), 600);
	});

	globalMap?.on("moveend", () => {
		setTimeout(() => searchATMs(destinationSearch.value), 200);
	});
}
