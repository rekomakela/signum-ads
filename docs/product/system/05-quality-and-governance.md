# 05 — Quality and governance

## Purpose

This document owns product-quality boundaries that must survive feature work, visual refinement, public showcase work, and model changes.

## Epistemic integrity

Signum assists interpretation; it does not determine a single correct meaning of an advertisement.

Required behaviors:

- Separate visible detail from interpretation.
- Qualify interpretive language where certainty is not warranted.
- Preserve evidence links so an interpretation can be challenged.
- Do not use a controlled concept as proof by itself.
- Confidence describes support strength, not objective truth probability.
- Allow multiple plausible readings and counter-readings.
- Do not infer advertiser intent, causal effect, or audience response without evidence that supports that stronger claim.

## Plain language without loss of rigor

Primary UI uses ordinary language first. Domain terminology remains available underneath for expert precision.

```text
Visible detail · Observation
Interpretation · Claim
Supporting evidence · Evidence trace
Concept · Controlled Concept
```

Do not expose implementation names simply because they are canonical in code.

## Accessibility

- Preserve a single meaningful `<main>` landmark per page.
- Prefer native interactive elements and native `<details>/<summary>` for disclosure.
- All functionality must be keyboard reachable with visible focus indication.
- Touch targets and text contrast must remain usable on narrow/mobile surfaces.
- Respect `prefers-reduced-motion` without removing necessary state feedback.
- Disclosure must not be the only way to communicate essential state.

## Local-first and privacy language

The analyser is designed around a local model/runtime. User-facing copy should state the consequence rather than the implementation, for example: "The image is analysed on this device."

Do not claim that content is never transmitted externally unless the current runtime path proves that claim. Runtime configuration and actual network behavior are mutable facts and must be verified when making privacy claims.

## Third-party advertisement material

Advertisements in the reference collection are third-party creative works used as analysis/commentary material. Keep source attribution or source links where available. Do not imply ownership of the underlying advertisement creative.

The repository's removal/contact policy is documented in `README.md` and `SECURITY.md`.

## Public showcase boundary

The static site may be published as a read-only showcase. The local Decode server is not an Internet-facing multi-user production service and must not be exposed merely because the static frontend is public.

Public publication state must be verified from the actual GitHub Pages workflow/run/target rather than inferred from committed configuration.

## Generated state

Frontend datasets and published Case image files are derived artifacts. They do not become the canonical source of Case truth by being convenient to consume.

Case persistence and Asset invariants remain owned by the Case Library.

## Verification expectations

Choose the smallest gate that proves the change while iterating. Completion should converge on the repository-owned validation entrypoint for the affected scope:

```text
bash scripts/validate --docs
bash scripts/validate --core
bash scripts/validate --frontend
bash scripts/validate
```

For user-visible changes, compiler/test success is insufficient by itself when browser behavior is material. Use fresh rendered evidence for layout, navigation, accessibility, and responsive claims.
