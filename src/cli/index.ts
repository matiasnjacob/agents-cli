#!/usr/bin/env node

import { parseCliArgs, usage } from "./parse.js";

const result = parseCliArgs(process.argv.slice(2));

if (result.kind === "help") {
  console.log(usage());
  process.exit(0);
}

if (result.kind === "error") {
  console.error(`Error: ${result.message}`);
  console.error(usage());
  process.exit(2);
}

console.log(JSON.stringify(result.config, null, 2));
