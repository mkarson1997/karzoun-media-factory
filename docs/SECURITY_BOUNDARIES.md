# Security Boundaries

Karzoun Media Factory treats external provider credentials, OAuth state, runtime databases, generated media, and operator identifiers as deployment data rather than source code.

The repository's safety model depends on four explicit runtime locks remaining disabled by default: paid generation, paid autopilot generation, YouTube upload, and public publishing.

Public examples and automated verification should use mock, local-demo, or otherwise synthetic paths so contributors never need production credentials to build or test the project.
