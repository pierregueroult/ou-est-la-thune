// la fonction est utilisé dans le transformer donc prend une string en paramètre et doit retourner une string
function ipFranceTransformer(content) {
  const lines = content.trim().split("\n");

  // Map pour regrouper les plages IP par localisation
  const locationMap = new Map();

  for (const line of lines) {
    const matches = line.match(/"([^"]*)"/g);
    if (!matches || matches.length < 8) continue;

    const [ipStart, ipEnd, countryCode, country, region, city, lat, lon] =
      matches.map((m) => m.slice(1, -1));

    const locationKey = `${lat},${lon}`;

    if (!locationMap.has(locationKey)) {
      locationMap.set(locationKey, {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [parseFloat(lon), parseFloat(lat)],
        },
        properties: {
          city,
          region,
          ranges: [],
        },
      });
    }

    locationMap
      .get(locationKey)
      .properties.ranges.push([parseInt(ipStart), parseInt(ipEnd)]);
  }

  const geojson = {
    type: "FeatureCollection",
    features: Array.from(locationMap.values()),
  };

  return JSON.stringify(geojson);
}

module.exports = ipFranceTransformer;
