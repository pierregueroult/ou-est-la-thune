const DEFAULT_LOCATION = [48.85, 2.35];

function convertIpToNumber(ip) {
  const parts = ip.split(".").map((i) => parseInt(i));
  return (
    parts[0] * 16777216 + // 256^3
    parts[1] * 65536 + // 256^2
    parts[2] * 256 + // 256^1
    parts[3] // 256^0
  );
}

async function fetchUserIp() {
  const response = await fetch("https://api.ipify.org?format=json");
  if (!response.ok) {
    console.warn("Erreur lors de la récupération de l'adresse IP");
    return null;
  }
  const data = await response.json();
  return data.ip;
}

function isIpInRange(ipNumber, startIp, endIp) {
  return ipNumber >= startIp && ipNumber <= endIp;
}

function searchLocationInGeoJson(ipNumber, geoJson) {
  for (const feature of geoJson.features) {
    const ipRanges = feature.properties.ranges;

    for (const [startIp, endIp] of ipRanges) {
      if (isIpInRange(ipNumber, startIp, endIp)) {
        const [lng, lat] = feature.geometry.coordinates;
        return [lat, lng];
      }
    }
  }
  return null;
}

async function fetchGeoJsonData() {
  const response = await fetch("/data/database-ip-france.geojson");
  if (!response.ok) {
    console.warn("Erreur lors de la récupération de la base de données géographique");
    return null;
  }
  return response.json();
}

async function getLocationFromIP() {
  try {
    const userIp = await fetchUserIp();
    const geoJson = await fetchGeoJsonData();
    const ipNumber = convertIpToNumber(userIp);

    const location = searchLocationInGeoJson(ipNumber, geoJson);
    if (!location) {
      console.warn("IP non trouvée dans la base de données géographique");
    }
    return location;
  } catch (error) {
    console.warn("Erreur lors de la récupération de la position via IP:", error);
    return null;
  }
}

async function getLocationFromNavigator() {
  if (!navigator.geolocation) {
    console.warn("Géolocalisation non supportée par le navigateur");
    return null;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 60000,
      });
    });

    return [position.coords.latitude, position.coords.longitude];
  } catch (error) {
    const errorMessages = {
      1: "Permission de géolocalisation refusée",
      2: "Position indisponible",
      3: "Timeout de la géolocalisation",
    };

    const message = error.code
      ? errorMessages[error.code] || error.message
      : error.message;

    console.warn("Géolocalisation navigateur échouée:", message);
    return null;
  }
}

async function getLocation() {
  const navigatorLocation = await getLocationFromNavigator();
  if (navigatorLocation) return navigatorLocation;

  const ipLocation = await getLocationFromIP();
  if (ipLocation) return ipLocation;

  return DEFAULT_LOCATION;
}
