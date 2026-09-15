# Changelog

## [0.1.8](https://github.com/quynhonsemiconductor/mcp-tools/compare/v0.1.7...v0.1.8) (2026-09-15)


### ✨ Features

* **bundled:** upgrade chrome-devtools-mcp to 1.9.0 ([#43](https://github.com/quynhonsemiconductor/mcp-tools/issues/43)) ([ddf90ec](https://github.com/quynhonsemiconductor/mcp-tools/commit/ddf90ecac5e2e36733ce9fa937603a71ae4d3fbf))
* **bundler:** let a server choose how its dependencies are installed ([#41](https://github.com/quynhonsemiconductor/mcp-tools/issues/41)) ([c7fed10](https://github.com/quynhonsemiconductor/mcp-tools/commit/c7fed10b5260c7a002d72c8fe98e3c2d6ead4388))

## [0.1.7](https://github.com/quynhonsemiconductor/mcp-tools/compare/v0.1.6...v0.1.7) (2026-09-14)


### 🐛 Bug Fixes

* **build:** stop a tagged release that cannot sign anyone in ([#37](https://github.com/quynhonsemiconductor/mcp-tools/issues/37)) ([f38f8a3](https://github.com/quynhonsemiconductor/mcp-tools/commit/f38f8a3f31005c7d47eaec7cbff81e4638836cce))

## [0.1.6](https://github.com/quynhonsemiconductor/mcp-tools/compare/v0.1.5...v0.1.6) (2026-09-14)


### 🐛 Bug Fixes

* **microsoft-365:** make the Teams channel tool actually work ([#35](https://github.com/quynhonsemiconductor/mcp-tools/issues/35)) ([ced544e](https://github.com/quynhonsemiconductor/mcp-tools/commit/ced544e8dd3c7a60da67bbf79a603a2a79350547))

## [0.1.5](https://github.com/quynhonsemiconductor/mcp-tools/compare/v0.1.4...v0.1.5) (2026-09-14)


### 🐛 Bug Fixes

* release the binary startup fix, which release-please could not parse ([#33](https://github.com/quynhonsemiconductor/mcp-tools/issues/33)) ([b51263b](https://github.com/quynhonsemiconductor/mcp-tools/commit/b51263b5648a24a3786eaa7f7f0f05e3d71c3d2a))

## [0.1.4](https://github.com/quynhonsemiconductor/mcp-tools/compare/v0.1.3...v0.1.4) (2026-09-14)


### ✨ Features

* **microsoft-365:** read the calendar and Teams channel posts ([#31](https://github.com/quynhonsemiconductor/mcp-tools/issues/31)) ([022b118](https://github.com/quynhonsemiconductor/mcp-tools/commit/022b1180fb5b6bb724548220c6cfb86c4750e927))
* **microsoft-365:** read the documents people actually store ([#26](https://github.com/quynhonsemiconductor/mcp-tools/issues/26)) ([2e7c60b](https://github.com/quynhonsemiconductor/mcp-tools/commit/2e7c60b130574ef0c381749d68bd58c7d881f5d4))
* **microsoft-365:** search Outlook and read Teams conversations ([#30](https://github.com/quynhonsemiconductor/mcp-tools/issues/30)) ([1d0bbdb](https://github.com/quynhonsemiconductor/mcp-tools/commit/1d0bbdb2fc9461c692020618714ddf5a5f115ca0))


### 🐛 Bug Fixes

* **deps:** clear both critical advisories and every high one ([#23](https://github.com/quynhonsemiconductor/mcp-tools/issues/23)) ([0a1aa18](https://github.com/quynhonsemiconductor/mcp-tools/commit/0a1aa188e8c0d51fecb6a7c466ab78d480160a9b))

## [0.1.3](https://github.com/quynhonsemiconductor/mcp-tools/compare/v0.1.2...v0.1.3) (2026-09-13)


### 🐛 Bug Fixes

* **release:** upload the Windows bundle under the name it is actually written to ([#20](https://github.com/quynhonsemiconductor/mcp-tools/issues/20)) ([db2afa2](https://github.com/quynhonsemiconductor/mcp-tools/commit/db2afa23f36eda5cfe00b407c58c43dda4f0ec15))

## [0.1.2](https://github.com/quynhonsemiconductor/mcp-tools/compare/v0.1.1...v0.1.2) (2026-09-13)


### 🐛 Bug Fixes

* **release:** install each target's keyring binding so all five platforms build ([#18](https://github.com/quynhonsemiconductor/mcp-tools/issues/18)) ([0c48ff1](https://github.com/quynhonsemiconductor/mcp-tools/commit/0c48ff113d14a3d796e8cb06a06e6cae3f514bff))

## [0.1.1](https://github.com/quynhonsemiconductor/mcp-tools/compare/v0.1.0...v0.1.1) (2026-09-13)


### ✨ Features

* **microsoft-365:** sign in as yourself for OneDrive and SharePoint ([#12](https://github.com/quynhonsemiconductor/mcp-tools/issues/12)) ([e5c79dc](https://github.com/quynhonsemiconductor/mcp-tools/commit/e5c79dc32fc19d0f908b1851b062c932dc121033))


### 🐛 Bug Fixes

* **deps:** update dependency js-yaml to v4.3.2 [security] ([#3](https://github.com/quynhonsemiconductor/mcp-tools/issues/3)) ([48ed751](https://github.com/quynhonsemiconductor/mcp-tools/commit/48ed7510886195fcd75361765ace168ce9a0e70e))
* **test:** make the local MCP catalogue injectable so tests stop leaking ([#2](https://github.com/quynhonsemiconductor/mcp-tools/issues/2)) ([052466a](https://github.com/quynhonsemiconductor/mcp-tools/commit/052466ae118ceb558dfb5fdf10718dd2d5166959))
* **tools:** clipboard buffer, OAuth sign-in URL, and Dependabot pagination ([#6](https://github.com/quynhonsemiconductor/mcp-tools/issues/6)) ([69ecbcd](https://github.com/quynhonsemiconductor/mcp-tools/commit/69ecbcd139da48295c28e35de4030be9ce7cb50f))

## Changelog

Maintained by [release-please](https://github.com/googleapis/release-please), which
derives entries from [Conventional Commit](https://www.conventionalcommits.org/)
messages on `main`. Write the commit message you want to read here; do not edit this
file by hand, or the next release will overwrite the change.

Released versions are also published on the
[Releases page](https://github.com/quynhonsemiconductor/mcp-tools/releases).

Versioning starts at `0.1.0` for this repository. The pre-`0.1.0` history of the
upstream project it was migrated from is not reproduced here: every one of its ~1,290
commit and pull-request links referenced a repository this one has no commits in
common with, so the entries pointed at issues and commits that do not exist and could
not be reached. That history remains in git if it is ever needed.
