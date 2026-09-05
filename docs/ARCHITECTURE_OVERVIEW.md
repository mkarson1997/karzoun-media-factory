# Architecture Overview

Karzoun Media Factory separates the web control plane, worker execution loop, persistence layer, provider adapters, and publishing boundaries. External provider credentials and OAuth state are runtime concerns, while the repository remains buildable and testable using synthetic/local paths.
