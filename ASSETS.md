# Third-party assets

All assets below are CC0 (public domain) — no attribution required, sources
noted for provenance. Everything else in the game (geometry, audio, text,
code) is original procedural work.

## Textures — ambientCG (https://ambientcg.com), CC0

Downloaded at 1K-JPG quality; each folder holds `color`, `normalgl`,
`roughness`, `displacement` maps.

| Folder | Source asset | Used for |
| --- | --- | --- |
| `textures/wallpaper` | Wallpaper002C (molded woodchip) | main-floor walls |
| `textures/plaster-damaged` | Plaster007 | dark/damaged walls |
| `textures/ceiling-plaster` | PaintedPlaster017 | ceilings |
| `textures/wood-floor` | WoodFloor043 | parquet floors |
| `textures/wood-floor-dark` | WoodFloor064 | dark-room floors |
| `textures/carpet-dark` | Carpet012 | carpeted floors, lobby |
| `textures/concrete-bunker` | Concrete031 | Underscript walls |
| `textures/concrete-dark` | Concrete036 | Underscript floors/utility |
| `textures/brick-damaged` | Bricks097 | damaged/utility walls |
| `textures/metal-dirty` | Metal046B | metal props, doors, Underscript detail |
| `textures/metal-aged` | Metal063 | machinery, the Engine |
| `textures/leather-dark` | Leather030 | upholstered furniture |

## Models — Poly Haven (https://polyhaven.com), CC0

Downloaded at 1K glTF quality (`.gltf` + `.bin` + textures in each folder).
Loaded lazily at boot by `src/world/modelLibrary.ts`; any prop whose model
has not finished loading falls back to its procedural builder.

| Folder | Source asset | Used for |
| --- | --- | --- |
| `models/GothicCabinet_01` | Gothic Cabinet 01 | `cabinet` props |
| `models/GothicBed_01` | Gothic Bed 01 | `bed` props |
| `models/Rockingchair_01` | Rockingchair 01 | `chair` props |
| `models/WoodenTable_01` | Wooden Table 01 | `table` props |
| `models/hanging_picture_frame_01` | Hanging Picture Frame 01 | `painting` props |
