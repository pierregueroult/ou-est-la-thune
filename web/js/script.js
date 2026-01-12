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

function addEventOnPoint(feature, layer) {
  layer.on("click", () => {
    const p = feature.properties;
    if (p.name != null) console.log("Distributeur " + p.name);
    if (p.brand != null) console.log("Banque " + p.brand);
    if (p.type != null) console.log("Type " + p.type);
    if (p.operator != null) console.log("Opérateur : " + p.operator);
    if (p.wheelchair != null)
      console.log(
        "Accessible aux personnes à mobilité réduite : " + p.wheelchair,
      );
    if (p.opening_hours != null) console.log("Ouverte de " + p.opening_hours);
    if (
      p.meta_name_com != null &&
      p.meta_name_dep != null &&
      p.meta_name_reg != null
    )
      console.log(
        "Située " +
          p.meta_name_com +
          " / " +
          p.meta_name_dep +
          " / " +
          p.meta_name_reg,
      );
    if (p.meta_osm_url != null)
      console.log("Lien OpenStreetMap : " + p.meta_osm_url);
  });
}

function createTileLayer() {
  return L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
    },
  );
}

async function fetchGeoData() {
  const response = await fetch("../data/osm-france-bank.geojson");
  return await response.json();
}

function createGeoLayer(data, userPosition, radiusMeters) {
  return L.geoJSON(data, {
    filter: (feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const distance = distanceMeters(userPosition, [lat, lng]);
      return distance <= radiusMeters;
    },
    onEachFeature: addEventOnPoint,
  });
}

function createCircle(userPosition, radiusMeters) {
  return L.circle(userPosition, {
    radius: radiusMeters,
    color: "blue",
    fillOpacity: 0.1,
  });
}

function createRedIcon() {
  return new L.Icon({
    iconUrl: "../assets/images/marker-icon-2x-red.png",
    shadowUrl: "../assets/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

function createUserMarker(userPosition, icon) {
  return L.marker(userPosition, {
    icon: icon,
  });
}

function createMap(userPosition, layer, geoLayer, circle, userMarker) {
  return L.map("map", {
    center: userPosition,
    zoomControl: false,
    zoom: 14,
    attributonControl: false,
    layers: [layer, geoLayer, circle, userMarker],
  });
}

async function updateUserLocation(map, circle, userMarker, data, state) {
  try {
    const newPosition = await getLocation();
    map.setView(newPosition, 14);

    circle.setLatLng(newPosition);
    userMarker.setLatLng(newPosition);
    state.userPosition = newPosition;
    map.removeLayer(state.geoLayer);

    const newGeoLayer = createGeoLayer(data, newPosition, state.radiusMeters);
    newGeoLayer.addTo(map);
    state.geoLayer = newGeoLayer;

    return newPosition;
  } catch (error) {
    console.error("Error getting location:", error);
    alert(
      "Impossible de récupérer votre nouvelle position. Veuillez autoriser la géolocalisation.",
    );
    throw error;
  }
}

function setupLocateButton(map, circle, userMarker, data, state) {
  const locateButton = document.getElementById("locate");
  locateButton.addEventListener("click", async () => {
    await updateUserLocation(map, circle, userMarker, data, state);
  });
}

function setupZoomControls(map) {
  document.getElementById("zoom-in").addEventListener("click", () => {
    map.zoomIn();
  });

  document.getElementById("zoom-out").addEventListener("click", () => {
    map.zoomOut();
  });
}

function updateRadius(map, circle, data, state, newRadiusMeters) {
  state.radiusMeters = newRadiusMeters;
  map.removeLayer(state.geoLayer);

  const newGeoLayer = createGeoLayer(data, state.userPosition, newRadiusMeters);
  newGeoLayer.addTo(map);

  circle.setRadius(newRadiusMeters);
  state.geoLayer = newGeoLayer;
}

function setupRadiusControl(map, circle, data, state) {
  const radius = document.getElementById("selected_radius");
  radius.addEventListener("change", () => {
    const newRadiusMeters = radius.value;
    updateRadius(map, circle, data, state, newRadiusMeters);
  });
}

window.onload = async () => {
  const radiusMeters = document.getElementById("selected_radius").value;

  const layer = createTileLayer();
  const data = await fetchGeoData();
  const userPosition = await getLocation();

  const geoLayer = createGeoLayer(data, userPosition, radiusMeters);
  const circle = createCircle(userPosition, radiusMeters);
  const icon = createRedIcon();
  const userMarker = createUserMarker(userPosition, icon);

  const map = createMap(userPosition, layer, geoLayer, circle, userMarker);

  const state = {
    userPosition: userPosition,
    radiusMeters: radiusMeters,
    geoLayer: geoLayer,
  };

  setupLocateButton(map, circle, userMarker, data, state);
  setupZoomControls(map);
  setupRadiusControl(map, circle, data, state);
};
