# Continuous Integration

The public CI workflow verifies installation, linting, type checking, tests, and a production build with synthetic CI-only configuration. No provider credentials are required for CI.

Provider integrations and publishing paths must remain testable without live credentials. Real credentials belong only in local or deployment secret stores.

The release state is determined from the actual `main` branch checks, including the SonarQube Cloud quality gate; pull-request diagnostics are not treated as proof that the main-branch security gate is clean.
