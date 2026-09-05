# Data Handling

Runtime data is deployment-local and must not be committed to the public repository. This includes generated media, provider responses containing private URLs, OAuth state, local databases, logs, and operator/account identifiers.

Public examples should use synthetic data. Logs and error messages should redact credential-like values before persistence or display.
