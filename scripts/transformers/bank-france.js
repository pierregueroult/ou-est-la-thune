// la fonction est utilisé dans le transformer donc prend une string en paramètre et doit retourner une string
function bankFranceTransformer(file1, file2) {
  const geojson = JSON.parse(file1);
  const data = JSON.parse(file2);

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

  geojson.features.forEach((feature) => {
    if (feature.properties) {
      const node = feature.properties.meta_osm_id;

      const enrichedData = data.find((item) => item.id === node);
      if (enrichedData && "panoramax_image" in enrichedData) {
        feature.properties.image = enrichedData.panoramax_image;
      }

      propertiesToRemove.forEach((prop) => {
        delete feature.properties[prop];
      });
    }
  });

  return JSON.stringify(geojson);
}

module.exports = bankFranceTransformer;
