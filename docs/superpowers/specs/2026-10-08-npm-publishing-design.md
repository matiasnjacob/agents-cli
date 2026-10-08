# npm distribution design

## Problem

Installing from a GitHub Release currently requires downloading the package and checksum, verifying the checksum, and installing the local tarball. The repository already contains a checksum-verifying shell installer, but a standard npm command would be easier to discover and repeat.

The unscoped npm name `agents-cli` is already registered by another publisher. This project will use the selected package identity `@matiasnjacob/agents-cli` while keeping the executable name `agents-cli`.

## Goals

- Install globally with `npm install --global @matiasnjacob/agents-cli`.
- Keep GitHub Releases as a distribution channel, including the tarball, checksum, and build provenance.
- Publish the npm package from the existing tag-triggered GitHub Actions release workflow.
- Use npm Trusted Publishing (OIDC), avoiding a long-lived npm write token.
- Publish only after release checks pass and only when the package version matches the pushed `vX.Y.Z` tag.
- Document npm as the simplest installation method while retaining checksum-verified GitHub Release installation as an alternative.

## Design

Update package metadata to use the scoped name, declare the canonical repository URL and public access, and retain the `agents-cli` bin mapping. The GitHub Release asset filename remains `agents-cli-X.Y.Z.tgz` so the existing installer continues to work.

Extend `.github/workflows/release.yml`, which already runs on `v*` tags, to use Node.js 24 for publishing. The workflow will install locked dependencies, typecheck, build, run tests, verify that `package.json` version matches the tag, build/checksum/attest the tarball, publish the package to npm, then create the GitHub Release with the tarball and checksum. The workflow already has `id-token: write`; configure `actions/setup-node` for `https://registry.npmjs.org` so npm can use OIDC. Trusted publishing automatically adds npm provenance.

The next release tag will be `v0.4.0`; the already-published `v0.3.0` will not be republished. Before tagging `v0.4.0`, a maintainer must configure the package's trusted publisher on npmjs.com for GitHub Actions, repository `matiasnjacob/agents-cli`, workflow `release.yml`, and direct `npm publish` permission. Create that trust configuration close to the release because npm requires its first successful publish within two days.

README installation guidance will put `npm install --global @matiasnjacob/agents-cli` first, followed by `agents-cli setup`. Keep the checksum-verified tarball and shell installer instructions as alternatives. Keep the release badge dynamic and linked to the latest GitHub Release.

## Release failure behavior

npm and GitHub Releases do not provide an atomic cross-registry transaction. Publish to npm only after all tests and package checks pass, then create the GitHub Release. If GitHub Release creation fails after npm succeeds, retry only the GitHub Release publication from the same tag and artifact; do not attempt to republish an immutable npm version.

## Validation

- Confirm package metadata, executable mapping, and package contents with `npm pack --dry-run`.
- Test a clean local installation from the packed tarball and run `agents-cli --version`, `agents-cli --help`, and `agents-cli doctor` in a prepared test project.
- Add workflow checks for version/tag alignment, OIDC publishing configuration, and preserving GitHub Release assets.
- Run typecheck, build, and the complete test suite.
- Verify the GitHub Actions workflow can be configured as npm's trusted publisher before creating `v0.4.0`.

## Scope

Homebrew is deferred. It would add a separate tap/formula and another release-maintenance path without improving installation for the current Node.js-targeted package.
