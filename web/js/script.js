function removeColumnsFromGeoJSON(geojson, columnsToRemove) {
    geojson.features.forEach(feature => {
        columnsToRemove.forEach(col => {
            delete feature.properties[col];
        });
    });
    return geojson;
}

function getLocation() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            pos => resolve([pos.coords.latitude, pos.coords.longitude]),
            error => reject(error),
            {enableHighAccuracy : false}
        );
    });
}

// Retourne la taille de la surface de rayon x
// aire = π × (diam/2)^2
// x est un rayon donc = à diam / 2
function toSurface(x){
    return Math.PI * (x)**2;
}

// Pour la surface en param, retourne la taille du rayon
// diam = 2 × √(aire / π)
// rayon = diam * 2 donc = √(aire / π)
function fromSurface(s){
    return Math.sqrt(s / Math.PI);
}

const RADIUS = 0.045;
const SURFACE_MAX = toSurface(RADIUS);
const DEGREE_TO_METERS = 111000; // Converting approximatly
const RADIUS_METERS = fromSurface(SURFACE_MAX) * DEGREE_TO_METERS;


function distanceSurface([lat1, lng1], [lat2, lng2]) {
    const dx = lng2 - lng1;
    const dy = lat2 - lat1;
    return toSurface(Math.sqrt(dx*dx + dy*dy));
}

// Useless columns of our dataset
const columnsToRemove = [
    "bank_id_code",
    "brand_wikidata",
    "meta_code_com",
    "meta_code_dep",
    "meta_code_reg",
    "meta_first_update",
    "meta_last_update",
    "meta_osm_id",
    "meta_users_number",
    "meta_versions_number"
];

window.onload = async () => {

    let layer = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
            maxZoom: 20
        }
    );

    let response = await fetch("../data/osm-france-bank.geojson");
    let data = await response.json();

    let cleanedData = removeColumnsFromGeoJSON(data, columnsToRemove);

    let userPosition;
    try {
        userPosition = await getLocation();
    } catch (error) {
        console.error(error);
        userPosition = [48.85, 2.35]; // Coord of Paris if no response 
    }

    let geoLayer = L.geoJSON(cleanedData, {
        filter: feature => {
            const [lng, lat] = feature.geometry.coordinates;
            const distance = distanceSurface(userPosition, [lat, lng]);
            return distance <= SURFACE_MAX;
        }
    });

    let map = L.map("map", {
        center: userPosition,
        zoom: 12,
        layers: [layer, geoLayer]
    });

    L.circle(userPosition, {
        radius: RADIUS_METERS,
        color: "blue",
        fillOpacity: 0.1
    }).addTo(map);
};
