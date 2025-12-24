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
            {enableHighAccuracy : true}
        );
    });
}

const RADIUS_METERS = 2000;

/* Define the distance between 2 coords (vol d'oiseau)
    HAVERSINE FORMULA */
function distanceMeters([lat1, lng1], [lat2, lng2]) {
    const R = 6371000; // Earth rayon
    const toRad = x => x * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const distanceHaversineFormula =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const distance = 2 * Math.atan2(Math.sqrt(distanceHaversineFormula), Math.sqrt(1 - distanceHaversineFormula));
    return R * distance;
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
        console.log(userPosition);
    } catch (error) {
        console.error(error);
        userPosition = [48.85, 2.35]; // Coord of Paris if no response 
    }

    let geoLayer = L.geoJSON(cleanedData, {
        filter: feature => {
            const [lng, lat] = feature.geometry.coordinates;
            const distance = distanceMeters(userPosition, [lat, lng]);
            return distance <= RADIUS_METERS;
        }
    });

    let map = L.map("map", {
        center: userPosition,
        zoom: 14,
        layers: [layer, geoLayer]
    });

    L.circle(userPosition, {
        radius: RADIUS_METERS,
        color: "blue",
        fillOpacity: 0.1
    }).addTo(map);
};
