const PARIS = [48.85, 2.35];

function ipToNumber(ip) {
  const parts = ip.split(".").map((part) => parseInt(part, 10));
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

async function getUserIP() {
  try {
    const response = await fetch("https://api.ipify.org?format=json"); // 100% legal
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error("Error fetching user IP:", error);
    throw error;
  }
}

function findLocationByIP(ipAddress, ipGeoJSON) {
  const ipNum = ipToNumber(ipAddress);

  for (const feature of ipGeoJSON.features) {
    const ipRanges = feature.properties.i;

    for (const range of ipRanges) {
      const [startIP, endIP] = range;
      const startIPNum = parseInt(startIP, 10);
      const endIPNum = parseInt(endIP, 10);

      if (ipNum >= startIPNum && ipNum <= endIPNum) {
        return {
          coordinates: feature.geometry.coordinates,
          region: feature.properties.r,
          city: feature.properties.c,
          lat: feature.geometry.coordinates[1],
          lng: feature.geometry.coordinates[0],
        };
      }
    }
  }

  return null;
}

async function getLocationFromIP() {
  try {
    const userIP = await getUserIP();
    console.log("User IP:", userIP);

    const response = await fetch("/data/ip.geojson");
    const ipGeoJSON = await response.json();

    const location = findLocationByIP(userIP, ipGeoJSON);

    if (location) {
      console.log("IP Location found:", location.city, location.region);
      return [location.lat, location.lng];
    } else {
      console.warn("IP location not found, using default location");
      return PARIS;
    }
  } catch (error) {
    console.error("Error getting location from IP:", error);
    return PARIS;
  }
}

async function getLocationWithFallback() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log("Using browser geolocation");
        resolve([pos.coords.latitude, pos.coords.longitude]);
      },
      async (error) => {
        console.warn("Browser geolocation failed or denied:", error.message);
        console.log("Falling back to IP-based geolocation...");
        const ipLocation = await getLocationFromIP();
        resolve(ipLocation);
      },
      { enableHighAccuracy: true },
    );
  });
}
