// la fonction est utilisé dans le transformer donc prend une string en paramètre et doit retourner un objet { filename, content }
function ipFranceTransformer(content) {
  // on passe du fichier à une liste de lignes;
  const lines = content.trim().split("\r\n");

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

  return {
    filename: "database-ip-france.geojson",
    content: JSON.stringify(geojson),
  };
}

module.exports = ipFranceTransformer;
