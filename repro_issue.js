const { parseOpeningHours } = require('./scripts/parse-opening-hours');

const testInput = "Sur rendez vous"; // This is mapped to null in MANUAL_OVERRIDES

console.log("Input:", testInput);

try {
    const result = parseOpeningHours(testInput);
    if (result === null) {
        console.log("parseOpeningHours returned null (SUCCESS: Fix verified)");
    } else {
        console.log("parseOpeningHours returned valid object (FAILURE: Issue persists)");
        // console.log("Result:", JSON.stringify(result, null, 2));
    }
} catch (e) {
    console.error("parseOpeningHours crashed:", e.message);
}

// Regression test
const testInput2 = "H24";
console.log("\nInput:", testInput2);
try {
    const result2 = parseOpeningHours(testInput2);
    if (result2 !== null) {
        console.log("parseOpeningHours returned object for H24 (SUCCESS: Regression test passed)");
    } else {
        console.log("parseOpeningHours returned null for H24 (FAILURE: Regression test failed)");
    }
} catch (e) {
    console.error("parseOpeningHours crashed on H24:", e.message);
}
