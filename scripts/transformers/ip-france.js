const { streamToString } = require("../utils.js");
const { writeResult } = require("../file-system.js");

// la fonction est utilisé comme transformer et prends donc autant de streams en entrée que d'inputfiles
// on return les noms de fichiers produits pour log après
async function ipFranceTransformer(stream) {
  // le fichier est petit, on peut le lire en entier
  const content = await streamToString(stream);

  // on passe du fichier à une liste de lignes;
  const lines = content.trim().split("\r\n");

  // on stocke les données dans un Map pour être
  // sur d'avoir une seule feature par coordonnées
  const locations = new Map();

  lines.forEach((line) => {
    // on vire les guillemets du csv + on sépare par colonnes
    const parts = line.replaceAll('"', "").split(",");

    const lat = parts[6],
      long = parts[7],
      rangeStart = parts[0],
      rangeStop = parts[1];

    const key = `${lat},${long}`;
    let feature = locations.get(key);

    if (!feature) {
      feature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [parseFloat(long), parseFloat(lat)],
        },
        properties: {
          // On peux ajouter la ville et la région si besoin
          ranges: [],
        },
      };
      locations.set(key, feature);
    }

    feature.properties.ranges.push([parseInt(rangeStart), parseInt(rangeStop)]);
  });

  const geojson = {
    type: "FeatureCollection",
    features: Array.from(locations.values()),
  };

  await writeResult("database-ip-france.geojson", JSON.stringify(geojson));

  return ["database-ip-france.geojson"];
}

module.exports = ipFranceTransformer;
