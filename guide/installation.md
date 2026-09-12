---
title: Installing Moonlit
description: Learn how to install and set up Moonlit for your projects
---

# Installing Moonlit

Moonlit ships as a single native binary, `moonlit`, with no separate runtime to install.

## Quick Install

The picker below shows the recommended command for your operating system, with the other channels for that platform underneath. The sections that follow describe every channel in full.

<InstallCommand />

## Installer Script

On macOS and Linux:

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/wolfware-labs/moonlit/releases/latest/download/moonlit-installer.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://github.com/wolfware-labs/moonlit/releases/latest/download/moonlit-installer.ps1 | iex
```

The installer downloads the archive for your platform from the latest GitHub release, verifies it against the checksums embedded in the script, and puts `moonlit` on your `PATH`.

## Homebrew

On macOS or Linux with Homebrew installed, install from the Wolfware tap:

```bash
brew install wolfware-labs/tap/moonlit
```

## Chocolatey

On Windows:

```powershell
choco install moonlit
```

## Windows Installer (MSI)

Every release publishes a Windows Installer package for x64. Download
[`moonlit-x86_64-pc-windows-msvc.msi`](https://github.com/wolfware-labs/moonlit/releases/latest/download/moonlit-x86_64-pc-windows-msvc.msi)
and run it, or install it unattended:

```powershell
msiexec /i moonlit-x86_64-pc-windows-msvc.msi /qn
```

The installer places `moonlit.exe` in `Program Files\moonlit\bin`, adds that directory to the system `PATH`, and registers Moonlit in Add/Remove Programs. Running a newer MSI upgrades the existing install in place rather than installing alongside it.

Because it installs per-machine, the MSI needs administrator rights — which makes it the right channel for a shared install, a managed desktop, or deployment through Group Policy or Intune. For a single-user install on your own machine, the PowerShell installer above is simpler and needs no elevation.

::: warning The MSI is not code-signed
Windows SmartScreen shows a publisher warning the first time you run it. Verify the download against its published checksum before installing:

```powershell
(Get-FileHash moonlit-x86_64-pc-windows-msvc.msi -Algorithm SHA256).Hash
```

Compare the result with [`moonlit-x86_64-pc-windows-msvc.msi.sha256`](https://github.com/wolfware-labs/moonlit/releases/latest/download/moonlit-x86_64-pc-windows-msvc.msi.sha256) from the same release.
:::

## npm

The CLI is also published to npm as `@moonlitbuild/cli`, which is convenient for Node.js projects that already manage tooling through `package.json`:

```bash
npm install -g @moonlitbuild/cli
# or run without installing:
npx @moonlitbuild/cli --help
```

## Prebuilt Archives

Every release publishes archives for:

| Platform | Architecture |
|---|---|
| Linux | x64, arm64 |
| macOS | x64 (Intel), arm64 (Apple Silicon) |
| Windows | x64 (archive, and the [MSI installer](#windows-installer-msi)) |

Download the archive for your platform from the [GitHub releases page](https://github.com/wolfware-labs/moonlit/releases), extract it, and place the `moonlit` binary somewhere on your `PATH`.

## Container Image

A container image is published to Docker Hub as `wolfware/moonlit`, useful for running Moonlit in CI without installing anything on the runner. The image treats `/work` as the pipeline's working directory, so mount your repository there:

```bash
docker run --rm -v "$PWD:/work" wolfware/moonlit:latest run
```

The entrypoint is `moonlit`, so any subcommand works in place of `run`. To reuse resolved plugins across runs instead of fetching them every time, mount the plugin cache as well:

```bash
docker run --rm \
  -v "$PWD:/work" \
  -v moonlit-cache:/home/moonlit/.cache/moonlit \
  wolfware/moonlit:latest run
```

The container runs as a non-root user with uid `1000`. A bind mount keeps the host's file ownership, so a pipeline that writes into your repository needs the container to run as you. If your host uid differs from `1000` (most CI runners), pass your own uid with the root group; the image's home directory is group-writable for exactly this case:

```bash
docker run --rm \
  --user "$(id -u):0" \
  -v "$PWD:/work" \
  wolfware/moonlit:latest run
```

Tags follow the CLI version: `1.2.3`, `1.2`, `1`, and `latest`. Images are published for `linux/amd64` and `linux/arm64`, and include `git` and CA certificates.

## GitHub Actions

```yaml
- uses: wolfware-labs/setup-moonlit@v1
- run: moonlit run
```

See [GitHub Actions](/guide/github-actions) for inputs, outputs, and caching.

## Verifying the Installation

Once installed, confirm Moonlit is on your `PATH` and check its version:

```bash
moonlit version
```

## Next Steps

Now that you have Moonlit installed, you can:

- [Create your first pipeline](./quick-start.md) with a step-by-step guide
- Learn about [Moonlit's core concepts](./concepts/how-it-works.md)
- Explore the [CLI reference](../reference/cli.md) for all available commands and options
