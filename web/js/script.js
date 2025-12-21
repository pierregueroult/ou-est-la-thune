window.onload = async () => {

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

    function removeColumnsFromGeoJSON(geojson, columnsToRemove) {
        geojson.features.forEach(feature => {
            columnsToRemove.forEach(col => {
                delete feature.properties[col];
            });
        });
        return geojson;
    }

    let layer = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
            maxZoom: 15,
            attribution: '© <a href="http://www.openstreetmap.org/copyright">OSM</a>'
        }
    );

    let response = await fetch("../data/osm-france-bank.geojson");
    let data = await response.json();

    let cleanedData = removeColumnsFromGeoJSON(data, columnsToRemove);

    let geoLayer = L.geoJSON(cleanedData, {
        filter: function(feature) {
            return feature.properties.meta_name_com === "Bordeaux";
        }
    });

    let map = L.map("map", {
        center: [48.6, 3.0],
        zoom: 8,
        layers: [layer, geoLayer]
    });
};
