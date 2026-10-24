#!/usr/bin/env node

/**
 * Print all environment variables
 */

const envVars = process.env;
const sortedKeys = Object.keys(envVars).sort();

console.log("Environment Variables:");
console.log("=".repeat(80));

for (const key of sortedKeys) {
	console.log(`${key}=${envVars[key]}`);
}

console.log("=".repeat(80));
console.log(`Total: ${sortedKeys.length} environment variables`);
