# Changelog

## [v0.1.0] — 2026-10-18
### Added
- Automated DevSecOps release pipeline triggering on `v*.*.*` git tags.
- Container image build targeting GitHub Container Registry (`ghcr.io`).
- Trivy vulnerability scanning step with vulnerability reporting.
- Anchore Syft SPDX-JSON SBOM artifact generation.
- Automated GitHub Release publication with attached `sbom.spdx.json`.


## [2026-08-29] — Phase 2 Evidence
### Added
- Added reproducible benchmark evidence `benchmarks/results/savings_benchmark.json` demonstrating actual cost savings from model routing.
- Standardized documentation (`runbook.md`, `decisions.md`, `ARCHITECTURE.md`).
- Added maturity badge and mock boundaries to `README.md`.

### Fixed
- Disabled `@typescript-eslint/no-var-requires` in `.eslintrc.json` to resolve strict mode linting errors blocking the CI pipeline.
