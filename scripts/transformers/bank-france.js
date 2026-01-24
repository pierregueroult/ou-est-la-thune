const { streamToString } = require("../utils.js");
const { writeResult } = require("../file-system.js");

// la fonction est utilisé comme transformer et prends donc autant de streams en entrée que d'inputfiles
// on return les noms de fichiers produits pour log après
async function bankFranceTransformer(stream1, stream2) {
  // les fichiers sont petits, on peut les lire en entier
  const file1 = await streamToString(stream1);
  const file2 = await streamToString(stream2);

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

  await writeResult("osm-france-bank.geojson", JSON.stringify(geojson));

  return ["osm-france-bank.geojson"];
}

module.exports = bankFranceTransformer;
