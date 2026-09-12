import { readFile } from "node:fs/promises";

export function parseTapTests(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(ok|not ok)\s+\d+\s+-\s+(.+?)\s*$/);
    if (!match) return [];
    return [{ status: match[1] === "ok" ? "passed" : "failed", name: match[2] }];
  });
}

export function renderSummary(tests, outcome) {
  const rows = tests.map(({ status, name }) => `| ${status} | ${name.replaceAll("|", "\\|")} |`);
  return [
    "## Test summary",
    "",
    "| Status | Test |",
    "| --- | --- |",
    ...rows,
    "",
    `**Tests:** ${tests.length}`,
    `**Overall:** ${outcome}`,
    "",
  ].join("\n");
}

if (process.argv[1]?.endsWith("ci-test-summary.mjs")) {
  const output = await readFile(process.argv[2], "utf8");
  const tests = parseTapTests(output);
  process.stdout.write(renderSummary(tests, process.env.TEST_OUTCOME ?? "unknown"));
  if (tests.length === 0) process.exitCode = 1;
}
