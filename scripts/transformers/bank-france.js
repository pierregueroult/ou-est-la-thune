// la fonction est utilisé dans le transformer donc prend une string en paramètre et doit retourner une string
function bankFranceTransformer(content) {
  const geojson = JSON.parse(content);

  const propertiesToRemove = [
    "bank_id_code",
    "brand_wikidata",
    "meta_code_com",
    "meta_code_dep",
    "meta_code_reg",
    "meta_first_update",
    "meta_last_update",
    "meta_osm_id",
    "meta_users_number",
    "meta_versions_number",
  ];

  if (geojson.features && Array.isArray(geojson.features)) {
    geojson.features.forEach((feature) => {
      if (feature.properties) {
        propertiesToRemove.forEach((prop) => {
          delete feature.properties[prop];
        });
      }
    });
  }

  return JSON.stringify(geojson);
}

module.exports = bankFranceTransformer;
