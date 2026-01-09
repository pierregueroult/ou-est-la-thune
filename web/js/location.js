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
  return response.json();
}

async function getLocationFromIP() {
  try {
    const userIp = await fetchUserIp();
    const geoJson = await fetchGeoJsonData();
    const ipNumber = convertIpToNumber(userIp);

    return searchLocationInGeoJson(ipNumber, geoJson);
  } catch (error) {
    console.error("Error getting location from IP:", error);
    return null;
  }
}

async function getLocationFromNavigator() {
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });

    return [position.coords.latitude, position.coords.longitude];
  } catch (error) {
    console.error("Error getting location from navigator:", error);
    return null;
  }
}

// chopper la localisation d'après le navigateur, sinon ip, sinon default_location
async function getLocation() {
  try {
    const navigatorLocation = await getLocationFromNavigator();
    if (navigatorLocation) return navigatorLocation;

    const ipLocation = await getLocationFromIP();
    if (ipLocation) return ipLocation;

    return DEFAULT_LOCATION;
  } catch (error) {
    console.error("Error getting location:", error);
    return DEFAULT_LOCATION;
  }
}
