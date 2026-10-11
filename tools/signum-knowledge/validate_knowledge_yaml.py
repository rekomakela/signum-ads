#!/usr/bin/env python3
"""Static YAML loader and structural validator for Signum knowledge content.

Stage 1 parses every knowledge YAML file. Stage 2 applies structural checks to the
master ontology artifacts (core-classes.v1, core-relationships.v1, and the class
decisions map). Content-only; it never imports or validates runtime contracts.
"""
from pathlib import Path
import json
import sys
import yaml

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
STRUCTURE_ONLY = "--structure-only" in sys.argv

paths = [
    *Path(ROOT, "content/ontology").rglob("*.yaml"),
    *Path(ROOT, "content/glossary").rglob("*.yaml"),
    *Path(ROOT, "content/concepts").rglob("*.yaml"),
    *Path(ROOT, "content/principles").rglob("*.yaml"),
    *Path(ROOT, "content/parking-lot").rglob("*.yaml"),
    *Path(ROOT, "content/legacy").rglob("*.yaml"),
    *Path(ROOT, "content/mappings").rglob("*.yaml"),
]

# ---- Stage 1: every file must parse -----------------------------------------
parse_errors = []
for path in paths:
    try:
        list(yaml.safe_load_all(path.read_text(encoding="utf-8")))
    except Exception as exc:  # noqa: BLE001 - report any parse failure
        parse_errors.append((path, exc))

if parse_errors:
    for path, exc in parse_errors:
        print(f"YAML parse error: {path}: {exc}", file=sys.stderr)
    sys.exit(1)

print(f"OK: parsed {len(paths)} YAML files")


# ---- Stage 2: structural checks for the master ontology artifacts ------------
def load_doc(rel_path):
    return yaml.safe_load((ROOT / rel_path).read_text(encoding="utf-8"))


failures = []


def check(condition, message):
    if not condition:
        failures.append(message)


core_classes_doc = load_doc("content/ontology/core-classes.v1.yaml")
relationships_doc = load_doc("content/ontology/core-relationships.v1.yaml")
decisions_doc = load_doc("content/mappings/ontology-class-decisions.v1.yaml")
manifest_doc = load_doc("content/ontology/ontology.yaml")
legacy_doc = load_doc("content/legacy/ontology.legacy-concepts.yaml")
parking_doc = load_doc("content/parking-lot/example_only_terms.yaml")

classes = core_classes_doc.get("classes", [])
class_ids = [c["id"] for c in classes]
class_labels = [c["label"] for c in classes]

# Active canonical class count is domain-driven, not fixed to a historical budget.
declared = core_classes_doc.get("canonical_class_count")
check(
    declared == len(classes),
    f"canonical_class_count={declared} does not match active classes={len(classes)}",
)

# Active and compatibility IDs/labels must be unique and non-overlapping.
compatibility_classes = core_classes_doc.get("compatibility_classes", [])
compatibility_ids = [c["id"] for c in compatibility_classes]
compatibility_labels = [c["label"] for c in compatibility_classes]
check(len(class_ids) == len(set(class_ids)), "core class IDs are not unique")
check(len(class_labels) == len(set(class_labels)), "core class labels are not unique")
check(
    len(compatibility_ids) == len(set(compatibility_ids)),
    "compatibility class IDs are not unique",
)
check(
    len(compatibility_labels) == len(set(compatibility_labels)),
    "compatibility class labels are not unique",
)
check(
    not (set(class_ids) & set(compatibility_ids)),
    "active and compatibility class IDs overlap",
)
check(
    not (set(class_labels) & set(compatibility_labels)),
    "active and compatibility class labels overlap",
)

# Relationship IDs unique and reference existing class IDs.
rels = relationships_doc.get("relationships", [])
rel_ids = [r["id"] for r in rels]
check(len(rel_ids) == len(set(rel_ids)), "relationship IDs are not unique")
class_id_set = set(class_ids)
for rel in rels:
    for end in ("source_class_id", "target_class_id"):
        ref = rel.get(end)
        check(
            ref in class_id_set,
            f"relationship {rel.get('id')} {end}={ref} does not reference a canonical class",
        )

# Decision mappings reference valid imported / legacy classes.
imported_names = set()
for layer in manifest_doc.get("layers", []):
    imported_names.update(layer.get("classes", []))
legacy_ids = {c["id"] for c in legacy_doc.get("classes", [])}

for dec in decisions_doc.get("imported_class_decisions", []):
    name = dec.get("imported_class")
    check(name in imported_names, f"decision references unknown imported class: {name}")
for dec in decisions_doc.get("legacy_class_decisions", []):
    lid = dec.get("legacy_id")
    check(lid in legacy_ids, f"decision references unknown legacy class id: {lid}")

# Canonical refs in decisions, when present, must be real class IDs.
for key in ("imported_class_decisions", "legacy_class_decisions"):
    for dec in decisions_doc.get(key, []):
        ref = dec.get("canonical_ref")
        if ref is not None:
            check(ref in class_id_set, f"decision canonical_ref {ref} is not a canonical class ID")

# No parking-lot / example-only term promoted to a core class.
parking_terms = {t["term"].strip().lower() for t in parking_doc.get("terms", [])}
for label in class_labels:
    check(
        label.strip().lower() not in parking_terms,
        f"parking-lot term promoted to core class: {label}",
    )

# No learner-session / workbench state object in the core.
forbidden_core = {"UserSession", "TryFirstResponse"}
for label in class_labels:
    check(
        label not in forbidden_core,
        f"learner/workbench state object promoted to core: {label}",
    )

# Optional authority-only mode: validate parseability + master corpus ontology structure
# without conflating that result with existing runtime/glossary compatibility debt.
if STRUCTURE_ONLY:
    if failures:
        print(f"FAIL: {len(failures)} structural check(s) failed", file=sys.stderr)
        for message in failures:
            print(f"  - {message}", file=sys.stderr)
        sys.exit(1)
    print(
        "OK: master corpus ontology structural checks passed "
        f"({len(classes)} active classes, {len(compatibility_classes)} compatibility classes, {len(rels)} relationships)"
    )
    sys.exit(0)

# ---- Stage 3: controlled-vocabulary <-> ontology alignment guards ------------
# Read-only. Never mutates the snapshot. See:
# docs/knowledge/controlled-vocabulary-ontology-alignment.md
VOCAB_PATH = "src/reference-vocabulary/controlled-vocabulary.v1.json"
snapshot = json.loads((ROOT / VOCAB_PATH).read_text(encoding="utf-8"))
snapshot_ontology_classes = snapshot.get("ontology_class", [])
canonical_labels = set(class_labels)
compatibility_label_set = set(compatibility_labels)
runtime_resolvable_class_labels = canonical_labels | compatibility_label_set

# Contract-structure-only classes must never appear as flat vocabulary IDs.
CONTRACT_STRUCTURE_ONLY = {
    "Asset",
    "Claim",
    "Interpretation",
    "CounterReading",
    "Observation",
    "EvidenceLink",
    "DecodeRevision",
    "AdvertiserClaim",
    "Placement",
    "AcquisitionSource",
    "MetadataAssertion",
    "AudiencePosition",
    "TemporalExtent",
    "Market",
}

# Guard 1: every ontology_class value in the snapshot is a canonical class.
for value in snapshot_ontology_classes:
    check(
        value in runtime_resolvable_class_labels,
        f"snapshot ontology_class '{value}' is neither active canonical nor explicit compatibility class",
    )

# Guard 2: no contract-structure-only class sits in ontology_class.
for value in snapshot_ontology_classes:
    check(
        value not in CONTRACT_STRUCTURE_ONLY,
        f"snapshot ontology_class '{value}' is a contract structure, not a vocabulary ID",
    )

# Guard 3: every ontology_class value referenced by a case manifest exists in the snapshot
# (export-risk guard: an unresolved reference blocks export).
snapshot_ontology_set = set(snapshot_ontology_classes)
case_manifests = sorted(Path(ROOT, "cases").glob("*/manifest.json"))
for manifest_path in case_manifests:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for claim in manifest.get("claims", []):
        for reference in claim.get("references", []):
            if reference.get("reference_type") != "ontology_class":
                continue
            value = reference.get("reference_value")
            check(
                value in snapshot_ontology_set,
                f"{manifest_path.name} references ontology_class '{value}' "
                "missing from the controlled-vocabulary snapshot",
            )

# ---- Stage 4: persuasion taxonomy source-content guards ---------------------
# Read-only. Reconciles content/concepts/persuasion-taxonomy.v1.yaml against the
# controlled-vocabulary snapshot without mutating anything. Evidence-hint vocabulary
# mirrors src/contracts/decode-draft-v1.ts EVIDENCE_TYPES.
EVIDENCE_TYPES = {"visual", "copy", "layout", "context", "cta", "price", "brand_mark"}

taxonomy_doc = load_doc("content/concepts/persuasion-taxonomy.v1.yaml")
techniques = taxonomy_doc.get("techniques", [])
levers = taxonomy_doc.get("levers", [])
technique_ids = [t["id"] for t in techniques]
lever_ids = [lv["id"] for lv in levers]
technique_id_set = set(technique_ids)
lever_id_set = set(lever_ids)

# Unique IDs.
check(len(technique_ids) == len(technique_id_set), "persuasion technique IDs are not unique")
check(len(lever_ids) == len(lever_id_set), "persuasion lever IDs are not unique")

snapshot_techniques = set(snapshot.get("persuasion_technique", []))
snapshot_levers = set(snapshot.get("emotional_lever", []))

# Parking-lot / example-only terms, normalized to snake_case for ID comparison.
parking_normalized = {
    t["term"].strip().lower().replace(" ", "_").replace("-", "_")
    for t in parking_doc.get("terms", [])
}

for tech in techniques:
    tid = tech["id"]
    # ontology_class_id must be the technique class.
    check(
        tech.get("ontology_class_id") == "SIG-C-11",
        f"technique '{tid}' ontology_class_id must be SIG-C-11",
    )
    # evidence_hints constrained to the contract evidence-type vocabulary.
    for hint in tech.get("evidence_hints", []) or []:
        check(
            hint in EVIDENCE_TYPES,
            f"technique '{tid}' evidence_hint '{hint}' is not a contract evidence type",
        )
    # common_emotional_levers must reference defined levers.
    for lever_ref in tech.get("common_emotional_levers", []) or []:
        check(
            lever_ref in lever_id_set,
            f"technique '{tid}' common_emotional_lever '{lever_ref}' is not a defined lever",
        )
    # in_controlled_vocabulary techniques must exist in the snapshot.
    if tech.get("runtime_status") == "in_controlled_vocabulary":
        check(
            tid in snapshot_techniques,
            f"technique '{tid}' is in_controlled_vocabulary but missing from the snapshot persuasion_technique",
        )
    # No parking-lot term promoted as a technique.
    check(
        tid not in parking_normalized,
        f"technique '{tid}' is a parking-lot/example-only term and must not be promoted",
    )

for lever in levers:
    lid = lever["id"]
    check(
        lever.get("ontology_class_id") == "SIG-C-12",
        f"lever '{lid}' ontology_class_id must be SIG-C-12",
    )
    # related_techniques must reference defined techniques.
    for tech_ref in lever.get("related_techniques", []) or []:
        check(
            tech_ref in technique_id_set,
            f"lever '{lid}' related_technique '{tech_ref}' is not a defined technique",
        )
    # in_controlled_vocabulary levers must exist in the snapshot.
    if lever.get("runtime_status") == "in_controlled_vocabulary":
        check(
            lid in snapshot_levers,
            f"lever '{lid}' is in_controlled_vocabulary but missing from the snapshot emotional_lever",
        )
    # No parking-lot term promoted as a lever.
    check(
        lid not in parking_normalized,
        f"lever '{lid}' is a parking-lot/example-only term and must not be promoted",
    )

# ---- Stage 5: glossary coverage guards --------------------------------------
# Read-only. Checks content/glossary/entries.yaml against the active corpus ontology,
# case manifests, and the controlled-vocabulary snapshot. Mutates nothing.
ALLOWED_DEFERRED_GLOSSARY_CLASSES = {"NarrativePattern", "VisualStyle", "TryFirstResponse"}
# Legitimately-promoted ids that happen to normalize to a parking-lot term.
# call_to_action is a Signifier text role, distinct from the parking-lot
# "Call to action" strategy term.
GLOSSARY_PARKING_ALLOWLIST = {"call_to_action"}
# Sentinel controlled-vocabulary glossary_concept ids that are not real concepts.
GLOSSARY_CONCEPT_SENTINELS = {"known_glossary_concept", "canonical_glossary_concept"}

glossary_docs = [
    d
    for d in yaml.safe_load_all(
        (ROOT / "content/glossary/entries.yaml").read_text(encoding="utf-8")
    )
    if d
]
glossary_ids = [d["id"] for d in glossary_docs]
glossary_id_set = set(glossary_ids)
check(len(glossary_ids) == len(glossary_id_set), "glossary entry ids are not unique")

glossary_slugs = [d["slug"] for d in glossary_docs if "slug" in d]
check(len(glossary_slugs) == len(set(glossary_slugs)), "glossary slugs are not unique")

allowed_glossary_classes = (
    canonical_labels | compatibility_label_set | ALLOWED_DEFERRED_GLOSSARY_CLASSES
)
for d in glossary_docs:
    gid = d["id"]
    cls = (d.get("ontology_ref") or {}).get("class")
    check(
        cls in allowed_glossary_classes,
        f"glossary '{gid}' ontology_ref.class '{cls}' is not canonical or an allowed deferred class",
    )
    check(
        gid not in parking_normalized or gid in GLOSSARY_PARKING_ALLOWLIST,
        f"glossary '{gid}' is a parking-lot/example-only term promoted without allowlist",
    )

# Every case-referenced glossary_concept id must exist as a glossary entry.
for manifest_path in case_manifests:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for claim in manifest.get("claims", []):
        for reference in claim.get("references", []):
            if reference.get("reference_type") != "glossary_concept":
                continue
            value = reference.get("reference_value")
            check(
                value in glossary_id_set,
                f"{manifest_path.name} references glossary_concept '{value}' missing from entries.yaml",
            )

# Every non-sentinel controlled-vocab glossary_concept id must exist as a glossary entry.
for value in snapshot.get("glossary_concept", []):
    if value in GLOSSARY_CONCEPT_SENTINELS:
        continue
    check(
        value in glossary_id_set,
        f"controlled-vocab glossary_concept '{value}' has no glossary entry",
    )

# Stage 5b: persuasion taxonomy <-> glossary coverage. Every technique that maps to runtime
# (in_controlled_vocabulary or runtime_only_needs_grounding) must resolve to a glossary entry
# through its glossary_ref (which doubles as the alias, e.g. authority -> authority_persuasion).
# Every in_controlled_vocabulary emotional lever must have a glossary entry under its id.
REQUIRE_GLOSSARY_TECHNIQUE_STATUSES = {
    "in_controlled_vocabulary",
    "runtime_only_needs_grounding",
}
for tech in techniques:
    gref = tech.get("glossary_ref")
    if gref is not None:
        check(
            gref in glossary_id_set,
            f"technique '{tech['id']}' glossary_ref '{gref}' has no glossary entry",
        )
    if tech.get("runtime_status") in REQUIRE_GLOSSARY_TECHNIQUE_STATUSES:
        check(
            gref is not None and gref in glossary_id_set,
            f"technique '{tech['id']}' ({tech.get('runtime_status')}) requires a glossary entry via glossary_ref",
        )
for lever in levers:
    if lever.get("runtime_status") == "in_controlled_vocabulary":
        check(
            lever["id"] in glossary_id_set,
            f"emotional lever '{lever['id']}' (in_controlled_vocabulary) has no glossary entry",
        )

# ---- Stage 6: frontend glossary catalog guards ------------------------------
# Read-only. Confirms the committed catalog is in sync with the source YAML and covers every
# instance-level concept the frontend glossary requests from case manifests.
sys.path.insert(0, str(ROOT / "tools/signum-knowledge"))
import generate_glossary_catalog as glossary_catalog  # noqa: E402

CATALOG_PATH = ROOT / "frontend/src/lib/generated/signum-glossary-data.json"
committed_catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
fresh_catalog = glossary_catalog.build_catalog()
check(
    committed_catalog == fresh_catalog,
    "signum-glossary-data.json is stale; run `npm run glossary:data`",
)

catalog_entry_ids = {entry["id"] for entry in committed_catalog["entries"]}
catalog_aliases = committed_catalog["aliases"]
# Instance-level reference types are learner concepts that must have a catalog entry.
# ontology_class values (class names) intentionally fall back, so they are excluded.
INSTANCE_REFERENCE_TYPES = {
    "glossary_concept",
    "persuasion_technique",
    "emotional_lever",
    "cultural_code",
}
for manifest_path in case_manifests:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    needed = set()
    for claim in manifest.get("claims", []):
        for reference in claim.get("references", []):
            if reference.get("reference_type") in INSTANCE_REFERENCE_TYPES:
                needed.add(reference.get("reference_value"))
    guidance = manifest.get("learning_guidance") or {}
    for concept_id in guidance.get("concepts_to_know", []) or []:
        needed.add(concept_id)
    for concept_id in needed:
        resolved = catalog_aliases.get(concept_id, concept_id)
        check(
            resolved in catalog_entry_ids,
            f"{manifest_path.name}: concept '{concept_id}' is not in the frontend glossary catalog",
        )

if failures:
    print(f"FAIL: {len(failures)} structural check(s) failed", file=sys.stderr)
    for message in failures:
        print(f"  - {message}", file=sys.stderr)
    sys.exit(1)

print(
    "OK: master ontology structural checks passed "
    f"({len(classes)} classes, {len(rels)} relationships)"
)
print(
    "OK: controlled-vocabulary alignment guards passed "
    f"({len(snapshot_ontology_classes)} ontology_class entries, "
    f"{len(case_manifests)} case manifests checked)"
)
print(
    "OK: persuasion taxonomy guards passed "
    f"({len(techniques)} techniques, {len(levers)} levers)"
)
print(
    "OK: glossary coverage guards passed "
    f"({len(glossary_ids)} entries checked)"
)
print(
    "OK: frontend glossary catalog guards passed "
    f"({len(catalog_entry_ids)} catalog entries, in sync with source)"
)
