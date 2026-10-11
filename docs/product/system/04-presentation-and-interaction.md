---
name: Signum
description: An editorial advertising-analysis archive with a restrained evidence desk for deeper inspection and creation.
colors:
  shell: '#0d1014'
  shell-surface: '#14181e'
  shell-active: '#1b2028'
  paper: '#f4f6f8'
  paper-recessed: '#eef1f4'
  surface: '#ffffff'
  ink: '#101319'
  ink-secondary: '#35404c'
  ink-muted: '#66717d'
  line: '#d3d9e0'
  accent: '#2f6fed'
  accent-strong: '#1d4ed8'
  success: '#16794f'
  warning: '#8a6100'
  danger: '#b42318'
typography:
  display:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '2.375rem'
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: '-0.025em'
  body:
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.48
    letterSpacing: 'normal'
  data:
    fontFamily: 'IBM Plex Mono, ui-monospace, monospace'
    fontSize: '0.75rem'
    fontWeight: 400
    lineHeight: 1.48
    letterSpacing: 'normal'
rounded:
  sm: '6px'
  md: '10px'
  lg: '14px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  2xl: '32px'
  3xl: '40px'
  section: '64px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '#ffffff'
    rounded: '{rounded.md}'
    padding: '0 15px'
    height: '40px'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '0 15px'
    height: '40px'
  filter-chip-active:
    backgroundColor: '#f2f6ff'
    textColor: '{colors.accent-strong}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '36px'
---

## Overview

**Creative North Star: "Archive first. Evidence before interpretation."** Public discovery surfaces should feel like an editorial/research publication built around advertising imagery and analytical ideas. Deeper analysis and creation surfaces become the restrained evidence instrument: calm enough to inspect closely, dense enough for real analytical work, and explicit about the boundary between what is visible and what the model infers.

**Key Characteristics:**

- A graphite archive index around neutral paper-white editorial and analytical surfaces.
- The homepage leads with real advertisements, curated Brand · Year context, analytical titles, and recurring concepts rather than controls.
- Advertisement imagery supplies most of the visual color; product chrome stays restrained.
- Cobalt blue signals action, selection, and navigation state rather than decoration.
- Primary meaning is visible immediately; analytical support appears through native progressive disclosure.
- Dense evidence views use rules, alignment, and spacing before containers or cards.

**The Object-and-Argument Rule.** On archive reading surfaces, the advertisement and its analytical thesis establish context first. Evidence then follows as natural-language Observation → Interpretation units. Evidence-graph mechanics are available in Analysis map rather than becoming the default reading hierarchy.

**The Instrument Rule.** Analysis and creation surfaces should read as a working analytical tool, not an AI demo or marketing dashboard. The homepage should not inherit the tool-first hierarchy: it is an archive publication first. The model is visible through evidence and method, not decorative “AI” motifs.

## Colors

The palette is intentionally low-chroma except for state colors. Graphite owns global navigation; cool paper and white own analysis; cobalt marks the current path and interactive emphasis. Advertisement imagery must remain the most colorful object on analytical screens.

**The Ad Carries the Color Rule.** Do not introduce decorative color around a creative. New surfaces inherit neutral shells and use accent color only for active state, focus, links, or primary action.

**The Signal Color Rule.** Blue is a functional signal. Green, amber, and red are reserved for semantic status such as supported/success, caution, and failure.

## Typography

IBM Plex Sans is the single display, reading, and interface family. Hierarchy comes from size, weight, spacing, and placement rather than mixing typefaces. Headlines use tight tracking and semibold weight and stay between roughly 1.75rem and 2.5rem so that the advertisement and its interpretation, not the page title, are the largest objects on screen; body copy remains compact and highly legible. Headings are not preceded by eyebrow or kicker labels (SDEC-024). IBM Plex Mono is reserved for identifiers, evidence references, and measurement-like data.

**The One Voice Rule.** Do not introduce serif or alternate display families. The analytical product should sound like one instrument, not a publication assembled from multiple typographic voices.

**The Mono Earns Its Place Rule.** Monospace is for IDs and data only. Concept names, labels, navigation, and ordinary metadata remain in Plex Sans.

## Layout

Desktop uses a fixed left graphite sidebar and a fluid work surface. Mobile replaces the sidebar with a compact sticky header. Content widths are generous enough for analytical comparison but prose remains bounded.

The homepage is editorial and archive-first: a clear archive proposition, large featured advertising imagery, recurring concept entry points, method framing, then a secondary creation invitation. The dropzone belongs on `/analyse`, not `/`.

Case detail opens with a two-column **Advertisement + Overall interpretation** composition and stacks on narrow screens. Evidence then becomes a full-width editorial argument below it; Concepts form a separate later section. Workbench remains the expert evidence-map surface. Archive behaves as an image-first contact sheet. Glossary uses filter rail, index, and persistent inspector rather than a modal drawer.

**The Proximity Rule.** Supporting interpretation belongs immediately beneath the Observation it depends on. Do not recreate a detached global Interpretations section.

**The Progressive Density Rule.** Default views should scan quickly. Secondary evidence, controlled concepts, provenance, and cross-links appear only after the user asks for depth.

**The Real-Pane Rule.** Tool panes have bounded viewport behavior and internal scrolling where appropriate. Avoid letting one long list stretch sibling panels into document-height columns.

## Elevation & Depth

Depth is quiet. Thin rules and surface changes carry most hierarchy. Small ambient shadows are allowed for genuinely raised objects such as image plates or floating interaction surfaces; ordinary analytical rows stay flat.

**The Border-Before-Shadow Rule.** Use a rule or surface change first. A shadow is justified only when an element is perceptually above another plane.

**The Creative Plate Rule.** Source imagery may receive a restrained soft shadow against its neutral inspection well so the edge of the original creative remains legible without turning the surrounding panel into a dark frame.

## Shapes

The system uses modest radii: gently curved controls and content surfaces, never bubble-like page scaffolding. Pills are reserved for compact statuses or tags. Evidence and interpretation lists primarily use horizontal rules instead of nested rounded containers.

**The Flat Evidence Rule.** Do not place cards inside cards for analytical hierarchy. Observation and Claim depth is expressed through indentation, rules, surface shift, and disclosure.

## Components

**Navigation.** Desktop navigation is a vertical graphite archive index with consistent stroked SVG icons and 44px minimum targets. It is a flat list: Analyses, Concepts, Method, a rule, then Analyse an ad; there are no group labels and no count footer (SDEC-023). The active destination carries a left cobalt bar and a lighter row surface. Analysis map is contextual to an analysis rather than global primary navigation. Mobile navigation is a single-row sticky header using the same four destinations.

**Buttons.** Primary buttons use cobalt with white text; secondary buttons are white with a neutral border; ghost/quiet variants remove the border and surface. Hover changes color or border only, with short state transitions.

**Search and filters.** Search fields are white, compact, and bordered. Filter chips are rounded rectangles rather than pills; selected state uses a pale cobalt wash and blue text.

**Archive tile.** The creative image is the dominant region. Beneath it, use **Brand · Year** when verified, then one analytical title. Do not put observation counts, interpretation counts, evidence-type counts, confidence, or concept lists on the default archive card. Unknown year stays absent rather than guessed.

**Evidence disclosure.** The default Case-detail unit leads with the Observation and its strongest Interpretation. Quiet concept cues may support that reading. A single expansion reveals additional interpretations only; confidence, location, support counts, and evidence IDs are expert detail rather than default reading chrome.

**Reading row.** Interpretive prose is not another accordion. The claim comes first; its analytical lens and concept links are secondary. Evidence-graph support counts and dependency mechanics belong in Analysis map rather than the normal reading flow.

**Source inspection.** The advertisement sits in a cool neutral well with minimal framing. Avoid black monitor-like framing unless the source material itself requires a dark inspection context.

## Do's and Don'ts

### Do

- Let advertisements dominate the homepage, archive, and analytical screens.
- Demonstrate Signum with real analyses before presenting creation controls.
- Keep literal evidence and model inference visibly distinct.
- Use native disclosure controls for optional analytical depth.
- Prefer rules, whitespace, and alignment over adding another container.
- Keep target sizes, focus rings, keyboard behavior, and reduced-motion support intact.
- Preserve the same vocabulary across Archive, Case detail, Workbench, Glossary, and direct Decode results.

### Don't

- Don't reintroduce serif typography.
- Don't use blue or semantic colors as decoration.
- Don't open deep evidence structures automatically on first load.
- Don't create a separate Interpretations section when Interpretations can be attached to their supporting Observations.
- Don't build nested card stacks or dashboard metric cards as page scaffolding.
- Don't frame source advertisements in heavy dark chrome by default.
- Don't use monospace merely to make ordinary UI look technical.
- Don't use modals when persistent or inline inspection preserves context better.
- Don't put the uploader, runtime status, or tool-first explanation above the archive on the homepage.
- Don't add eyebrow labels above headings or decorative step numerals to explanatory copy.
- Don't render a count of zero; omit the line instead.
- Don't restore Inspect as a peer primary-navigation destination unless its product role materially changes.
