#!/usr/bin/env bash
set -euo pipefail

repository="${AGENTS_CLI_REPOSITORY:-matiasnjacob/agents-cli}"
requested_version="${AGENTS_CLI_VERSION:-${1:-}}"
api="https://api.github.com/repos/${repository}/releases/latest"

for command in curl node npm; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'Error: %s is required. Install Node.js 20+ and curl, then retry.\n' "$command" >&2
    exit 1
  }
done

if [[ -n "$requested_version" ]]; then
  tag="${requested_version#v}"
  tag="v${tag}"
else
  release_json=$(curl --fail --silent --show-error --location \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2022-11-28' "$api")
  tag=$(printf '%s' "$release_json" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      const release = JSON.parse(input);
      if (!release.tag_name || release.draft || release.prerelease) process.exit(1);
      process.stdout.write(release.tag_name);
    });
  ') || {
    printf 'Error: could not resolve a stable GitHub Release for %s.\n' "$repository" >&2
    exit 1
  }
fi

version="${tag#v}"
asset="agents-cli-${version}.tgz"
base="https://github.com/${repository}/releases/download/${tag}"
temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/agents-cli-install.XXXXXX")
trap 'rm -rf "$temporary_directory"' EXIT

printf 'Downloading agents-cli %s from %s...\n' "$tag" "$repository"
curl --fail --silent --show-error --location "$base/$asset" --output "$temporary_directory/$asset"
curl --fail --silent --show-error --location "$base/SHA256SUMS" --output "$temporary_directory/SHA256SUMS"

expected=$(awk -v asset="$asset" '$2 == asset { print $1; exit }' "$temporary_directory/SHA256SUMS")
[[ "$expected" =~ ^[[:xdigit:]]{64}$ ]] || {
  printf 'Error: checksum for %s was not found.\n' "$asset" >&2
  exit 1
}
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$temporary_directory/$asset" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$temporary_directory/$asset" | awk '{print $1}')
fi
[[ "$actual" == "$expected" ]] || {
  printf 'Error: checksum verification failed for %s.\n' "$asset" >&2
  exit 1
}

npm install --global "$temporary_directory/$asset"
printf 'agents-cli %s installed successfully.\n' "$tag"
