# Provider Safety

External providers are optional runtime integrations. Credentials must be supplied outside source control and provider failures must not silently unlock paid or publishing behavior.

Changes to provider adapters should preserve explicit cost controls, credential redaction, safe fallbacks, and deterministic test paths that do not require live accounts.
