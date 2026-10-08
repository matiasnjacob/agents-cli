# npm publishing

The next planned version is `0.4.0` of the public package
[`@matiasnjacob/agents-cli`](https://www.npmjs.com/package/@matiasnjacob/agents-cli).
It installs the `agents-cli` executable and is published by the existing tag
release workflow, `.github/workflows/release.yml`. GitHub Releases continue to
provide the `.tgz`, `SHA256SUMS` and GitHub build-provenance attestation.

## One-time setup for the new package name

npm requires a package to exist before a Trusted Publisher can be configured.
The name was checked and is currently unclaimed. The following bootstrap uses
npm staged publishing to register it without publishing the v0.4.0 contents:

1. After this change is merged, check out the merged `main` branch and ensure
   Node.js 22.14 or newer, npm 11.15 or newer, an npm account with write access,
   and account-level 2FA are available.
2. From the repository root, sign in to npm if needed and stage the package:

   ```sh
   npm login
   npm stage publish --access public
   npm stage list @matiasnjacob/agents-cli
   ```

   Staging a new name registers a public `0.0.0-stage` placeholder and stages
   the current `0.4.0` contents for review. The actual staged contents are not
   available to install unless approved.
3. Reject the staged `0.4.0` entry shown by `npm stage list` so the release
   workflow can publish that version later. The rejection requires 2FA; do not
   approve this bootstrap stage:

   ```sh
   npm stage reject <stage-id>
   ```

   The placeholder remains and makes the package available for publisher
   configuration. It contains no CLI release contents.
4. On npmjs.com, open the package's **Settings → Trusted publishing** and add
   **GitHub Actions** with:

   - Organization or user: `matiasnjacob`
   - Repository: `agents-cli`
   - Workflow filename: `release.yml`
   - Allowed action: direct `npm publish`

   The workflow grants `id-token: write`, uses Node.js 24 and npm's registry.
   npm Trusted Publishing requires Node.js 22.14 or newer and npm 11.5.1 or
   newer. The release job deliberately uses Node 24 and carries no npm write
   token.
5. Create and push tag `v0.4.0` from the merged commit; the first successful publish within 2 days
   of configuring the Trusted Publisher validates the connection. npm
   expires an unvalidated publisher configuration after that window. The
   workflow refuses to publish if the tag version differs from `package.json`.

Do not approve the bootstrap stage: approving it would publish version `0.4.0`
before the tag workflow, and npm versions cannot be overwritten. The one-time
`0.0.0-stage` placeholder may appear on the public package page before the
first release. Once v0.4.0 is published, users can install with:

```sh
npm install --global @matiasnjacob/agents-cli
agents-cli setup
```

## Release order and recovery

For each tagged release, GitHub Actions validates the tag/package version,
runs typecheck, build and tests, packs and attests the GitHub tarball, publishes
the npm package through OIDC, then creates the GitHub Release with the tarball
and checksum.

npm publication is immutable. If npm succeeds but `gh release create` fails,
do not rerun npm publication for that version. Retry only the GitHub Release
creation with the already-generated assets from the successful workflow run,
or use the workflow's assets to create the GitHub Release manually. A failed
npm publication stops the job before GitHub Release creation; fix the trust or
package issue and retry only if npm confirms that the version was not published.
For an existing tag whose original workflow failed before npm accepted the
package, merge the fix and manually run **Release** from `main` with the
`release_tag` input set to the existing tag. The workflow checks out that tag,
revalidates its package version, and publishes its attested tarball. For
example:

```sh
gh workflow run release.yml --ref main -f release_tag=v0.4.0
```

## Current status

The workflow and package metadata are prepared for v0.4.0. The npm package
bootstrap, Trusted Publisher configuration, tag and publication are maintainer
actions that remain pending. See the [integration validation record](integration-validation.md)
for current test evidence.

References: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/),
[npm staged publishing](https://docs.npmjs.com/staged-publishing/), and
[`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
