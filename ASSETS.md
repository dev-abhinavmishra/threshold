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
| `textures/tiles-institutional` | Tiles074 | morgue/laundry/service walls |
| `textures/fabric-dark` | Fabric077 | entity robes, dark cloth |
| `textures/fabric-chintz` | Fabric024 | sofas, rugs, dust sheets |
| `textures/wood-carved` | Wood096 | grand-room crown/chair rail + wainscot |
| `textures/leather-worn` | Leather038 | sofa upholstery |
| `textures/wallpaper-damask` | Wallpaper001B | lobby/milestone walls |
| `textures/carpet-persian` | Carpet014 | guest carpets |
| `textures/carpet-lobby` | Carpet011 | lobby carpets |
| `textures/brick-painted` | Bricks059 | painted maintenance walls |
| `textures/plaster-floral` | PaintedPlaster008 | guest walls |
| `textures/ceiling-office` | OfficeCeiling002 | office-tile ceilings |
| `textures/carpet-runner` | Carpet003 | corridor runner strips |

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
| `models/Barrel_01` | Barrel 01 | `barrel` props |
| `models/Barrel_02` | Barrel 02 | `barrel` props (variant) |
| `models/wine_barrel_01` | Wine Barrel 01 | `wineBarrel` props |
| `models/modular_pipes` | Modular Pipes | `pipeRun` props |
| `models/korean_fire_extinguisher_01` | Korean Fire Extinguisher 01 | `extinguisher` props |
| `models/Television_01` | Television 01 | `television` props |
| `models/WetFloorSign_01` | Wet Floor Sign 01 | `wetFloor` props |
| `models/wall_clock` | Wall Clock | `wallClock2` props |
| `models/mantel_clock_01` | Mantel Clock 01 | `mantelClock` props |
| `models/metal_stool_01` | Metal Stool 01 | `stool` props |
| `models/ladder_sectioned_01` | Ladder Sectioned 01 | `ladder` props |
| `models/wooden_bucket_01` | Wooden Bucket 01 | `bucket` props |
| `models/alarm_clock_01` | Alarm Clock 01 | `alarmClock` props |
| `models/retro_multimeter` | Retro Multimeter | `multimeter` props |
| `models/pipe_wrench` | Pipe Wrench | `wrench` props |
| `models/security_camera_01` | Security Camera 01 | `securityCam` props |
| `models/metal_tool_chest` | Metal Tool Chest | `toolChest` props |
| `models/propane_tank` | Propane Tank | `propaneTank` props |
| `models/medical_box` | Medical Box | `medBox` props |
| `models/Lantern_01` | Lantern 01 | `lantern` props |
| `models/vintage_flashlight` | Vintage Flashlight | `flashlight` props |
| `models/plastic_crate_01` | Plastic Crate 01 | `plasticCrate` props |
| `models/old_gas_mask` | Old Gas Mask | `gasMask` props |
| `models/ArmChair_01` | Arm Chair 01 | `armchair` props |
| `models/wooden_military_crate` | Wooden Military Crate | `milCrate` props |
| `models/power_box_01` | Power Box 01 | `powerBox` wall-mounts |
| `models/utility_box_01` | Utility Box 01 | `utilityBox` wall-mounts |
| `models/mounted_fluorescent_lights` | Mounted Fluorescent Lights | `fluoroStrip` props |
| `models/caged_hanging_light` | Caged Hanging Light | `cageLight` fixtures |
| `models/security_light` | Security Light | `securityLight` wall-mounts |
| `models/industrial_pipe_lamp` | Industrial Pipe Lamp | `pipeLamp` wall-mounts |
| `models/garden_hose_wall_mounted_01` | Garden Hose Wall Mounted 01 | `wallHose` wall-mounts |
| `models/tool_cart` | Tool Cart | `toolCart` props |
| `models/metal_jerrycan` | Metal Jerrycan | `jerrycan` props |
| `models/metal_toolbox` | Metal Toolbox | `toolbox` props |
| `models/small_lpg_tank` | Small LPG Tank | `lpgTank` props |
| `models/plastic_monobloc_chair_01` | Plastic Monobloc Chair 01 | `plasticChair` props |
| `models/vintage_microwave` | Vintage Microwave | `microwave` props |
| `models/dining_table` | Dining Table | `diningTable` props |
| `models/dining_chair_02` | Dining Chair 02 | `diningChair` props |
| `models/bench_vice_01` | Bench Vice 01 | `benchVice` props |
| `models/fire_alarm` | Fire Alarm | `fireAlarm` wall-mounts |
| `models/modular_electric_cables` | Modular Electric Cables | `cableTray` ceiling runs |
| `models/modular_chainlink_fence` | Modular Chainlink Fence | `chainFence` barriers |
| `models/rollershutter_door` | Roller Shutter Door | `shutterDoor` fronts |
| `models/concrete_road_barrier_02` | Concrete Road Barrier 02 | `roadBarrier` props |
| `models/plastic_crate_02` | Plastic Crate 02 | `plasticCrate2` props |
| `models/plastic_crate_03` | Plastic Crate 03 | `plasticCrate3` props |
| `models/SchoolChair_01` | School Chair 01 | `schoolChair` props |
| `models/SchoolDesk_01` | School Desk 01 | `schoolDesk` props |
| `models/modern_ceiling_lamp_01` | Modern Ceiling Lamp 01 | `ceilingLamp2` fixtures |
| `models/industrial_caged_sconce` | Industrial Caged Sconce | `cagedSconce` wall-mounts |
| `models/water_manhole_cover` | Water Manhole Cover | `manhole` floor props |
| `models/fire_hydrant` | Fire Hydrant | `hydrant` props |
| `models/pull_chain_light_socket` | Pull Chain Light Socket | `chainBulb` fixtures |
| `models/wooden_ladder` | Wooden Ladder | `woodLadder` props |
| `models/oil_tin` | Oil Tin | `oilTin` clutter |
| `models/tire_pump` | Tire Pump | `tirePump` clutter |
| `models/Sofa_01` | Sofa 01 | `sofa` variant |
| `models/sofa_03` | Sofa 03 | `sofa` variant |
| `models/vintage_cabinet_01` | Vintage Cabinet 01 | `vintageCabinet` props |
| `models/modern_wooden_cabinet` | Modern Wooden Cabinet | `modernCabinet` props |
| `models/filmstrip_projector_8mm` | Filmstrip Projector 8mm | `projector` props |
| `models/electric_stove` | Electric Stove | `stove` props |
| `models/old_bed_frame` | Old Bed Frame | `bedOld` props |
| `models/scandinavian_masonry_heater` | Scandinavian Masonry Heater | `masonryHeater` props |
| `models/ceiling_fan` | Ceiling Fan | `ceilingFan` fixtures |
| `models/boombox` | Boombox | `boombox` props |
| `models/cassette_player` | Cassette Player | `cassettePlayer` props |
| `models/classic_laptop` | Classic Laptop | `laptop` props |
| `models/dartboard` | Dartboard | `dartboard` wall-mounts |
| `models/security_camera_02` | Security Camera 02 | `securityCam` variant |
| `models/exterior_aircon_unit` | Exterior Aircon Unit | `airconUnit` wall-mounts |
| `models/plastic_broom` | Plastic Broom | `broom` props |
| `models/dustpan` | Dustpan | `dustpan` props |
| `models/cement_bag` | Cement Bag | `cementBag` props |
| `models/compost_bags` | Compost Bags | `compostBags` props |
| `models/ClassicNightstand_01` | Classic Nightstand 01 | `nightstand` props |
| `models/chinese_screen_panels` | Chinese Screen Panels | `screenPanels` dividers |
| `models/folding_wooden_stool` | Folding Wooden Stool | `foldingStool` props |
| `models/old_drill_press` | Old Drill Press | `drillPress` props |
| `models/lantern_chandelier_01` | Lantern Chandelier 01 | `lanternChandelier` fixtures |
| `models/Megaphone_01` | Megaphone 01 | `megaphone` props |
| `models/ammo_box` | Ammo Box | `ammoBox` props |
| `models/dead_tree_trunk` | Dead Tree Trunk | `deadTree` props |
| `models/baseball_bat` | Baseball Bat | `baseballBat` props |
| `models/adjustable_wrench` | Adjustable Wrench | (spare `wrench` variant) |
| `models/plastic_jerrycan` | Plastic Jerrycan | `jerrycanP` props |
| `models/spray_paint_bottles` | Spray Paint Bottles | `sprayCans` clutter |
| `models/can_rusted` | Can Rusted | `rustCan` clutter |
| `models/russian_food_cans_01` | Russian Food Cans 01 | `foodCans` clutter |
| `models/signal_flashlight` | Signal Flashlight | (spare `flashlight` variant) |
| `models/drain_cleaner` | Drain Cleaner | `cleanerBottle` clutter |
| `models/bleach_bottle` | Bleach Bottle | `bleachBottle` clutter |

## ambientCG texture sets (CC0)

| Directory | Source asset | Use |
|---|---|---|
| `textures/wood092` | Wood 092 | `woodPanel` walls (grand rooms) |
| `textures/concrete034` | Concrete 034 | `concreteLight` floors |
| `textures/metalwalkway014` | Metal Walkway 014 | `metalWalkway` underscript floors |
| `textures/diamondplate009` | Diamond Plate 009 | `diamondPlate` maintenance floors |
| `textures/marble012` | Marble 012 | `marbleFloor` lobby/gallery floors |
| `textures/travertine009` | Travertine 009 | `travertine` gallery walls |
| `textures/corrugatedsteel007a` | Corrugated Steel 007A | `corrugated` maintenance walls |
| `textures/metal-rusted` | Metal 053C | `metalRusted` maintenance floors |
| `textures/wood-floor-worn` | Wood Floor 065B | `woodFloorWorn` wood-floor variant |
| `textures/wood-floor-old` | Planks 009 | `woodFloorOld` wood-floor variant |
| `textures/plaster-peeling2` | Painted Plaster 018 | `plasterPeeling` underscript/maint walls |
| `textures/carpet-worn` | Carpet 016 | `carpetWorn` carpet variant |
| `textures/wallpaper-grand` | Wallpaper 001A | `wallpaperGrand` lobby walls |
| `textures/wood-paint` | Painted Wood 008C | `woodPaint` guest walls |
| `textures/marble-dark` | Marble 006 | `marbleDark` grand-floor variant |
| `textures/concrete-industrial` | Concrete 046 | `concreteIndustrial` underscript walls/floors |
| `models/GothicCommode_01` | Gothic Commode 01 | `gothicCommode` props |
| `models/concrete_cat_statue` | Concrete Cat Statue | `galleryStatue` props |
| `models/bronze_shark_statue` | Bronze Shark Statue | `galleryStatue` variant |
| `models/bronze_whale_statue` | Bronze Whale Statue | `galleryStatue` variant |
| `models/bronze_ray_statue` | Bronze Ray Statue | `galleryStatue` variant |
| `models/dead_quiver_branch_01` | Dead Quiver Branch 01 | `deadBranch` props |
| `models/dead_quiver_branch_02` | Dead Quiver Branch 02 | `deadBranch` variant |
| `models/dry_branches_medium_01` | Dry Branches Medium 01 | `deadBranch` variant |
| `models/crowbar_01` | Crowbar 01 | `crowbar` props |
| `models/bolt_cutters_01` | Bolt Cutters 01 | `boltCutters` props |
| `models/bunsen_burner` | Bunsen Burner | `bunsenBurner` props |
| `models/brass_goblets` | Brass Goblets | `goblets` props |
| `models/bolt_action_rifle_7_62` | Bolt Action Rifle 7.62 | `rifle` props |

## Poly Haven models — sprint 21 extraction batch (CC0)

| Directory | Source asset | Use |
|---|---|---|
| `models/Camera_01` | Camera | sprint-21 dressing/modelLibrary |
| `models/CashRegister_01` | CashRegister | sprint-21 dressing/modelLibrary |
| `models/ClassicConsole_01` | ClassicConsole | sprint-21 dressing/modelLibrary |
| `models/CoffeeCart_01` | CoffeeCart | sprint-21 dressing/modelLibrary |
| `models/CoffeeTable_01` | CoffeeTable | sprint-21 dressing/modelLibrary |
| `models/GreenChair_01` | GreenChair | sprint-21 dressing/modelLibrary |
| `models/Ottoman_01` | Ottoman | sprint-21 dressing/modelLibrary |
| `models/Shelf_01` | Shelf | sprint-21 dressing/modelLibrary |
| `models/Ukulele_01` | Ukulele | sprint-21 dressing/modelLibrary |
| `models/WoodenTable_02` | WoodenTable | sprint-21 dressing/modelLibrary |
| `models/WoodenTable_03` | WoodenTable | sprint-21 dressing/modelLibrary |
| `models/anthurium_botany_01` | Anthurium Botany | sprint-21 dressing/modelLibrary |
| `models/antique_ceramic_vase_01` | Antique Ceramic Vase | sprint-21 dressing/modelLibrary |
| `models/antique_estoc` | Antique Estoc | sprint-21 dressing/modelLibrary |
| `models/antique_katana_01` | Antique Katana | sprint-21 dressing/modelLibrary |
| `models/bar_chair_round_01` | Bar Chair Round | sprint-21 dressing/modelLibrary |
| `models/barrel_03` | Barrel | sprint-21 dressing/modelLibrary |
| `models/brass_vase_02` | Brass Vase | sprint-21 dressing/modelLibrary |
| `models/brass_vase_03` | Brass Vase | sprint-21 dressing/modelLibrary |
| `models/ceramic_vase_01` | Ceramic Vase | sprint-21 dressing/modelLibrary |
| `models/ceramic_vase_02` | Ceramic Vase | sprint-21 dressing/modelLibrary |
| `models/ceramic_vase_03` | Ceramic Vase | sprint-21 dressing/modelLibrary |
| `models/cigarette_pack` | Cigarette Pack | sprint-21 dressing/modelLibrary |
| `models/coffee_table_round_01` | Coffee Table Round | sprint-21 dressing/modelLibrary |
| `models/combination_wrench` | Combination Wrench | sprint-21 dressing/modelLibrary |
| `models/cross_pein_hammer` | Cross Pein Hammer | sprint-21 dressing/modelLibrary |
| `models/dead_quiver_trunk` | Dead Quiver Trunk | sprint-21 dressing/modelLibrary |
| `models/dead_tree_trunk_02` | Dead Tree Trunk | sprint-21 dressing/modelLibrary |
| `models/drill_press_01` | Drill Press | sprint-21 dressing/modelLibrary |
| `models/fancy_picture_frame_02` | Fancy Picture Frame | sprint-21 dressing/modelLibrary |
| `models/flathead_screwdriver` | Flathead Screwdriver | sprint-21 dressing/modelLibrary |
| `models/gallinera_chair` | Gallinera Chair | sprint-21 dressing/modelLibrary |
| `models/gallinera_table` | Gallinera Table | sprint-21 dressing/modelLibrary |
| `models/gate_latch_01` | Gate Latch | sprint-21 dressing/modelLibrary |
| `models/gothic_coffee_table` | Gothic Coffee Table | sprint-21 dressing/modelLibrary |
| `models/handsaw_wood` | Handsaw Wood | sprint-21 dressing/modelLibrary |
| `models/hanging_picture_frame_02` | Hanging Picture Frame | sprint-21 dressing/modelLibrary |
| `models/horse_statue_01` | Horse Statue | sprint-21 dressing/modelLibrary |
| `models/jug_01` | Jug | sprint-21 dressing/modelLibrary |
| `models/large_castle_door` | Large Castle Door | sprint-21 dressing/modelLibrary |
| `models/large_iron_gate` | Large Iron Gate | sprint-21 dressing/modelLibrary |
| `models/lightbulb_01` | Lightbulb | sprint-21 dressing/modelLibrary |
| `models/magnifying_glass_01` | Magnifying Glass | sprint-21 dressing/modelLibrary |
| `models/metal_stool_02` | Metal Stool | sprint-21 dressing/modelLibrary |
| `models/metal_stool_03` | Metal Stool | sprint-21 dressing/modelLibrary |
| `models/mid_century_lounge_chair` | Mid Century Lounge Chair | sprint-21 dressing/modelLibrary |
| `models/modern_arm_chair_01` | Modern Arm Chair | sprint-21 dressing/modelLibrary |
| `models/modular_airduct_circular_01` | Modular Airduct Circular | sprint-21 dressing/modelLibrary |
| `models/modular_airduct_rectangular_01` | Modular Airduct Rectangular | sprint-21 dressing/modelLibrary |
| `models/modular_industrial_pipes_01` | Modular Industrial Pipes | sprint-21 dressing/modelLibrary |
| `models/modular_metal_gutter` | Modular Metal Gutter | sprint-21 dressing/modelLibrary |
| `models/modular_street_seating` | Modular Street Seating | sprint-21 dressing/modelLibrary |
| `models/moss_01` | Moss | sprint-21 dressing/modelLibrary |
| `models/mousetrap` | Mousetrap | sprint-21 dressing/modelLibrary |
| `models/ornate_war_hammer` | Ornate War Hammer | sprint-21 dressing/modelLibrary |
| `models/outdoor_table_chair_set_01` | Outdoor Table Chair Set | sprint-21 dressing/modelLibrary |
| `models/painted_wooden_cabinet` | Painted Wooden Cabinet | sprint-21 dressing/modelLibrary |
| `models/painted_wooden_chair_01` | Painted Wooden Chair | sprint-21 dressing/modelLibrary |
| `models/painted_wooden_chair_02` | Painted Wooden Chair | sprint-21 dressing/modelLibrary |
| `models/painted_wooden_nightstand` | Painted Wooden Nightstand | sprint-21 dressing/modelLibrary |
| `models/painted_wooden_shelves` | Painted Wooden Shelves | sprint-21 dressing/modelLibrary |
| `models/painted_wooden_sofa` | Painted Wooden Sofa | sprint-21 dressing/modelLibrary |
| `models/painted_wooden_stool` | Painted Wooden Stool | sprint-21 dressing/modelLibrary |
| `models/painted_wooden_table` | Painted Wooden Table | sprint-21 dressing/modelLibrary |
| `models/planter_box_02` | Planter Box | sprint-21 dressing/modelLibrary |
| `models/planter_box_03` | Planter Box | sprint-21 dressing/modelLibrary |
| `models/portable_cassette_player` | Portable Cassette Player | sprint-21 dressing/modelLibrary |
| `models/pot_enamel_01` | Pot Enamel | sprint-21 dressing/modelLibrary |
| `models/potted_plant_02` | Potted Plant | sprint-21 dressing/modelLibrary |
| `models/potted_plant_04` | Potted Plant 04 | sprint-21 dressing/modelLibrary |
| `models/projector_screen` | Projector Screen | sprint-21 dressing/modelLibrary |
| `models/quiver_tree_01` | Quiver Tree | sprint-21 dressing/modelLibrary |
| `models/quiver_tree_02` | Quiver Tree | sprint-21 dressing/modelLibrary |
| `models/ratchet_wrench` | Ratchet Wrench | sprint-21 dressing/modelLibrary |
| `models/rock_07` | Rock 07 | sprint-21 dressing/modelLibrary |
| `models/round_wooden_table_01` | Round Wooden Table | sprint-21 dressing/modelLibrary |
| `models/round_wooden_table_02` | Round Wooden Table | sprint-21 dressing/modelLibrary |
| `models/rusted_hacksaw` | Rusted Hacksaw | sprint-21 dressing/modelLibrary |
| `models/screwdrivers_02` | Screwdrivers | sprint-21 dressing/modelLibrary |
| `models/seeding_tray_01` | Seeding Tray | sprint-21 dressing/modelLibrary |
| `models/side_table_01` | Side Table | sprint-21 dressing/modelLibrary |
| `models/side_table_tall_01` | Side Table Tall | sprint-21 dressing/modelLibrary |
| `models/sledgehammer_01` | Sledgehammer | sprint-21 dressing/modelLibrary |
| `models/small_oil_can_01` | Small Oil Can | sprint-21 dressing/modelLibrary |
| `models/small_wooden_table_01` | Small Wooden Table | sprint-21 dressing/modelLibrary |
| `models/spinning_wheel_01` | Spinning Wheel | sprint-21 dressing/modelLibrary |
| `models/standing_picture_frame_01` | Standing Picture Frame | sprint-21 dressing/modelLibrary |
| `models/steel_frame_shelves_03` | Steel Frame Shelves | sprint-21 dressing/modelLibrary |
| `models/stone_01` | Stone | sprint-21 dressing/modelLibrary |
| `models/stone_fire_pit` | Stone Fire Pit | sprint-21 dressing/modelLibrary |
| `models/street_lamp_01` | Street Lamp | sprint-21 dressing/modelLibrary |
| `models/street_rat` | Street Rat | sprint-21 dressing/modelLibrary |
| `models/tea_set_01` | Tea Set | sprint-21 dressing/modelLibrary |
| `models/throw_pillows_01` | Throw Pillows | sprint-21 dressing/modelLibrary |
| `models/treasure_chest` | Treasure Chest | sprint-21 dressing/modelLibrary |
| `models/tree_stump_01` | Tree Stump | sprint-21 dressing/modelLibrary |
| `models/tree_stump_02` | Tree Stump | sprint-21 dressing/modelLibrary |
| `models/vintage_binocular` | Vintage Binocular | sprint-21 dressing/modelLibrary |
| `models/vintage_day_bed` | Vintage Day Bed | sprint-21 dressing/modelLibrary |
| `models/vintage_hand_drill` | Vintage Hand Drill | sprint-21 dressing/modelLibrary |
| `models/vintage_lighter` | Vintage Lighter | sprint-21 dressing/modelLibrary |
| `models/vintage_radio_transceiver` | Vintage Radio Transceiver | sprint-21 dressing/modelLibrary |
| `models/vintage_spacecraft_instrument` | Vintage Spacecraft Instrument | sprint-21 dressing/modelLibrary |
| `models/vintage_video_camera` | Vintage Video Camera | sprint-21 dressing/modelLibrary |
| `models/watering_can_metal_01` | Watering Can Metal | sprint-21 dressing/modelLibrary |
| `models/weed_plant_02` | Weed Plant | sprint-21 dressing/modelLibrary |
| `models/wicker_basket_01` | Wicker Basket | sprint-21 dressing/modelLibrary |
| `models/wicker_basket_02` | Wicker Basket | sprint-21 dressing/modelLibrary |
| `models/wine_bottles_01` | Wine Bottles | sprint-21 dressing/modelLibrary |
| `models/wooden_axe` | Wooden Axe | sprint-21 dressing/modelLibrary |
| `models/wooden_axe_02` | Wooden Axe | sprint-21 dressing/modelLibrary |
| `models/wooden_axe_03` | Wooden Axe | sprint-21 dressing/modelLibrary |
| `models/wooden_bowl_01` | Wooden Bowl | sprint-21 dressing/modelLibrary |
| `models/wooden_bowl_02` | Wooden Bowl | sprint-21 dressing/modelLibrary |
| `models/wooden_crate_02` | Wooden Crate | sprint-21 dressing/modelLibrary |
| `models/wooden_display_shelves_01` | Wooden Display Shelves | sprint-21 dressing/modelLibrary |
| `models/wooden_ladder_02` | Wooden Ladder | sprint-21 dressing/modelLibrary |
| `models/wooden_picnic_table` | Wooden Picnic Table | sprint-21 dressing/modelLibrary |
| `models/wooden_stool_01` | Wooden Stool | sprint-21 dressing/modelLibrary |
| `models/wooden_stool_02` | Wooden Stool | sprint-21 dressing/modelLibrary |
| `models/chinese_sofa` | Chinese Sofa | `sofa` variant |
| `models/chinese_console_table` | Chinese Console Table | `sideTable` variant |
| `models/chinese_tea_table` | Chinese Tea Table | `coffeeTable` variant |
| `models/chinese_armchair` | Chinese Armchair | `armchair` variant |
| `models/vintage_electric_kettle` | Vintage Electric Kettle | `kettle` props |
| `models/carved_wooden_plate` | Carved Wooden Plate | `carvedPlate` props |
| `models/food_apple_01` | Food Apple | `apple` props |
| `models/food_pears_asian_01` | Food Pears Asian | `pears` props |
| `models/metal_jerrycan_green` | Metal Jerrycan Green | `jerrycan` variant |
| `models/american_football` | American Football | `football` props |
| `models/CheeseBox_01` | Cheese Box | `cheeseBox` props |
| `models/circuit_board` | Circuit Board | `circuitBoard` props |
| `models/brass_pan_01` | Brass Pan | `pan` props |
| `models/propane_torch` | Propane Torch | `propaneTorch` props |
| `models/wooden_cutting_board` | Wooden Cutting Board | `cuttingBoard` props |
| `models/modular_pipes_plastic_01` | Modular Pipes Plastic | `indPipes` variant |
| `models/street_lamp_02` | Street Lamp 02 | `streetLamp` variant |
| `models/crystalline_iceplant` | Crystalline Iceplant | `plant` variant |
| `models/periwinkle_plant` | Periwinkle Plant | `plant` variant |
| `models/planter_pot_clay` | Planter Pot Clay | `plant` variant |
| `models/portable_searchlight` | Portable Searchlight | `searchlight` props |
| `models/lightbulb_led` | Lightbulb LED | `lightbulb` variant |
| `models/wooden_barrels_01` | Wooden Barrels | `barrel` variant |
| `models/brass_vase_04` | Brass Vase 04 | `vase` variant |

### Extraction batch 5 (sprint 28)

| Folder | Source asset | Used for |
| --- | --- | --- |
| `models/BarberShopChair_01` | Barber Shop Chair 01 | `armchair` variant |
| `models/Barrel_02` | Barrel 02 | `barrel` variant |
| `models/Chandelier_02` | Chandelier 02 | `chandelier` variant |
| `models/Chandelier_03` | Chandelier 03 | `chandelier` variant |
| `models/chinese_chandelier` | Chinese Chandelier | `chandelier` variant |
| `models/Drill_01` | Drill 01 | `powerDrill` maintenance clutter |
| `models/all_purpose_cleaner` | All Purpose Cleaner | `cleanerBottle` variant |
| `models/cleaner_tin_01` | Cleaner Tin 01 | `cleanerBottle` variant |
| `models/multi_cleaner_bottle` | Multi Cleaner Bottle | `cleanerBottle` variant |
| `models/multi_cleaner_5_litre` | Multi Cleaner 5 Litre | `cleanerBottle` variant |
| `models/leather_cleaner_can` | Leather Cleaner Can | `cleanerBottle` variant |
| `models/lubricant_spray` | Lubricant Spray | `cleanerBottle` variant |
| `models/spray_paint_bottles_02` | Spray Paint Bottles 02 | `cleanerBottle` variant |
| `models/binoculars` | Binoculars | `binoculars` variant |
| `models/digital_wrist_watch` | Digital Wrist Watch | `wristWatch` trinket |
| `models/pocket_watch` | Pocket Watch | `pocketWatch` trinket |
| `models/vintage_pocket_watch` | Vintage Pocket Watch | `pocketWatch` variant |
| `models/round_spectacles` | Round Spectacles | `spectacles` trinket |
| `models/seadogs_compass` | Seadog's Compass | `compass` trinket |
| `models/bull_head` | Bull Head | `trophyHead` wall mount |
| `models/horse_head` | Horse Head | `trophyHead` variant |
| `models/lion_head` | Lion Head | `trophyHead` variant |
| `models/carved_wooden_elephant` | Carved Wooden Elephant | `ornament` clutter |
| `models/garden_gnome` | Garden Gnome | `ornament` variant |
| `models/chemistry_set` | Chemistry Set | `chemistrySet` lab clutter |
| `models/industrial_microscope` | Industrial Microscope | `microscope` variant |
| `models/vintage_microscope` | Vintage Microscope | `microscope` variant |
| `models/chess_set` | Chess Set | `chessSet` table prop |
| `models/sungka_board` | Sungka Board | `boardGame` variant |
| `models/sungka_board_02` | Sungka Board 02 | `boardGame` variant |
| `models/chinese_cabinet` | Chinese Cabinet | `cabinet` variant |
| `models/chinese_commode` | Chinese Commode | `gothicCommode` variant |
| `models/chinese_stool` | Chinese Stool | `stool` variant |
| `models/hatchet` | Hatchet | `axe` variant |
| `models/machete` | Machete | `machete` blade prop |
| `models/ornate_medieval_dagger` | Ornate Medieval Dagger | `dagger` display prop |
| `models/ornate_medieval_mace` | Ornate Medieval Mace | `mace` display prop |
| `models/katana_stand_01` | Katana Stand 01 | `katana` display prop |
| `models/kite_shield` | Kite Shield | `kiteShield` wall mount |
| `models/brass_pot_01` | Brass Pot 01 | `brassPot` variant |
| `models/brass_pot_02` | Brass Pot 02 | `brassPot` variant |
| `models/ceramic_pot` | Ceramic Pot | `brassPot` variant |
| `models/metal_jug` | Metal Jug | `jug` variant |
| `models/hand_truck` | Hand Truck | `handTruck` maintenance prop |
| `models/pliers` | Pliers | `pliers` tool |
| `models/tongue_groove_pliers` | Tongue Groove Pliers | `pliers` variant |
| `models/screwdriver` | Screwdriver | `screwdrivers` variant |
| `models/trowel_01` | Trowel 01 | `trowel` tool |
| `models/hand_plane_no4` | Hand Plane No.4 | `handPlane` tool |
| `models/wooden_hammer_01` | Wooden Hammer 01 | `hammer` variant |
| `models/measuring_tape_01` | Measuring Tape 01 | `tapeMeasure` tool |
| `models/metal_detector` | Metal Detector | `metalDetector` prop |
| `models/plunger` | Plunger | `plunger` janitorial prop |
| `models/rubber_boots` | Rubber Boots | `rubberBoots` prop |
| `models/wooden_bucket_02` | Wooden Bucket 02 | `bucket` variant |
| `models/wooden_broom` | Wooden Broom | `broom` variant |
| `models/plastic_bottle_gallon` | Plastic Bottle Gallon | `gallonJug` clutter |
| `models/plastic_container` | Plastic Container | `plasticBin` variant |
| `models/industrial_pastic_container` | Industrial Plastic Container | `plasticBin` variant |
| `models/plastic_thermos` | Plastic Thermos | `thermos` clutter |
| `models/modified_thermos` | Modified Thermos | `thermos` variant |
| `models/pastic_torch_6v` | Plastic Torch 6V | `flashlight` variant |
| `models/small_plastic_torch` | Small Plastic Torch | `flashlight` variant |
| `models/postcard_set_01` | Postcard Set 01 | `postcards` desk clutter |
| `models/stationery_supplies` | Stationery Supplies | `stationery` desk clutter |
| `models/vintage_stapler` | Vintage Stapler | `stapler` desk clutter |
| `models/rubber_duck_toy` | Rubber Duck Toy | `rubberDuck` guest clutter |
| `models/rusted_spade_01` | Rusted Spade 01 | `spade` maintenance junk |
| `models/rusted_wheel_rim_01` | Rusted Wheel Rim 01 | `wheelRim` variant |
| `models/rusted_wheel_rim_02` | Rusted Wheel Rim 02 | `wheelRim` variant |
| `models/old_tyre` | Old Tyre | `tyre` maintenance junk |
| `models/old_military_compressor` | Old Military Compressor | `compressor` maintenance machine |
| `models/television_02` | Television 02 | `television` variant |
| `models/utility_box_02` | Utility Box 02 | `utilityBox` variant |
| `models/vintage_crutches_01` | Vintage Crutches 01 | `crutches` guest prop |
| `models/wooden_lantern_01` | Wooden Lantern 01 | `lantern` variant |
| `models/brass_diya_lantern` | Brass Diya Lantern | `lantern` variant |
| `models/long_life_food` | Long Life Food | `rations` underscript dressing |
| `models/medical_tape` | Medical Tape | `medicalTape` safe-room clutter |
| `models/croissant` | Croissant | `pastry` food clutter |
| `models/standing_picture_frame_02` | Standing Picture Frame 02 | `standingFrame` floor prop |
| `models/hanging_picture_frame_03` | Hanging Picture Frame 03 | `painting` variant |
| `models/wooden_table_02` | Wooden Table 02 | `table` variant |

### Textures — ambientCG batch 2 (CC0)

| Folder | Source asset | Used for |
| --- | --- | --- |
| `textures/terrazzo` | Terrazzo005 | lobby/gallery/milestone floors |
| `textures/ceiling-acoustic` | AcousticFoam003 | corridor/records/maintenance ceilings |
| `textures/cloth-worn` | Fabric001 | curtain pleats |
| `textures/plaster-painted` | PaintedPlaster016 | corridor/guest/records walls |
| `textures/wood-planks-dark` | WoodFloor064 | maintenance floors |
| `textures/corrugated-rust` | Metal063 | maintenance walls |
| `textures/carpet-shag` | Carpet016 | guest carpet floors |
| `textures/wood-parquet` | WoodFloor051 | lobby/gallery/milestone floors |

### Models — Poly Haven batch 6 (CC0)

| Folder | Source asset | Used for |
| --- | --- | --- |
| `models/baseball_01` | Baseball 01 | `sportsBall` guest clutter |
| `models/dirty_football` | Dirty Football | `sportsBall` variant |
| `models/gamepad` | Gamepad | `gamepad` guest clutter |
| `models/gaming_console` | Gaming Console | `gameConsole` guest furniture |
| `models/brass_blowtorch` | Brass Blowtorch | `blowtorch` maintenance tool |
| `models/propane_torch_02` | Propane Torch 02 | `blowtorch` variant |
| `models/cigarette_case` | Cigarette Case | `cigaretteCase` guest clutter |
| `models/picke_dirty_01` | Pickaxe (dirty) 01 | `pickaxe` maintenance tool |
| `models/compost_bag_02` | Compost Bag 02 | `compostBag` floor sack |
| `models/rollershutter_window_01` | Roller Shutter Window 01 | `rollerShutter` maintenance mount |
| `models/rollershutter_window_02` | Roller Shutter Window 02 | `rollerShutter` variant |
| `models/wooden_handle_saber` | Wooden Handle Saber | `katana` variant |
| `models/ceramic_vase_04` | Ceramic Vase 04 | `vase` variant |
| `models/lambis_shell` | Lambis Shell | `shell` lobby ornament |
| `models/fish_knife` | Fish Knife | `fishingKnife` maintenance tool |
| `models/wooden_spoon` | Wooden Spoon | `woodenSpoon` break-room clutter |
| `models/yellow_onion` | Yellow Onion | `onion` break-room food |
| `models/sweet_potato` | Sweet Potato | `sweetPotato` break-room food |
| `models/lemon` | Lemon | `lemon` break-room food |
| `models/painted_wooden_cabinet_02` | Painted Wooden Cabinet 02 | `cabinet` variant |
| `models/industrial_coffee_table` | Industrial Coffee Table | `coffeeTable` variant |
| `models/modern_coffee_table_01` | Modern Coffee Table 01 | `coffeeTable` variant |
| `models/modern_coffee_table_02` | Modern Coffee Table 02 | `coffeeTable` variant |
| `models/garden_gloves_01` | Garden Gloves 01 | `gardenGloves` maintenance clutter |

### Textures — ambientCG batch 3 (CC0)

| Folder | Source asset | Used for |
| --- | --- | --- |
| `textures/cardboard` | Paper005 | `cardboardBox` prop (records/maintenance/underscript/guest) |
| `textures/stone-wall` | Tiles143 | Underscript wall roll |
| `textures/ground-dirt` | Ground111 | Underscript floor roll |
| `textures/metal-grid` | MetalWalkway013 | Vent grille mesh |
| `textures/tiles-checkered` | Tiles139 | Guest/corridor floor roll |
| `textures/curtain-fabric` | Carpet016 | `curtain` prop material |
| `textures/tiles-mosaic` | PavingStones151 | Formal-room floor roll |
| `textures/brick-old` | Bricks097 | Underscript wall roll |
| `textures/granite` | Granite002A | Formal-room floor roll |

### Models — Poly Haven batch 7 (CC0)

| Folder | Source asset | Used for |
| --- | --- | --- |
| `models/dutch_ship_medium` | Dutch Ship Medium | `shipModel` mantel/desk curio |
| `models/ship_pinnace` | Ship Pinnace | `shipModel` variant |
| `models/dutch_ship_large_01` | Dutch Ship Large 01 | `shipModel` variant |
| `models/cannon_01` | Cannon 01 | `cannon` gallery/underscript display |
| `models/covered_car` | Covered Car | `coveredCar` maintenance/underscript |
| `models/overhead_crane` | Overhead Crane | `overheadCrane` large underscript halls |
| `models/modular_fire_escape` | Modular Fire Escape | `fireEscape` large underscript halls |
| `models/service_pistol` | Service Pistol | `pistol` surface ordnance |
| `models/stick_grenade` | Stick Grenade | `stickGrenade` ordnance |
| `models/lifebuoy` | Lifebuoy | `lifebuoy` wall mount |
| `models/fishermans_hat` | Fisherman's Hat | `fishHat` clutter |
| `models/carrot_cake` | Carrot Cake | `cakeSlice` food |
| `models/strawberry_chocolate_cake` | Strawberry Chocolate Cake | `cakeSlice` variant |
| `models/hamburger_buns` | Hamburger Buns | `cakeSlice` variant |
| `models/bananas` | Bananas | `fruit` food |
| `models/food_avocado_01` | Food Avocado 01 | `fruit` variant |
| `models/food_ginger_01` | Food Ginger 01 | `fruit` variant |
| `models/food_kiwi_01` | Food Kiwi 01 | `fruit` variant |
| `models/food_lime_01` | Food Lime 01 | `fruit` variant |
| `models/food_lychee_01` | Food Lychee 01 | `fruit` variant |
| `models/food_pomegranate_01` | Food Pomegranate 01 | `fruit` variant |
| `models/boulder_01` | Boulder 01 | `boulder` underscript ground |
| `models/moon_rock_03` | Moon Rock 03 | `boulder` variant |
| `models/moon_rock_05` | Moon Rock 05 | `boulder` variant |
| `models/namaqualand_boulder_04` | Namaqualand Boulder 04 | `boulder` variant |
| `models/bark_debris_01` | Bark Debris 01 | `barkDebris` ground litter |
| `models/concrete_road_barrier` | Concrete Road Barrier | `roadBarrier` variant |
| `models/rollershutter_window_03` | Roller Shutter Window 03 | `rollerShutter` variant |
| `models/football` | Football (soccer ball) | `sportsBall` variant |
| `models/wooden_table_02` | Wooden Table 02 | `table` variant |
| `models/tree_stump_01` | Tree Stump 01 | `treeStump` variant |
| root_cluster_01 | Poly Haven (CC0) | model | root breach cluster (underscript) |
| root_cluster_02 | Poly Haven (CC0) | model | root breach cluster variant |
| pine_roots | Poly Haven (CC0) | model | exposed root mat (underscript) |
| single_root | Poly Haven (CC0) | model | single root strand |
| dry_quiver_leaf | Poly Haven (CC0) | model | dead-leaf litter |
| fern_02 | Poly Haven (CC0) | model | damp fern clump |
| shrub_02 | Poly Haven (CC0) | model | weed shrub |
| shrub_03 | Poly Haven (CC0) | model | weed shrub |
| shrub_04 | Poly Haven (CC0) | model | weed shrub |
| garden_sprinkler_01 | Poly Haven (CC0) | model | garden sprinkler |
| tiles036 | ambientCG (CC0) | texture | subway tile walls (service rooms) |
| tiles071 | ambientCG (CC0) | texture | hex tile floors (records/corridor) |
| wallpaper002a | ambientCG (CC0) | texture | striped wallpaper (guest/lobby) |
| wallpaper001c | ambientCG (CC0) | texture | floral wallpaper (corridor/records) |
| officeceiling004 | ambientCG (CC0) | texture | second drop-ceiling tile |
| plaster001 | ambientCG (CC0) | texture | smooth plaster ceiling |

## Figures — Quaternius via poly.pizza (CC0), sprint 75

| Asset | Source | Animations used | Entity |
| --- | --- | --- | --- |
| `figures/quaternius_ghost.glb` | Quaternius "Ghost" (poly.pizza/m/Iip30bDHmu, CC0) | Flying_Idle, Fast_Flying, Headbutt | Whisper, Margin (ink-tinted) |
| `figures/quaternius_demon.glb` | Quaternius "Demon" (poly.pizza/m/Mo2ky6vkf8, CC0) | Flying_Idle, Fast_Flying | EchoSkin, Pursuer core |
| `figures/quaternius_skeleton.glb` | Quaternius "Skeleton" (poly.pizza/m/1XZD9GK6Kj, CC0) | Run, Idle | CorridorRunner (Sweep/Reprise/Returner) |

## Figures — Quaternius via poly.pizza (CC0), sprint 76

| Asset | Source | Animations used | Entity |
| --- | --- | --- | --- |
| `figures/quaternius_slime.glb` | Quaternius "Pink Slime" (poly.pizza/m/AyP8sQmDLh, CC0) | Idle, Walk, Bite_Front | Inkling (ink-tinted cluster) |
| `figures/quaternius_wizard.glb` | Quaternius "Wizard" (poly.pizza/m/o87Upt5uHX, CC0) | Idle, Walk | Curator body |
| `figures/quaternius_bluedemon.glb` | Quaternius "Blue Demon" (poly.pizza/m/S7jYW6Amye, CC0) | Flying_Idle, Fast_Flying | Editor |

## Figures — Quaternius via poly.pizza (CC0), sprint 77

| Asset | Source | Animations used | Entity |
| --- | --- | --- | --- |
| `figures/quaternius_alien.glb` | Quaternius "Alien" (poly.pizza/m/RRliSQBP7r, CC0) | Idle, Walk, Bite_Front, Jump | Hollow (cabinet grapple) |

## Figures — Quaternius via poly.pizza (CC0), sprint 79

| Asset | Source | Animations used | Entity |
| --- | --- | --- | --- |
| `figures/quaternius_goleling.glb` | Quaternius "Goleling Evolved" (poly.pizza/m/iHEuXiH6Aj, CC0) | Flying_Idle, Fast_Flying, Headbutt | Grafter (Underscript roamer) |

## Figures — Quaternius via poly.pizza (CC0), sprint 80

| Asset | Source | Animations used | Entity |
| --- | --- | --- | --- |
| `figures/quaternius_yeti.glb` | Quaternius "Yeti" (poly.pizza/m/S1E7idPFhe, CC0) | Idle, Walk, Bite_Front, Jump | Husk (dormant sleeper) |

## Blender prefab mill — tools/mill/prefab_kit.py (original, authored this project)

Parameterized architectural kit generated headless via Blender 4.2's Python API
and exported as glTF. Regenerate: `blender -b --factory-startup -P tools/mill/prefab_kit.py -- ALL public/assets/models`.

| Dir | Piece | Where it appears |
| --- | --- | --- |
| `archway` | Fluted pilasters + annular arch band + keystone + architrave | gallery-atrium, gallery-vaulted, gallery-rotunda |
| `colonnade` | 3-bay arcade: columns + solid arch bands + entablature | gallery-atrium, gallery-rotunda |
| `fireplace` | Stone mantel: jambs, lintel, shelf, corbels, hearth | gallery-banquet, suite-split |
| `windowArch` | Arched window: stone surround, mullion, tracery, dark pane | gallery-atrium |
| `hatch` | Riveted iron hatch: grate bars, hinge straps, wheel handle | maint-boiler, maint-service-narrow, maint-pipes |
| `medallion` | Ceiling rosette: concentric rings + petal relief | gallery-atrium, gallery-banquet |
| `vault` | Coffered ceiling panel: rail grid + inset panels + corbels | gallery-vaulted |

| `scissorgate` | Elevator scissor gate: jamb frame + crossing lattice bars | gallery-lift-lobby |
| `balustrade` | Balcony railing run: turned balusters, rail, newel posts | gallery-mezzanine |

| `boilerDrum` | Riveted boiler vessel: dome top, rivet bands, sight glass, valve | maint-boiler, maint-server |
| `pipeManifold` | Wall-mounted 3-pipe run: drop elbows, valve wheels | maint-boiler, maint-flooded, maint-server |
| `stackShelf` | Archive shelving bay: iron frame, 5 shelves, labelled file boxes | records-stacks |

### Figures — sprint 84 additions (Quaternius, CC0, poly.pizza)

| File | Source model | poly.pizza id | Rigged for |
| --- | --- | --- | --- |
| `quaternius_orc.glb` | Orc Enemy | `Q3z8ZX4kUy` | Reprise corridor runner |
| `quaternius_monkroose.glb` | Monkroose | `j4rVPvxyLg` | Returner corridor runner |
| `quaternius_ninja.glb` | Ninja | `mCNoqcqpvC` | Lurker stalker body |
| `quaternius_tribal.glb` | Tribal | `t91lDHaqRW` | doorway Crosser figure |
| `quaternius_dragon.glb` | Dragon Evolved | `LlwD0QNUPj` | Behemoth corridor blockade |

### Mill — batch 4

| Dir | Piece | Where it appears |
| --- | --- | --- |
| `breakerPanel` | Fuse cabinet: switch bank, ajar door, cable drops | maint-pipes, maint-flooded, maint-server, corr-wide |
| `wallVent` | Louvered grille with fan shadow | maint-pipes, maint-flooded, corr-wide |
| `portcullis` | Spiked iron grid gate | maint-service-narrow |

Sprint 85 — Underscript dressing: mill pieces placed across u-corridor, u-records-cage, u-long-hall, u-server, u-narrow-stacks (portcullis, hatches, stackShelf bays, pipeManifold, breaker panels, wall vents).

### Mill — batch 5 (guest furniture)

| Dir | Piece | Where it appears |
| --- | --- | --- |
| `wardrobe` | Double-door wardrobe: cornice, panelled doors, bun feet, escutcheons | guest-standard, suite-split |
| `dresser` | Three-drawer chest: overhanging top, recessed faces, pulls | guest-standard, suite-split |
| `nightstand` | Bedside cabinet variant (merged into existing `nightstand` variants) | guest-standard, suite-split |
