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

function addEventOnPoint(feature, userPosition) {
  const p = feature.properties;
  const container = document.createElement("div");
  container.className = "bank-popup";

  if (p.image) {
    const img = document.createElement("img");
    img.src = p.image;
    img.alt = p.brand || p.name || "Image de la banque";
    img.className = "bank-popup-image";
    container.appendChild(img);
  }

  if (p.brand || p.name) {
    const title = document.createElement("h3");
    title.textContent = p.brand || p.name;
    container.appendChild(title);
  }

  const list = document.createElement("ul");
  list.className = "bank-details";

  const addListItem = (label, value) => {
    if (!value) return;
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    li.appendChild(strong);
    li.appendChild(document.createTextNode(value));
    list.appendChild(li);
  };

  addListItem("Type", p.type);
  addListItem("Opérateur", p.operator);
  addListItem("Accessibilité", p.wheelchair);
  addListItem("Horaires", p.opening_hours);

  // Address/Location
  const locationParts = [p.meta_name_com, p.meta_name_dep].filter(Boolean);
  if (locationParts.length > 0) {
    addListItem("Lieu", locationParts.join(", "));
  }

  if (p.meta_osm_url) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = p.meta_osm_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Voir sur OpenStreetMap";
    li.appendChild(link);
    list.appendChild(li);
  }

  container.appendChild(list);

  const itineraryButton = document.createElement("button");
  itineraryButton.className = "distance-badge";
  itineraryButton.textContent = "Lancer l'initéraire"
  itineraryButton.addEventListener("click", () => {
    itineraryCalcul(userPosition, feature.geometry.coordinates);
  });
  container.appendChild(itineraryButton);

  feature._layer.bindPopup(container);
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

async function fetchOutlinesDepartmentsData() {
  const response = await fetch("../data/departements-france.geojson");
  return await response.json();
}

async function fetchRoadsData(numDep) {
  const response = await fetch("../data/roads/roads-france-" + numDep + ".geojson");
  return await response.json();
}

function createGeoLayer(data, userPosition, radiusMeters) {
  return L.geoJSON(data, {
    filter: (feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const distance = distanceMeters(userPosition, [lat, lng]);
      return distance <= radiusMeters;
    },
    onEachFeature: (feature, layer) => {
      feature._layer = layer; // For every feature, we associate the according layer (used for closest cashPoints)
      addEventOnPoint(feature, userPosition);
    }
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

    state.closestCashPoints = defineClosestCashPoints(data, newPosition);
    printClosestCashPoints(state.closestCashPoints);

    return newPosition;
  } catch (error) {
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

function setupClicOnClosestCashPoints(closestCashPoints, map) {
  const cards = document.getElementsByClassName("card-left");

  for (let i = 0; i < closestCashPoints.length; i++) {
    const card = cards[i];
    const cashPoint = closestCashPoints[i];
    const feature = cashPoint.feature;

    card.addEventListener("click", () => {
      const [lng, lat] = feature.geometry.coordinates;
      map.setView([lat, lng], 16);
      feature._layer.openPopup();
    });
  }
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

// Define the 3 closest cash points from user's position
function defineClosestCashPoints(data, userPosition) {

  const distances = data.features.map((feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const distance = distanceMeters(userPosition, [lat, lng]);
    return {feature, distance};
  });

  distances.sort((a, b) => a.distance - b.distance); // Selecting the closest
  return distances.slice(0, 3);
}

function roundNumberDecimalPoint(number){
  return Math.round(number * 100) / 100;
}

function roundNumber(number){
  return Math.round(number);
}

// Printing on the aside menu informations on the closest cash points
function printClosestCashPoints(closestCashPoints) {
  const cards = document.getElementsByClassName("card-left");

  for (let i = 0; i < closestCashPoints.length; i++) {
    const card = cards[i];
    const cashPoint = closestCashPoints[i];

    card.getElementsByClassName("bank-name")[0].textContent = cashPoint.feature.properties.brand;
    card.getElementsByClassName("bank-city")[0].textContent = cashPoint.feature.properties.meta_name_com;
    if(cashPoint.distance >= 1000){
      card.getElementsByClassName("distance-badge")[0].textContent = roundNumberDecimalPoint(cashPoint.distance / 1000) + "km";
    }
    else{
      card.getElementsByClassName("distance-badge")[0].textContent = roundNumber(cashPoint.distance) + "m";
    }
  }
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

  let closestCashPoints = defineClosestCashPoints(data, userPosition);
  printClosestCashPoints(closestCashPoints);

  const state = {
    userPosition: userPosition,
    radiusMeters: radiusMeters,
    geoLayer: geoLayer,
    closestCashPoints: closestCashPoints
  };

  setupLocateButton(map, circle, userMarker, data, state);
  setupZoomControls(map);
  setupRadiusControl(map, circle, data, state);
  setupClicOnClosestCashPoints(closestCashPoints, map);
};