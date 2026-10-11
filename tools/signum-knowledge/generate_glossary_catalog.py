#!/usr/bin/env python3
"""Build-time generator for the frontend glossary catalog.

The legacy/base catalog remains in ``content/glossary/entries.yaml``. Reviewed
editorial replacements live in ``content/glossary/editorial-refresh.v2.yaml`` and
are layered over the base by entry id at build time. This lets Signum improve the
quality and freshness of individual concepts without duplicating or mass-rewriting
the full catalog.

The frontend imports the generated JSON only; no YAML is parsed at runtime.
"""
from pathlib import Path
import json
import sys

import yaml

ROOT = Path(__file__).resolve().parents[2]
BASE_SOURCE = "content/glossary/entries.yaml"
REFRESH_SOURCE = "content/glossary/editorial-refresh.v2.yaml"
OUTPUT = ROOT / "frontend/src/lib/generated/signum-glossary-data.json"
SCHEMA_VERSION = "signum_glossary_catalog.v2"

# ontology_ref.class -> frontend domain bucket. Reproduces the buckets the frontend used
# while definitions were hardcoded.
DOMAIN_MAP = {
    "EmotionalLever": "Emotion",
    "PersuasionTechnique": "Persuasion",
    "Signifier": "Semiotics",
    "Signified": "Semiotics",
    "GlossaryEntry": "Semiotics",
    "ReferentSystem": "Culture",
    "Ideology": "Culture",
    "CulturalCode": "Culture",
    "SocialConcept": "Culture",
}
DEFAULT_DOMAIN = "System"

# Requested concept id -> glossary entry id. The frontend resolves these before lookup.
ALIASES = {
    "authority": "authority_persuasion",
}


def domain_for(class_name):
    return DOMAIN_MAP.get(class_name, DEFAULT_DOMAIN)


def _load_docs(source):
    return [
        doc
        for doc in yaml.safe_load_all((ROOT / source).read_text(encoding="utf-8"))
        if doc
    ]


def load_glossary_docs():
    """Load base entries and layer the reviewed refresh file by entry id.

    Refresh documents default to ``refresh_mode: override`` and may contain only the
    fields being reviewed. ``refresh_mode: add`` is reserved for genuinely new entries
    and requires the id not to exist in the base catalog.
    """
    base_docs = _load_docs(BASE_SOURCE)
    refresh_docs = _load_docs(REFRESH_SOURCE)

    ordered_ids = []
    merged_by_id = {}
    for doc in base_docs:
        entry_id = doc.get("id")
        if not entry_id:
            raise ValueError(f"{BASE_SOURCE}: glossary document is missing id")
        if entry_id in merged_by_id:
            raise ValueError(f"{BASE_SOURCE}: duplicate glossary id '{entry_id}'")
        ordered_ids.append(entry_id)
        merged_by_id[entry_id] = doc

    refreshed_ids = set()
    for patch in refresh_docs:
        entry_id = patch.get("id")
        if not entry_id:
            raise ValueError(f"{REFRESH_SOURCE}: refresh document is missing id")
        if entry_id in refreshed_ids:
            raise ValueError(f"{REFRESH_SOURCE}: duplicate refresh id '{entry_id}'")
        refreshed_ids.add(entry_id)

        mode = patch.get("refresh_mode", "override")
        payload = {key: value for key, value in patch.items() if key != "refresh_mode"}
        if mode == "override":
            if entry_id not in merged_by_id:
                raise ValueError(
                    f"{REFRESH_SOURCE}: override '{entry_id}' has no base glossary entry"
                )
            merged_by_id[entry_id] = {**merged_by_id[entry_id], **payload}
        elif mode == "add":
            if entry_id in merged_by_id:
                raise ValueError(
                    f"{REFRESH_SOURCE}: add '{entry_id}' already exists in base glossary"
                )
            required = {"concept_name", "slug", "ontology_ref", "short_definition"}
            missing = sorted(required - payload.keys())
            if missing:
                raise ValueError(
                    f"{REFRESH_SOURCE}: add '{entry_id}' missing required fields: "
                    + ", ".join(missing)
                )
            ordered_ids.append(entry_id)
            merged_by_id[entry_id] = payload
        else:
            raise ValueError(
                f"{REFRESH_SOURCE}: '{entry_id}' has unsupported refresh_mode '{mode}'"
            )

    return [merged_by_id[entry_id] for entry_id in ordered_ids]


def build_entries(docs):
    entries = []
    for doc in docs:
        ref = doc.get("ontology_ref") or {}
        entries.append(
            {
                "id": doc["id"],
                "label": doc.get("concept_name", doc["id"]),
                "slug": doc.get("slug", doc["id"]),
                "domain": domain_for(ref.get("class")),
                "ontology_ref": {"class": ref.get("class")},
                "definition": doc.get("short_definition", ""),
                "plain_language": doc.get("plain_language", ""),
                "why_it_matters": doc.get("why_it_matters", ""),
                "how_to_spot": list(doc.get("how_to_spot", []) or []),
                "related_terms": list(doc.get("related_concepts", []) or []),
                "scope_note": doc.get("scope_note", ""),
                "common_misreadings": list(doc.get("common_misreadings", []) or []),
                "reviewed_at": doc.get("reviewed_at"),
                "source_references": list(doc.get("source_references", []) or []),
            }
        )
    entries.sort(key=lambda entry: entry["id"])
    return entries


def build_catalog():
    return {
        "schema_version": SCHEMA_VERSION,
        "source": BASE_SOURCE,
        "sources": [BASE_SOURCE, REFRESH_SOURCE],
        "aliases": ALIASES,
        "entries": build_entries(load_glossary_docs()),
    }


def main():
    catalog = build_catalog()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    reviewed = sum(1 for entry in catalog["entries"] if entry.get("reviewed_at"))
    print(
        f"WROTE {OUTPUT.relative_to(ROOT)} "
        f"({len(catalog['entries'])} entries, {reviewed} editorially reviewed)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
