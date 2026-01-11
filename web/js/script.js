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

  let radiusMeters = document.getElementById("selected_radius").value;

  let response = await fetch("../data/osm-france-bank.geojson");
  let data = await response.json();

  let userPosition = await getLocation();

  let geoLayer = L.geoJSON(data, {
    filter: (feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const distance = distanceMeters(userPosition, [lat, lng]);
      return distance <= radiusMeters;
    },
  });

  let circle = L.circle(userPosition, {
    radius: radiusMeters,
    color: "blue",
    fillOpacity: 0.1,
  });

  // Création de l'icône rouge pour le marker
  const icon = new L.Icon({
  iconUrl: '../assets/images/marker-icon-2x-red.png',
  shadowUrl: '../assets/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

  // Création du marker utilisateur avec l'icône rouge
  let userMarker = L.marker(userPosition, {
    icon: icon,
  });

  let map = L.map("map", {
    center: userPosition,
    zoomControl: false,
    zoom: 14,
    attributonControl: false,
    layers: [layer, geoLayer, circle, userMarker],
  });

  // Sharing the position and website
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


  // Centring the map on user
  const locateButton = document.getElementById("locate");
  locateButton.addEventListener("click", async () => {
    try {
      locateButton.classList.add("loading");
      userPosition = await getLocation();
      map.setView(userPosition, 14);

      circle.setLatLng(userPosition);
      userMarker.setLatLng(userPosition);

      geoLayer.clearLayers();
      geoLayer.addData(data); // Updating the filter of the geolayer with new position :)
 
    } catch (error) {
      console.error("Error getting location:", error);
      alert(
        "Impossible de récupérer votre nouvelle position. Veuillez autoriser la géolocalisation.",
      );
    }
    locateButton.classList.remove("loading");
  });

  document.getElementById("zoom-in").addEventListener("click", () => {
    map.zoomIn();
  });

  document.getElementById("zoom-out").addEventListener("click", () => {
    map.zoomOut();
  });

  // Updating the radius : changing the geolayer and circle
  const radius = document.getElementById("selected_radius");
  radius.addEventListener("change", () => {

    radiusMeters = radius.value;
    // geoLayer
    geoLayer.clearLayers();
    geoLayer.addData(data); // Updating the filter of the geolayer with new radius :)
    circle.setRadius(radiusMeters);
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
