# Case corpus

Each directory under `cases/` is one analysed advertisement:

- `asset.jpg` or `asset.png` — the advertisement image that the reading is about.
- `manifest.json` — where the image came from (`source_url`), its SHA-256 checksum, and a short source title.
- `draft.json` — the machine-generated reading in the `decode-draft.v1` contract: evidence records (what is visible), interpretive claims (what it may mean), and references to controlled concepts.

## Third-party content notice

The images are advertisements created by their respective brands and agencies. They are reproduced here, unmodified and at the resolution they were publicly posted, as the object of non-commercial research and commentary: each image is accompanied by a structured critical reading, and the reading cannot be checked without the image. The source of every image is recorded in its `manifest.json`.

This project is independent. It is not affiliated with, sponsored by, or endorsed by any brand or advertiser shown here. The readings are machine-generated interpretations, not statements of fact about any brand or its intentions.

The MIT licence in the repository root covers the code and documentation written for this project. It does not cover the advertisement images, which remain the property of their rights holders.

## Removal requests

If you hold rights to an advertisement in this corpus and want it removed, open an issue naming the case directory or the source URL, or use the private contact route in `SECURITY.md`. Removal requests are actioned promptly and without discussion.
