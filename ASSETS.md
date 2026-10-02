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
| `models/wooden_bookshelf_worn` | Wooden Bookshelf Worn | `bookshelf` props |
| `models/metal_office_desk` | Metal Office Desk | `desk` props |
| `models/sofa_02` | Sofa 02 | `sofa` props |
| `models/drawer_cabinet` | Drawer Cabinet | `filing` props |
| `models/steel_frame_shelves_01` | Steel Frame Shelves 01 | `locker` props |
| `models/steel_frame_shelves_02` | Steel Frame Shelves 02 | `shelf` props |
| `models/vintage_wooden_drawer_01` | Vintage Wooden Drawer 01 | `drawerUnit` props |
| `models/industrial_storage_cart` | Industrial Storage Cart | `trolley` props |
| `models/potted_plant_01` | Potted Plant 01 | `plant` props |
| `models/nettle_plant` | Nettle Plant | `plant` props (variant) |
| `models/vintage_grandfather_clock_01` | Vintage Grandfather Clock 01 | `clock` props |
| `models/vintage_telephone_wall_clock` | Vintage Telephone Wall Clock | `wallClock` props |
| `models/desk_lamp_arm_01` | Desk Lamp Arm 01 | `deskLamp` props |
| `models/industrial_wall_sconce` | Industrial Wall Sconce | `wallSconce` props |
| `models/industrial_wall_lamp` | Industrial Wall Lamp | `wallSconce` props (variant) |
| `models/hanging_industrial_lamp` | Hanging Industrial Lamp | `ceilingLamp` props |
| `models/vintage_oil_lamp` | Vintage Oil Lamp | `lamp` props |
| `models/wooden_crate_01` | Wooden Crate 01 | `crate` props |
| `models/old_military_crate` | Old Military Crate | `crate` props (variant) |
| `models/fancy_picture_frame_01` | Fancy Picture Frame 01 | `painting` props (variant) |
| `models/gothic_statue` | Gothic Statue | `statue` props |
| `models/marble_bust_01` | Marble Bust 01 | `bust` props |
| `models/brass_vase_01` | Brass Vase 01 | `vase` props |
| `models/brass_candleholders` | Brass Candleholders | `candle` props |
| `models/wooden_candlestick` | Wooden Candlestick | `candle` props (variant) |
| `models/Chandelier_01` | Chandelier 01 | `chandelier` props |
| `models/ornate_mirror_01` | Ornate Mirror 01 | `mirror` props |
| `models/barrel_stove` | Barrel Stove | `stove` props |
| `models/book_encyclopedia_set_01` | Book Encyclopedia Set 01 | `books` props |
| `models/binder_notebook` | Binder Notebook | `books` props (variant) |
| `models/office_notepads` | Office Notepads | `papers` props |
| `models/clipboard` | Clipboard | `papers` props (variant) |
| `models/cardboard_box_01` | Cardboard Box 01 | `carton` props |
| `models/metal_trash_can` | Metal Trash Can | `bin` props |
| `models/trashbag` | Trashbag | `bin` props (variant) |
| `models/portable_generator` | Portable Generator | `generator` props |
| `models/portable_welding_cart` | Portable Welding Cart | `weldingCart` props |
| `models/worn_metal_rack` | Worn Metal Rack | `rack` props |
| `models/standing_chalkboard_01` | Standing Chalkboard 01 | `board` props |
| `models/wheelchair_01` | Wheelchair 01 | `wheelchair` props |
| `models/vintage_suitcase` | Vintage Suitcase | `suitcase` props |
| `models/painted_wooden_bench` | Painted Wooden Bench | `bench` props |
| `models/WoodenChair_01` | Wooden Chair 01 | `chair` props (variant) |
| `models/korean_public_payphone_01` | Korean Public Payphone 01 | `payphone` props |
| `models/planter_box_01` | Planter Box 01 | `planter` props |
