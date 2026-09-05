# Maintainer Checklist

Before merging a public change:

- verify no secrets, private identifiers, or generated private media were added
- preserve default locks for paid generation and public publishing unless intentionally changed
- run lint, typecheck, tests, and production build
- update documentation when provider behavior or safety boundaries change
- keep examples synthetic and reproducible
