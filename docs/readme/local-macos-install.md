# Build and install Orca locally

From this checkout, after `pnpm install`:

```sh
pnpm build:mac:install
```

The command builds the current checkout, including uncommitted edits, for this
Mac's architecture. It uses the newest version tag from `origin` as its base,
keeps a newer package version when applicable, and adds
`-local.<timestamp>.<commit>` without a patch bump. If origin is unavailable,
it warns and falls back to cached tags and the package version.

The existing desktop build, native helper build, and packaging checks run before
installation. The installer verifies the signature, bundle identity, version,
and copied archive before replacing `/Applications/Orca.app`. A failed copy or
validation leaves the previous app in place. A failed final validation restores
the previous app. No backup is retained after a successful installation.

The command does not publish, restart Orca, or change its user data. Quit and
reopen Orca when ready to use the installed build. macOS signing follows the
repository's existing local build configuration.

Only the host architecture is packaged, so ordinary `pnpm install` is sufficient.
For the dual-architecture DMG/ZIP build, use `pnpm install:release` followed by
`pnpm build:mac` instead.

Local installs build native helpers only for this Mac, in parallel. The computer-use
helper keeps a separate Swift cache for each architecture and packages the binary
reported by Swift. The first build populates that cache; repeat builds reuse it.

Local code signing keeps the selected identity and signature verification but
omits Apple timestamp-server requests. Published release channels keep timestamps,
hardened runtime, notarization, and universal helpers.
