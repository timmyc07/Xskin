# Bundled preset packs

This directory contains the background engine's bundled presets. During installation, `install-dream-skin-macos.sh` idempotently seeds each `preset-*/` into the user theme library at `~/Library/Application Support/CodexDreamSkinStudio/themes/`. Switch through the menu bar's saved themes or with `switch-theme-macos.sh --id <id>`.

## Featured preset

`preset-romantic-rose/` (Arina Hashimoto) is the featured preset documented with live Codex verification. Its `2560 × 1440` (16:9) background leaves a quiet area on the left for native home content, with the subject and flowers on the right. The light and dark previews are real injected Codex screenshots, not generated images of an entire app window.

Distinguish the source from the derived export: the archived, user-provided PNG is `1672 × 941` and is not seeded as part of the pack. The preset's `background.jpg` preserves the near-16:9 composition in a standardized `2560 × 1440` JPEG; this does not recover or add source detail. The derivative was generated with `sips -z 1440 2560 -s format jpeg -s formatOptions 90`.

- The importable, seedable theme files are [`background.jpg`](./preset-romantic-rose/background.jpg) and [`theme.json`](./preset-romantic-rose/theme.json).
- The byte-identical, user-provided source PNG is archived separately at [`docs/images/presets/romantic-rose-source.png`](../../docs/images/presets/romantic-rose-source.png). It is outside the preset pack so the installer does not seed an extra file.
- The light and dark documentation screenshots are `2308 × 1572` Retina JPEGs (CSS viewport `1154 × 786`) from the same real Codex home page. Temporary local styles hid unsent input and collapsed the editor for the screenshots, without changing the draft or fabricating the skin effect. These previews include native UI and **must never be imported as background images**.
- This featured artwork has a different source from the five procedural presets below. Running `generate-presets.mjs` does not overwrite it.
- The artwork is a user-provided AI-generated example, not an official OpenAI/Codex visual or endorsement. Confirm likeness, model-output, and asset rights before redistributing it.
- This maintainer-provided preset is a separately recorded release exception and is not covered by the MIT software license. See [`../NOTICE.md`](../NOTICE.md) for the file inventory and restrictions. The exception does not permit future submissions of other identifiable real people.

Switch after installation:

```bash
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh \
  --id preset-romantic-rose
```

## Pack structure

```text
preset-<slug>/
├── theme.json        # schemaVersion 1; same format as assets/theme.json
└── background.jpg    # Landscape background image, JPEG
```

- The directory name and `theme.json` ID must both use `preset-<slug>`, with a lowercase, hyphenated English slug. Seeding manages only `preset-*` packs and never changes user-created `custom-*` themes.
- The `image` field must name a file within the same directory, not a path. Supported formats are `png` / `jpg` / `jpeg` / `webp`, up to 16 MB; less than 1 MB is recommended.
- For subjects or scenes, prefer a `2560 × 1440` (16:9) master. Place the main subject around the right 58%–88%, keeping roughly the left 50%–58% calm and low-contrast. Never name a preview screenshot, window mockup, or image containing UI `background.*`.

## Asset requirements

Bundled presets are distributed with the repository. They are not private, local examples. Accepted sources are:

- Original images or images you have permission to distribute.
- Assets explicitly released under CC0, in the public domain, or with redistribution permission.
- Procedurally generated abstract, gradient, or geometric backgrounds.
- Original fictional adult characters with documented generation or licensing sources that do not imitate identifiable real people.

Unless maintainers complete a separate rights review in advance and record it per asset in `NOTICE.md`, submissions must not contain:

- Portraits of identifiable real people, including celebrities, influencers, or adult performers.
- Copyrighted anime, game, or film characters and screenshots.
- Any third-party asset you do not have the right to redistribute.

By submitting a preset, you represent that you have the rights needed to distribute and sublicense its assets.

## Two ways to contribute

### A. Procedural generation (recommended)

`generate-presets.mjs` is a deterministic generator using only Node and built-in zlib. It creates five abstract backgrounds with layered gradients, glows, and vignettes, then uses macOS `sips` to encode JPEGs. Identical inputs produce identical bytes for stable asset diffs. It manages only procedural themes listed in its `PRESETS` array, not the featured preset.

Add an entry to `PRESETS` (`slug` / `name` / `bg` / `lights` / `colors` …), then run:

```bash
node macos/presets/generate-presets.mjs
```

- Use the default `screen` blending for dark backgrounds. Set `blend: "tint"` for light backgrounds; `screen` produces little visible glow on an already light base.
- Inspect `background.jpg` in Quick Look or an image viewer. Keep a relatively quiet area on the left for native home content.

### B. Provide an image directly

Without a Mac, or when using your own artwork, provide `preset-<slug>/background.jpg` and a hand-written `theme.json`. Start with an existing preset and adjust its colors.

Before generating an image, use the 16:9 composition template, light/dark constraints, and negative prompt in [`docs/reference-background-prompt-guide.md`](../../docs/reference-background-prompt-guide.md). Individual breakdowns of eight concept directions are in [`docs/background-generation-prompts.md`](../../docs/background-generation-prompts.md).

## Checks before submitting

```bash
# Validate one preset as an injectable theme pack
node macos/scripts/injector.mjs --check-payload --theme-dir macos/presets/preset-<slug>/

# Run the complete checks, including preset validity and idempotent seeding
cd macos && npm test
```

See `../assets/theme.json` and `scripts/write-theme.mjs` for theme fields. Coordinate the ten `colors` keys with the artwork; `accent` / `secondary` / `highlight` become accent colors in native controls.
