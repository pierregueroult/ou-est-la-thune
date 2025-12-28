#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

// Configuration
const INPUT_FILE = path.join(__dirname, "sources", "IP2LOCATION-LITE-DB5.CSV");
const OUTPUT_DIR = path.join(__dirname, "results");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "IP2LOCATION-FRANCE.geojson");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Created output directory: ${OUTPUT_DIR}`);
}

// Statistics
let totalLines = 0;
let frenchLines = 0;
let startTime = Date.now();

// Map to store unique locations with their IP ranges
const locationMap = new Map();

// Create read stream and readline interface
const readStream = fs.createReadStream(INPUT_FILE, { encoding: "utf8" });
const rl = readline.createInterface({
  input: readStream,
  crlfDelay: Infinity,
});

console.log("Starting to filter IP2LOCATION data for France...");
console.log(`Input: ${INPUT_FILE}`);
console.log(`Output: ${OUTPUT_FILE}`);
console.log("");

// Process each line
rl.on("line", (line) => {
  totalLines++;

  // Show progress every 100,000 lines
  if (totalLines % 100000 === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `Processed ${totalLines.toLocaleString()} lines (${frenchLines.toLocaleString()} French) in ${elapsed}s`,
    );
  }

  // Check if the line contains France (FR country code)
  if (line.includes('"FR"') || line.includes(',"FR",')) {
    // Parse the CSV line
    const match = line.match(/"([^"]*)"/g);
    if (match && match.length >= 8) {
      const ipFrom = match[0].replace(/"/g, "");
      const ipTo = match[1].replace(/"/g, "");
      const region = match[4].replace(/"/g, "");
      const city = match[5].replace(/"/g, "");
      const latitude = parseFloat(match[6].replace(/"/g, ""));
      const longitude = parseFloat(match[7].replace(/"/g, ""));

      // Only add if we have valid coordinates
      if (
        !isNaN(latitude) &&
        !isNaN(longitude) &&
        latitude !== 0 &&
        longitude !== 0
      ) {
        // Create a unique key for this location (rounded to 4 decimals to group nearby IPs)
        const lat = latitude.toFixed(4);
        const lon = longitude.toFixed(4);
        const locationKey = `${lat},${lon}`;

        if (!locationMap.has(locationKey)) {
          locationMap.set(locationKey, {
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            r: region || undefined,
            c: city || undefined,
            ips: [],
          });
        }

        // Add IP range to this location
        locationMap.get(locationKey).ips.push([ipFrom, ipTo]);
        frenchLines++;
      }
    }
  }
});

// Handle completion
rl.on("close", () => {
  console.log("");
  console.log("Building optimized GeoJSON...");

  // Convert map to features array with compact structure
  const features = [];
  for (const [, loc] of locationMap) {
    const props = { i: loc.ips };
    if (loc.r) props.r = loc.r;
    if (loc.c) props.c = loc.c;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [loc.lon, loc.lat],
      },
      properties: props,
    });
  }

  // Create compact GeoJSON object
  const geojson = {
    type: "FeatureCollection",
    features: features,
  };

  // Write minified GeoJSON to file (no whitespace)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(geojson), "utf8");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("");
  console.log("===============================================");
  console.log("Filtering completed!");
  console.log(`Total lines processed: ${totalLines.toLocaleString()}`);
  console.log(`French IP ranges found: ${frenchLines.toLocaleString()}`);
  console.log(`Unique locations: ${locationMap.size.toLocaleString()}`);
  console.log(`Time elapsed: ${elapsed}s`);
  console.log(`Output file: ${OUTPUT_FILE}`);

  // Get file size
  const stats = fs.statSync(OUTPUT_FILE);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`Output file size: ${fileSizeInMB} MB`);
  console.log("===============================================");
  console.log("");
  console.log("Legend:");
  console.log("  i = ip ranges [[from, to], ...]");
  console.log("  r = region");
  console.log("  c = city");
  console.log("===============================================");
});

// Handle errors
readStream.on("error", (err) => {
  console.error("Error reading input file:", err);
  process.exit(1);
});
