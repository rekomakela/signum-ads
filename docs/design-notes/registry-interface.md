# Registry Interface

Status: Active

`ReferenceRegistry` is the contract for vocabulary and reference lookups.

Core rules:

- `ReferenceRegistry` defines the lookup contract.
- Validator, review, and export modules depend on the interface, not on concrete registry implementations.
- Stub registry behavior is used for unresolved-reference tests.
- Controlled vocabulary registry behavior is used for fixture-backed resolution tests.
- Swapping registry implementations must not require changes to validator, review, or export call sites.

Known implementations:

- `src/references/reference-registry.ts` - defines the interface and the default stub/factory registry used when no controlled vocabulary snapshot is supplied.
- `src/references/controlled-vocabulary-registry.ts` - provides the read-only snapshot-backed controlled vocabulary registry.

Status remains active until the registry contract itself changes.
