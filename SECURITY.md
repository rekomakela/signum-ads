# Security Policy

## Supported version

Security fixes are made against the current `main` branch. Historical branches and generated local runtime state are not independently supported.

## Reporting a vulnerability

Do not publish exploit details, credentials, or sensitive runtime data in a public issue.

For the GitHub repository, prefer a private GitHub Security Advisory / private vulnerability report. If private reporting is unavailable, contact the repository owner privately and provide:

- affected commit or file paths;
- impact and realistic attack conditions;
- minimal reproduction steps;
- whether secrets or local data may have been exposed;
- a suggested mitigation, if known.

## Secrets

The repository must never contain live credentials. In particular:

- `FB_ACCESS_TOKEN` is local-only and must not be committed;
- model/runtime endpoints should not embed credentials in tracked files;
- `.env` and `.env.*` are ignored; `.env.example` documents names only;
- CI secrets must be stored in GitHub Actions secrets or environment protection, not workflow YAML.

## Local-first threat model

Signum is intentionally local-first. The decode server binds to `127.0.0.1` by default and is not designed as an Internet-facing multi-user service. Any change that exposes it beyond localhost must be treated as a security-significant architecture change and reviewed for authentication, authorization, request limits, CORS, logging, and data handling.

Model output is untrusted input. Structured model output must pass the Decode validation gate before new persistence.

## Third-party content removal

The `cases/` corpus contains screenshots of publicly available advertisements (Meta Ad Library, r/AdPorn) retained for research and commentary. If you are a rights holder and want specific cases removed, contact the repository owner privately (or open a private GitHub Security Advisory) and identify the case directory names or source URLs. Removal requests are actioned without discussion.

## Dependency security

- `npm run security:audit` is part of the canonical validation gate.
- Dependabot monitors npm and GitHub Actions dependencies.
- CI must fail on high/critical npm advisories.
- Low-severity development-only advisories may remain when no non-breaking upstream fix exists; they must not be silently upgraded into production exposure.

## Security-sensitive repository surfaces

Changes to the following deserve explicit scrutiny:

- `.github/workflows/`
- `.github/dependabot.yml`
- `.github/CODEOWNERS`
- `SECURITY.md`
- `src/server/`
- `src/cases/`
- `src/providers/llama-server-client.ts`
- environment/configuration files
