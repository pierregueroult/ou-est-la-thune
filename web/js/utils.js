const CONSTANTS = {
    EARTH_RADIUS_METERS: 6371000,
    MAP_DEFAULTS: { ZOOM: 14 },
    TOP_CLOSEST_POINTS: 3,
    DISTANCE_THRESHOLDS: { KM_THRESHOLD: 1000 },
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

const toRad = (x) => (x * Math.PI) / 180;

function distanceMeters([lat1, lng1], [lat2, lng2]) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return CONSTANTS.EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const roundToTwoDecimals = (n) => Math.round(n * 100) / 100;
const roundToInteger = (n) => Math.round(n);

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

function formatDistance(meters) {
    return meters >= CONSTANTS.DISTANCE_THRESHOLDS.KM_THRESHOLD
        ? `${roundToTwoDecimals(meters / 1000)}km`
        : `${roundToInteger(meters)}m`;
}

function translateType(type) {
    const types = { bank: "Banque", atm: "Distributeur Automatique" };
    return types[type?.toLowerCase()] || type;
}

function translateAccessibility(access) {
    if (!access) return "Non";
    const types = { yes: "Oui", limited: "Partiel", no: "Non" };
    return types[access.toLowerCase()] || access;
}

function getOpeningHoursHTML(openingHoursString) {
    if (!openingHoursString) return "";

    if (openingHoursString === "24/7") {
        return `<table class="hours-table"><tr><td class="hours-day">Lun-Dim</td><td class="hours-time">24h/24</td></tr></table>`;
    }

    const daysMap = { Mo: "Lun", Tu: "Mar", We: "Mer", Th: "Jeu", Fr: "Ven", Sa: "Sam", Su: "Dim", PH: "Férié" };
    const normalized = openingHoursString.replace(/([0-9:]+|off)\s*,\s*(Mo|Tu|We|Th|Fr|Sa|Su|PH)/g, "$1; $2");

    let rowsHTML = "";
    for (const segment of normalized.split(";")) {
        const s = segment.trim();
        if (!s || s.includes("off")) continue;

        const idx = s.indexOf(" ");
        if (idx === -1) continue;

        let daysPart = s.substring(0, idx);
        const hoursPart = s.substring(idx + 1);

        for (const [en, fr] of Object.entries(daysMap)) {
            daysPart = daysPart.replace(new RegExp(en, "g"), fr);
        }

        rowsHTML += `<tr><td class="hours-day">${daysPart}</td><td class="hours-time">${hoursPart}</td></tr>`;
    }

    	return rowsHTML ? `<table class="hours-table">${rowsHTML}</table>` : "";
}

function isAccessible(feature) {
	const access = feature.properties.wheelchair;
	return access === "yes";
}

function isOpenNow(openingHoursString) {
	if (!openingHoursString) return false;
	if (openingHoursString === "24/7") return true;

	const now = new Date();
	const dayMap = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
	const currentDay = dayMap[now.getDay()];
	const currentMinutes = now.getHours() * 60 + now.getMinutes();

	// Simplified parser for ranges like "Mo-Fr 08:30-12:30,13:30-17:30" or "Sa 09:00-12:00"
	// and "Mo-Su 06:00-22:00"
	const segments = openingHoursString.split(";").map(s => s.trim());

	for (const segment of segments) {
		if (segment.includes("off")) continue; // Days off

		// Check if current day is covered
		const [daysPart, timesPart] = segment.split(" ", 2);
		if (!daysPart || !timesPart) continue;

		let dayMatch = false;
		if (daysPart.includes(currentDay)) {
			dayMatch = true;
		} else if (daysPart.includes("-")) {
			const [startDay, endDay] = daysPart.split("-");
			const startIdx = dayMap.indexOf(startDay);
			const endIdx = dayMap.indexOf(endDay);
			const currIdx = dayMap.indexOf(currentDay);

			if (startIdx !== -1 && endIdx !== -1 && currIdx !== -1) {
				if (endIdx >= startIdx) {
					dayMatch = currIdx >= startIdx && currIdx <= endIdx;
				} else {
					// Wrap around not commonly handled in simple Mo-Fr syntax but possible
					dayMatch = currIdx >= startIdx || currIdx <= endIdx; 
				}
			}
		}

		if (dayMatch) {
			// Check times
			const timeRanges = timesPart.split(",");
			for (const range of timeRanges) {
				const [start, end] = range.split("-");
				if (!start || !end) continue;

				const [startH, startM] = start.split(":").map(Number);
				const [endH, endM] = end.split(":").map(Number);

				const startTotal = startH * 60 + startM;
				const endTotal = endH * 60 + endM;

				if (currentMinutes >= startTotal && currentMinutes <= endTotal) {
					return true;
				}
			}
		}
	}

	return false;
}
