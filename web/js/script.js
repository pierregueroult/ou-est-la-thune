const RADIUS_METERS = 2000;

/* Define the distance between 2 coords (crow fly)
    HAVERSINE FORMULA */
function distanceMeters([lat1, lng1], [lat2, lng2]) {
  const R = 6371000; // Earth radius (rayon)
  const toRad = (x) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const distanceHaversineFormula =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const distance =
    2 *
    Math.atan2(
      Math.sqrt(distanceHaversineFormula),
      Math.sqrt(1 - distanceHaversineFormula),
    );
  return R * distance;
}

window.onload = async () => {
  let layer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
    },
  );

  let response = await fetch("../data/osm-france-bank.geojson");
  let data = await response.json();

  let userPosition = await getLocation();

  let geoLayer = L.geoJSON(data, {
    filter: (feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const distance = distanceMeters(userPosition, [lat, lng]);
      return distance <= RADIUS_METERS;
    },
  });

  let map = L.map("map", {
    center: userPosition,
    zoomControl: false,
    zoom: 14,
    attributonControl: false,
    layers: [layer, geoLayer],
  });

  L.circle(userPosition, {
    radius: RADIUS_METERS,
    color: "blue",
    fillOpacity: 0.1,
  }).addTo(map);

  const shareButton = document.getElementById("share");

  shareButton.addEventListener("click", async () => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${center.lat.toFixed(6)}&lng=${center.lng.toFixed(6)}&zoom=${zoom}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Où est la thune ?",
          text: "Découvrez les banques autour de vous",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);

        const originalText = shareButton.querySelector("span").textContent;
        shareButton.querySelector("span").textContent = "Copied!";
        setTimeout(() => {
          shareButton.querySelector("span").textContent = originalText;
        }, 2000);
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  });

  const locateButton = document.getElementById("locate");
  locateButton.addEventListener("click", async () => {
    try {
      locateButton.classList.add("loading");
      const newPosition = await getLocation();

      map.setView(newPosition, 14);

      map.eachLayer((layer) => {
        if (layer instanceof L.Circle) {
          map.removeLayer(layer);
        }
      });

      L.circle(newPosition, {
        radius: RADIUS_METERS,
        color: "blue",
        fillOpacity: 0.1,
      }).addTo(map);

      map.eachLayer((layer) => {
        if (layer instanceof L.GeoJSON) {
          map.removeLayer(layer);
        }
      });

      const newGeoLayer = L.geoJSON(cleanedData, {
        filter: (feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          const distance = distanceMeters(newPosition, [lat, lng]);
          return distance <= RADIUS_METERS;
        },
      });

      newGeoLayer.addTo(map);

      locateButton.classList.remove("loading");
    } catch (error) {
      console.error("Error getting location:", error);
      locateButton.classList.remove("loading");
      alert(
        "Impossible de récupérer votre position. Veuillez autoriser la géolocalisation.",
      );
    }
  });

  document.getElementById("zoom-in").addEventListener("click", () => {
    map.zoomIn();
  });

  document.getElementById("zoom-out").addEventListener("click", () => {
    map.zoomOut();
  });

  // Gestion des paramètres URL pour le partage
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("lat") && urlParams.has("lng") && urlParams.has("zoom")) {
    const lat = parseFloat(urlParams.get("lat"));
    const lng = parseFloat(urlParams.get("lng"));
    const zoom = parseInt(urlParams.get("zoom"));

    if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
      map.setView([lat, lng], zoom);
    }
  }
};
