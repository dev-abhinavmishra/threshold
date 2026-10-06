"""
THRESHOLD prefab mill — parameterized architectural kit built in Blender
headless and exported as glTF (separate .gltf + .bin + textures) matching the
game's modelLibrary layout (public/assets/models/<dir>/model.gltf).

Run:  blender -b --factory-startup -P tools/mill/prefab_kit.py -- <kind> <outdir>
  or: blender -b --factory-startup -P tools/mill/prefab_kit.py -- ALL <outdir>

Conventions: Blender Z-up in, glTF +Y-up out. All dims in meters, built around
the origin with the piece's floor at z=0 unless noted. Two materials per piece
max so the runtime bake stays cheap: a primary body material and a dark
contrast material.
"""
import bpy
import sys
import math
from mathutils import Vector

# ---------- material helpers ----------

def mat(name, color, rough=0.85, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return m

STONE = None
DARK = None
IRON = None
BRASS = None
WOOD = None
WORN = None
CLOTH = None

def init_mats():
    global STONE, DARK, IRON, WOOD, WORN, CLOTH, BRASS
    STONE = mat('stone', (0.42, 0.38, 0.33))
    DARK = mat('darkwood', (0.16, 0.10, 0.07), rough=0.7)
    WOOD = mat('oakwood', (0.32, 0.22, 0.13), rough=0.8)
    IRON = mat('iron', (0.11, 0.11, 0.12), rough=0.45, metal=0.85)
    WORN = mat('wornleather', (0.28, 0.18, 0.11), rough=0.85)
    CLOTH = mat('bookcloth', (0.2, 0.24, 0.2), rough=0.9)
    BRASS = mat('brass', (0.42, 0.30, 0.12), rough=0.35, metal=0.9)

# ---------- build helpers ----------

def cube(name, loc, scale, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier='bevel')
    o.data.materials.append(material)
    return o

def cyl(name, loc, radius, depth, material, seg=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    return o

def torus(name, loc, major, minor, material, rot=(0, 0, 0), seg=24):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=seg, minor_segments=8,
                                     location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    return o


def ring_seg(name, center, r_out, r_in, depth, material, segs=18):
    """Half-annulus (arch band) prism: flat arch crown from z=0..pi at center."""
    cx, cy, cz = center
    verts, faces = [], []
    for i in range(segs + 1):
        t = math.pi * i / segs
        co, si = math.cos(t), math.sin(t)
        verts += [
            (cx + co * r_out, cy - depth / 2, cz + si * r_out),
            (cx + co * r_in, cy - depth / 2, cz + si * r_in),
            (cx + co * r_out, cy + depth / 2, cz + si * r_out),
            (cx + co * r_in, cy + depth / 2, cz + si * r_in),
        ]
    for i in range(segs):
        a = i * 4
        faces += [
            (a, a + 4, a + 6, a + 2),       # outer
            (a + 1, a + 3, a + 7, a + 5),   # inner
            (a, a + 1, a + 5, a + 4),       # front
            (a + 2, a + 6, a + 7, a + 3),   # back
        ]
    faces += [(0, 2, 3, 1)]
    e = segs * 4
    faces += [(e, e + 1, e + 3, e + 2)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    return o

def join_all(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    return o

def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLTF_SEPARATE',
        export_apply=True, export_yup=True,
        export_materials='EXPORT', export_cameras=False, export_lights=False,
    )

def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    init_mats()

# ---------- pieces ----------

def archway():
    """Two fluted pilasters + elliptical arch + keystone + architrave."""
    w, h, d = 2.6, 3.4, 0.34
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.18)
        cube('plinth', (x, 0, 0.14), (0.44, d, 0.28), STONE, 0.02)
        # fluted column: core + 8 thin rods
        cyl('shaft', (x, 0, h * 0.32), 0.13, h * 0.56, STONE)
        for i in range(8):
            a = i / 8 * math.tau
            cyl('flute', (x + math.cos(a) * 0.115, math.sin(a) * 0.115, h * 0.32),
                0.018, h * 0.56, DARK, 8)
        cube('capital', (x, 0, h * 0.62), (0.42, d, 0.16), STONE, 0.015)
    # arch — solid annular band seated on the capitals
    cy = 0
    cz = h * 0.62
    r_out = w / 2 - 0.05
    ring_seg('arch', (0, cy, cz), r_out, r_out - 0.3, d + 0.06, STONE, 20)
    cube('keystone', (0, cy, cz + r_out - 0.12), (0.2, d + 0.1, 0.3), DARK, 0.015)
    cube('architrave', (0, cy, h - 0.06), (w + 0.24, d + 0.08, 0.16), STONE, 0.02)
    join_all('archway')

def vault():
    """Coffered ceiling panel, 4x4: deep frame + rail grid + inset panels."""
    s, deep = 4.0, 0.22
    # perimeter band
    for (x, y, w2, d2) in [(0, -s/2+0.15, s, 0.3), (0, s/2-0.15, s, 0.3),
                           (-s/2+0.15, 0, 0.3, s), (s/2-0.15, 0, 0.3, s)]:
        cube('band', (x, y, 0.0), (w2, d2, deep), STONE, 0.02)
    # rail grid — 3 cells each way
    cell = (s - 0.6) / 3
    for i in range(4):
        p = -s / 2 + 0.3 + i * cell
        cube('rail', (p, 0, -0.02), (0.14, s - 0.6, deep - 0.06), STONE, 0.015)
        cube('rail', (0, p, -0.02), (s - 0.6, 0.14, deep - 0.06), STONE, 0.015)
    # inset panels — darker, slightly recessed
    for i in range(3):
        for j in range(3):
            x = -s / 2 + 0.3 + (i + 0.5) * cell
            y = -s / 2 + 0.3 + (j + 0.5) * cell
            cube('panel', (x, y, 0.06), (cell - 0.22, cell - 0.22, 0.05), DARK, 0.01)
    # corner corbels
    for sx in (-1, 1):
        for sy in (-1, 1):
            cube('corbel', (sx * (s / 2 - 0.15), sy * (s / 2 - 0.15), -0.3),
                 (0.26, 0.26, 0.55), STONE, 0.02)
    join_all('vault')

def fireplace():
    """Stone mantel: jambs, arch opening, frieze, shelf, hearth."""
    w, h, d = 2.2, 1.6, 0.5
    ow, oh = 1.1, 0.9  # opening
    for sx in (-1, 1):
        cube('jamb', (sx * (w / 2 - 0.25), 0, h * 0.4), (0.5, d, h * 0.8), STONE, 0.02)
        cube('jambface', (sx * (w / 2 - 0.25), -d / 2 - 0.03, h * 0.4), (0.36, 0.06, h * 0.72), DARK, 0.01)
    cube('lintel', (0, 0, h - 0.35), (w, d, 0.5), STONE, 0.02)
    cube('shelf', (0, -0.06, h + 0.05), (w + 0.3, d + 0.12, 0.1), STONE, 0.02)
    cube('corbelL', (-w / 2 + 0.2, 0, h - 0.1), (0.3, d, 0.2), DARK, 0.02)
    cube('corbelR', (w / 2 - 0.2, 0, h - 0.1), (0.3, d, 0.2), DARK, 0.02)
    cube('hearth', (0, -d * 0.4, 0.035), (w * 0.95, d * 1.6, 0.07), DARK, 0.01)
    join_all('fireplace')

def windowArch():
    """Tall arched window: frame, sill, mullion + tracery bars."""
    w, h, t = 1.2, 2.4, 0.12
    r = w / 2
    # frame: two jambs + semicircle of voussoirs + sill
    for sx in (-1, 1):
        cube('jamb', (sx * (w / 2 + 0.05), 0, (h - r) / 2), (0.1, t, h - r), STONE, 0.008)
    ring_seg('arc', (0, 0, h - r), r + 0.11, r + 0.01, t, STONE, 16)
    cube('sill', (0, -0.02, 0.03), (w + 0.24, t + 0.08, 0.06), STONE, 0.008)
    # tracery: center mullion + three horizontal bars + fan spokes in arch
    cube('mullion', (0, 0, (h - r) / 2 + 0.1), (0.045, t * 0.7, h - r - 0.1), IRON, 0.004)
    for fy in (0.32, 0.55, 0.78):
        cube('bar', (0, 0, (h - r) * fy + 0.15), (w - 0.06, t * 0.6, 0.035), IRON, 0.003)
    for i in (-1, 0, 1):
        spoke = cube('spoke', (0, 0, h - r + r * 0.42), (0.035, t * 0.6, r * 0.72), IRON, 0.003)
        spoke.rotation_euler[1] = i * 0.42
    # glass pane — faint dark sheet so it isn't see-through night
    cube('pane', (0, 0.025, h * 0.48), (w - 0.08, 0.01, h * 0.9), DARK, 0)
    join_all('windowArch')

def hatch():
    """Underscript iron hatch: riveted frame + grate door + hinges."""
    w, h, d = 1.1, 1.9, 0.16
    cube('frame', (0, 0, h / 2), (w, d, h), IRON, 0.02)
    # recessed door face
    cube('door', (0, -0.03, h / 2), (w - 0.14, 0.05, h - 0.14), DARK, 0.01)
    # grate bars
    for i in range(6):
        cube('bar', (-w / 2 + 0.1 + i * (w - 0.2) / 5, -0.06, h / 2), (0.035, 0.03, h - 0.2), IRON, 0.004)
    for fy in (0.3, 0.62):
        cube('barH', (0, -0.065, h * fy), (w - 0.2, 0.035, 0.035), IRON, 0.004)
    # hinge straps + wheel handle
    for fy in (0.25, 0.72):
        cube('hinge', (w / 2 - 0.05, -0.08, h * fy), (0.16, 0.06, 0.07), IRON, 0.005)
    torus('wheel', (-0.12, -0.12, h * 0.52), 0.14, 0.028, IRON, (math.pi / 2, 0, 0), 16)
    for i in range(3):
        spoke = cyl('spoke', (-0.12, -0.12, h * 0.52), 0.018, 0.26, IRON, 6)
        spoke.rotation_euler[0] = math.pi / 2
        spoke.rotation_euler[2] = i * math.tau / 3
    # rivets
    for sx in (-1, 1):
        for i in range(6):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.018,
                location=(sx * (w / 2 - 0.04), -d / 2 - 0.005, 0.15 + i * (h - 0.3) / 5))
    join_all('hatch')

def medallion():
    """Ceiling rosette: concentric rings + petal relief + center boss."""
    torus('ring0', (0, 0, 0.02), 0.42, 0.05, STONE, seg=32)
    torus('ring1', (0, 0, 0.03), 0.28, 0.035, STONE, seg=28)
    for i in range(12):
        a = i / 12 * math.tau
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8,
            location=(math.cos(a) * 0.35, math.sin(a) * 0.35, 0.0))
        petal = bpy.context.object
        petal.scale = (0.09, 0.045, 0.03)
        petal.rotation_euler[2] = a
        bpy.ops.object.transform_apply(scale=True)
        petal.data.materials.append(STONE)
    cyl('boss', (0, 0, 0.0), 0.1, 0.07, DARK)
    join_all('medallion')

def colonnade():
    """3-bay colonnade segment: plinths, columns, arches, entablature."""
    bay, h, d = 1.8, 3.0, 0.3
    total = bay * 3 + 0.4
    for i in range(4):
        x = -total / 2 + 0.2 + i * bay
        cube('plinth', (x, 0, 0.12), (0.4, d, 0.24), STONE, 0.015)
        cyl('col', (x, 0, h * 0.38), 0.11, h * 0.52, STONE)
        cube('cap', (x, 0, h * 0.66), (0.34, d, 0.12), STONE, 0.012)
    # arches between columns — solid annular bands
    for i in range(3):
        x0 = -total / 2 + 0.2 + i * bay + bay / 2
        ring_seg('arc', (x0, 0, h * 0.66), bay / 2 - 0.02, bay / 2 - 0.28, d, STONE, 14)
    cube('entab', (0, 0, h * 0.66 + 0.62), (total, d + 0.06, 0.3), STONE, 0.02)
    join_all('colonnade')


def scissorgate():
    """Old elevator gate — diamond lattice of crossing bars in a frame."""
    w, h, d = 2.0, 2.2, 0.08
    # frame
    for sx in (-1, 1):
        cube('jamb', (sx * (w / 2 - 0.04), 0, h / 2), (0.08, d, h), IRON, 0.008)
    cube('railT', (0, 0, h - 0.05), (w, d, 0.1), IRON, 0.008)
    cube('railB', (0, 0, 0.05), (w, d, 0.1), IRON, 0.008)
    # lattice: bars at +-45 deg crossing
    n = 7
    span = h * 0.88
    for i in range(n):
        for sgn in (-1, 1):
            bar = cube('bar', (-w / 2 + 0.42 + i * (w - 0.84) / (n - 1), 0, h / 2),
                       (0.028, d * 0.5, span), IRON, 0.002)
            bar.rotation_euler[1] = sgn * 0.42
    join_all('scissorgate')

def balustrade():
    """Balcony railing run — rail, balusters, newel ends. 3m segment."""
    w = 3.0
    cube('rail', (0, 0, 1.02), (w, 0.1, 0.1), DARK, 0.015)
    cube('base', (0, 0, 0.04), (w, 0.12, 0.08), STONE, 0.01)
    for i in range(13):
        x = -w / 2 + 0.18 + i * (w - 0.36) / 12
        # turned baluster: stack of beads
        for (bz, br) in [(0.12, 0.045), (0.3, 0.032), (0.48, 0.05), (0.62, 0.03), (0.78, 0.042), (0.9, 0.028)]:
            cyl('bal', (x, 0, bz), br, 0.1, STONE, 10)
    for sx in (-1, 1):
        cube('newel', (sx * (w / 2 - 0.07), 0, 0.55), (0.16, 0.14, 1.1), STONE, 0.02)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.08,
            location=(sx * (w / 2 - 0.07), 0, 1.16))
        bpy.context.object.data.materials.append(STONE)
    join_all('balustrade')


def boilerDrum():
    """Riveted rivet-seamed boiler vessel with sight glass + pipes. ~2m."""
    cyl('shell', (0, 0, 1.0), 0.75, 1.7, IRON, 20)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=0.75, location=(0, 0, 1.85))
    d = bpy.context.object; d.scale.z = 0.4; d.data.materials.append(IRON)
    cyl('base', (0, 0, 0.1), 0.82, 0.2, STONE, 20)
    # rivet bands
    for bz in (0.35, 1.0, 1.65):
        ring_seg('band', (0, 0, bz), 0.78, 0.76, 0.06, IRON)
    # sight glass tube
    cyl('glass', (0.72, 0, 1.0), 0.05, 1.0, BRASS := bpy.data.materials.new('brass'), 10)
    BRASS.diffuse_color = (0.55, 0.42, 0.18, 1); BRASS.metallic = 0.9
    # top pipe + valve wheel
    cyl('pipe', (0, 0, 2.35), 0.12, 0.7, IRON, 12)
    torus('wheel', (0.18, 0, 2.3), 0.16, 0.025, IRON)
    join_all('boilerDrum')

def pipeManifold():
    """Wall-mounted 3-pipe run with elbows and two valve wheels. 3m wide."""
    L = 3.0
    for (py, pz) in [(0.06, 2.4), (0.0, 2.1), (0.09, 1.8)]:
        cyl('pipe', (0, py, pz), 0.055, L, IRON, 10).rotation_euler[1] = math.pi / 2
    # drop elbows at both ends
    for sx in (-1, 1):
        cyl('drop', (sx * (L / 2 - 0.05), 0.06, 2.0), 0.055, 0.85, IRON, 10)
        torus('elb', (sx * (L / 2 - 0.05), 0.06, 2.35), 0.07, 0.05, IRON)
    # valve wheels on the mid pipe
    for vx in (-0.8, 0.7):
        cyl('stem', (vx, 0.16, 2.1), 0.02, 0.14, IRON, 8).rotation_euler[0] = math.pi / 2
        torus('vwheel', (vx, 0.24, 2.1), 0.11, 0.02, IRON)
    join_all('pipeManifold')

def stackShelf():
    """Archive shelf bay — frame + 5 shelves + labelled boxes. 1.6w."""
    w, h, d = 1.6, 2.3, 0.5
    for sx in (-1, 1):
        cube('post', (sx * (w / 2 - 0.03), 0, h / 2), (0.06, d, h), IRON, 0.005)
    for i in range(5):
        z = 0.15 + i * 0.46
        cube('shelf', (0, 0, z), (w, d, 0.04), IRON, 0.004)
        if i < 4:
            # file boxes on the shelf
            for b in range(3):
                bx = -w / 2 + 0.3 + b * (w - 0.6) / 2
                cube('box', (bx, 0.02, z + 0.16), (0.36, d * 0.75, 0.3), DARK, 0.008)
                cube('lbl', (bx, -d * 0.38, z + 0.16), (0.2, 0.01, 0.08), PAPER := bpy.data.materials.new('paper'), 0)
                PAPER.diffuse_color = (0.75, 0.68, 0.5, 1)
    join_all('stackShelf')


def breakerPanel():
    """Fuse/breaker box: cabinet, switch bank, warning plate, cable drops."""
    w, h, d = 0.9, 1.4, 0.18
    cube('cab', (0, 0, h / 2), (w, d, h), IRON, 0.02)
    # hinged door ajar on the right edge
    door = cube('door', (w / 2 + 0.16, -0.14, h / 2), (0.025, 0.34, h * 0.94), IRON, 0.01)
    door.rotation_euler[2] = 0.55
    # breaker toggles in rows
    for r in range(4):
        for cix in range(3):
            cube('sw', (-w / 2 + 0.2 + cix * 0.25, -d / 2 - 0.02, 0.9 - r * 0.22),
                 (0.12, 0.04, 0.08), DARK, 0.004)
    # cable drops below
    for cx in (-0.25, 0.05, 0.3):
        cyl('cable', (cx, 0, -0.4), 0.02, 0.8, DARK, 8)
    join_all('breakerPanel')

def wallVent():
    """Louvered wall grille with fan shadow behind. 0.9 sq."""
    w = 0.9
    cube('frame', (0, 0, 0), (w, 0.06, w), DARK, 0.02)
    # inner recess
    cube('recess', (0, 0.02, 0), (w - 0.12, 0.03, w - 0.12), IRON, 0)
    # fan silhouette
    for i in range(4):
        bl = cube('blade', (0, 0.04, 0), (0.3, 0.01, 0.1), DARK, 0.01)
        bl.rotation_euler[1] = i * math.pi / 4
        bl.location = (0, 0.04, 0)
    # louvers angled across the front
    for i in range(7):
        lv = cube('lv', (0, -0.03, -w / 2 + 0.1 + i * 0.11), (w - 0.1, 0.015, 0.08), DARK, 0.002)
        lv.rotation_euler[0] = 0.5
    join_all('wallVent')

def portcullis():
    """Underscript gate — iron grid of bars with spike feet, hangs in a frame."""
    w, h = 2.4, 2.6
    # frame channel posts
    for sx in (-1, 1):
        cube('chan', (sx * (w / 2 - 0.05), 0, h / 2), (0.1, 0.14, h), IRON, 0.008)
    cube('head', (0, 0, h - 0.06), (w, 0.16, 0.12), IRON, 0.008)
    # vertical bars with spike tips
    n = 9
    for i in range(n):
        x = -w / 2 + 0.16 + i * (w - 0.32) / (n - 1)
        cyl('bar', (x, 0, h / 2), 0.025, h - 0.3, IRON, 8)
        # spike foot
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.04, radius2=0, depth=0.22,
            location=(x, 0, 0.11))
        bpy.context.object.data.materials.append(IRON)
    # horizontal straps
    for z in (0.4, 1.3, 2.2):
        cube('strap', (0, -0.01, z), (w - 0.1, 0.03, 0.07), IRON, 0.004)
    join_all('portcullis')


def wardrobe():
    """Tall double-door wardrobe: cornice, panelled doors, bun feet, escutcheons."""
    w, h, d = 1.3, 2.15, 0.62
    cube('body', (0, 0, h / 2), (w, d, h - 0.25), WOOD, 0.015)
    # cornice + plinth
    cube('cornice', (0, 0, h - 0.05), (w + 0.1, d + 0.08, 0.12), WOOD, 0.02)
    cube('plinth', (0, 0, 0.1), (w + 0.06, d + 0.05, 0.2), WOOD, 0.015)
    # bun feet
    for sx in (-1, 1):
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.055,
                location=(sx * (w / 2 - 0.08), sy * (d / 2 - 0.08), 0.05))
            bpy.context.object.data.materials.append(WOOD)
    # door panels — two raised panels per leaf, recessed stiles
    for sx in (-1, 1):
        dx = sx * w / 4
        for pz, ph in [(0.55, 0.62), (1.4, 1.0)]:
            cube('panel', (dx, -d / 2 - 0.015, pz), (w / 2 - 0.18, 0.025, ph), DARK, 0.01)
        # seam between leaves
        cube('stile', (0, -d / 2 - 0.005, h / 2), (0.04, 0.02, h - 0.3), WOOD, 0.005)
        # escutcheon
        cyl('esc', (sx * 0.07, -d / 2 - 0.02, 1.0), 0.018, 0.02, IRON, 8).rotation_euler[0] = math.pi / 2
    join_all('wardrobe')

def dresser():
    """Three-drawer chest: overhanging top, recessed drawer faces, pulls."""
    w, h, d = 1.0, 0.95, 0.5
    cube('body', (0, 0, h / 2), (w, d, h - 0.08), WOOD, 0.012)
    cube('top', (0, 0, h - 0.02), (w + 0.08, d + 0.06, 0.05), WOOD, 0.012)
    for i in range(3):
        z = 0.28 + i * 0.24
        cube('drawer', (0, -d / 2 - 0.012, z), (w - 0.14, 0.03, 0.2), DARK, 0.008)
        for sx in (-1, 1):
            cyl('pull', (sx * 0.14, -d / 2 - 0.04, z), 0.018, 0.03, IRON, 8).rotation_euler[0] = math.pi / 2
    # feet
    for sx in (-1, 1):
        for sy in (-1, 1):
            cube('foot', (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), 0.035), (0.06, 0.06, 0.07), WOOD, 0.008)
    join_all('dresser')

def nightstand():
    """Bedside cabinet: one drawer over a recessed door, turned legs."""
    w, h, d = 0.48, 0.72, 0.4
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('leg', (sx * (w / 2 - 0.035), sy * (d / 2 - 0.035), 0.16), 0.028, 0.32, WOOD, 8)
    cube('body', (0, 0, 0.32 + (h - 0.32) / 2), (w, d, h - 0.32), WOOD, 0.01)
    cube('top', (0, 0, h - 0.015), (w + 0.05, d + 0.04, 0.035), WOOD, 0.01)
    cube('drawer', (0, -d / 2 - 0.01, h - 0.14), (w - 0.1, 0.025, 0.14), DARK, 0.006)
    cyl('knob', (0, -d / 2 - 0.03, h - 0.14), 0.015, 0.025, IRON, 8).rotation_euler[0] = math.pi / 2
    cube('door', (0, -d / 2 - 0.01, 0.48), (w - 0.1, 0.02, 0.22), DARK, 0.006)
    join_all('nightstand')

def door_leaf():
    """Six-panel molded passage door, 1.0m wide x 2.2m high, floor at z=0.

    Modeled on real molded joinery: proud stiles + rails, recessed fields,
    beveled raised panels, knob + backplate + escutcheon, strap hinges on the
    hinge stile. The game scales x to the door port's width.
    """
    w, h, t = 1.0, 2.2, 0.05
    cube('slab', (0, 0, h / 2), (w, t, h), WOOD, 0.005)
    # proud stiles + rails — real doors are joined, not flat slabs
    for sx in (-1, 1):
        cube('stile', (sx * (w / 2 - 0.045), 0, h / 2), (0.075, t + 0.014, h), WOOD, 0.006)
    for zc in (0.055, h - 0.055):
        cube('rail', (0, 0, zc), (w - 0.1, t + 0.014, 0.11), WOOD, 0.006)
    cube('lockrail', (0, 0, 1.05), (w - 0.1, t + 0.012, 0.14), WOOD, 0.006)
    # six recessed fields with beveled raised panels on both faces
    rows = [(0.45, 0.52), (1.05, 0.74), (1.75, 0.5)]
    for sy in (-1, 1):
        for zc, ph in rows:
            for cx in (-0.24, 0.24):
                cube('field', (cx, sy * (t / 2 + 0.004), zc), (0.36, 0.01, ph + 0.05), DARK, 0.004)
                cube('panel', (cx, sy * (t / 2 + 0.012), zc), (0.31, 0.016, ph), WOOD, 0.02)
        # knob backplate, escutcheon, strap hinges (hinge stile = -x)
        cube('backplate', (0.4, sy * (t / 2 + 0.006), 1.05), (0.06, 0.012, 0.2), IRON, 0.004)
        cube('escutcheon', (0.4, sy * (t / 2 + 0.005), 0.92), (0.022, 0.01, 0.055), DARK, 0.003)
        for hz in (0.35, 1.1, 1.85):
            cube('hinge', (-0.42, sy * (t / 2 + 0.006), hz), (0.1, 0.014, 0.15), IRON, 0.004)
    for sy in (-1, 1):
        cyl('knob', (0.4, sy * (t / 2 + 0.045), 1.05), 0.035, 0.035, IRON, 14).rotation_euler[0] = math.pi / 2
    join_all('doorLeaf')


def boneArch():
    """Ribcage door arch — a rack of half-arch ribs stepping back over the
    opening, femur posts at the spring line, vertebrae along the crown."""
    w, h, d = 2.2, 3.0, 0.5
    n = 9
    spring = h * 0.45          # ribs spring from here
    r_out = w * 0.52           # crown lands at spring + r_out ≈ h*0.45+1.14
    for i in range(n):
        y = -d / 2 + i * (d / (n - 1))
        ring_seg('rib', (0, y, spring), r_out, r_out - 0.07, 0.028, DARK, 18)
        # rib ends get knob swellings where they meet the posts
        for sx in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.05,
                location=(sx * r_out * 0.97, y, spring))
            bpy.context.object.data.materials.append(DARK)
    # femur posts carry the spring line
    for sx in (-1, 1):
        for i in range(n):
            y = -d / 2 + i * (d / (n - 1))
            cyl('femur', (sx * r_out * 0.97, y, spring / 2), 0.032, spring, DARK, 8)
    # spine beam + vertebra bumps along the crown
    crown = spring + r_out
    cube('spine', (0, 0, crown - 0.02), (0.13, d + 0.08, 0.12), DARK, 0.01)
    for i in range(n):
        y = -d / 2 + i * (d / (n - 1))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=0.055,
            location=(0, y, crown + 0.03))
        bpy.context.object.data.materials.append(STONE)
    join_all('boneArch')


def toppledColumn():
    """Broken column: standing stump with torn rim + fallen drum + capital."""
    r = 0.22
    cyl('stump', (0, 0, 0.5), r, 1.0, STONE, 14)
    cube('base', (0, 0, 0.08), (0.6, 0.6, 0.16), STONE, 0.015)
    # jagged crown — a ring of tilted chips
    for i in range(9):
        a = i / 9 * math.tau
        chip = cube('chip', (math.cos(a) * r * 0.82, math.sin(a) * r * 0.82, 1.02 + (i % 3) * 0.03),
                    (0.1, 0.1, 0.12 + (i % 3) * 0.05), STONE, 0.01)
        chip.rotation_euler[2] = a
    # fallen drum beside it, axis along x, resting on debris
    drum = cyl('drum', (0.85, 0.15, r), r * 0.92, 0.9, STONE, 14)
    drum.rotation_euler[1] = math.pi / 2
    drum.rotation_euler[2] = 0.16
    cube('cap', (1.45, 0.32, 0.16), (0.5, 0.5, 0.3), STONE, 0.015).rotation_euler[2] = 0.5
    join_all('toppledColumn')


def wallNiche():
    """Arched wall niche — back panel, half-dome shell, sill, side pilasters."""
    w, h, d = 1.1, 2.2, 0.42
    cube('back', (0, d / 2 - 0.03, h / 2), (w, 0.06, h), DARK, 0.01)
    for sx in (-1, 1):
        cube('pilaster', (sx * (w / 2 + 0.07), 0, h * 0.42), (0.14, d, h * 0.84), STONE, 0.015)
    ring_seg('dome', (0, 0, h - w / 2 - 0.05), w / 2 + 0.14, w / 2, d, STONE, 16)
    # half-dome shell — squashed sphere, back half only
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=w / 2,
        location=(0, d / 2 - 0.06, h - w / 2 - 0.05))
    dome = bpy.context.object
    dome.scale = (1, 0.5, 0.6)
    bpy.ops.object.transform_apply(scale=True)
    dome.data.materials.append(DARK)
    cube('sill', (0, -0.02, h - w / 2 - 0.12 - 0.55), (w + 0.1, d * 0.8, 0.08), STONE, 0.012)
    cube('header', (0, 0, h - 0.04), (w + 0.4, d, 0.14), STONE, 0.015)
    join_all('wallNiche')


def stairGate():
    """Sealed stairwell: eight risers to a landing walled by an iron gate."""
    w, d = 1.6, 2.4
    step_h, step_d = 0.17, 0.28
    n = 7
    for i in range(n):
        cube('riser', (0, -d / 2 + (i + 0.5) * step_d, (i + 0.5) * step_h),
             (w, step_d, (i + 1) * step_h), STONE, 0.008)
    # landing deck at the top
    land_d = d - n * step_d + 0.7
    cube('deck', (0, -d / 2 + n * step_d + land_d / 2, n * step_h - 0.08),
         (w, land_d, 0.16), STONE, 0.01)
    top_z = n * step_h
    # gate across the landing end
    gw, gh = w - 0.1, 2.0
    gy = -d / 2 + n * step_d + land_d - 0.08
    for sx in (-1, 1):
        cube('gatepost', (sx * (gw / 2 - 0.04), gy, top_z + gh / 2), (0.08, 0.1, gh), IRON, 0.006)
    for i in range(7):
        x = -gw / 2 + 0.12 + i * (gw - 0.24) / 6
        cyl('gbar', (x, gy, top_z + gh / 2), 0.02, gh - 0.15, IRON, 8)
    for z in (top_z + 0.35, top_z + gh - 0.35):
        cube('gstrap', (0, gy - 0.01, z), (gw - 0.1, 0.03, 0.06), IRON, 0.003)
    # side balustrade along the run
    for sx in (-1, 1):
        cube('rail', (sx * (w / 2 - 0.03), -d / 2 + n * step_d / 2, top_z * 0.62),
             (0.06, n * step_d, 0.06), IRON, 0.005).rotation_euler[1] = 0.0
        for i in range(4):
            zstep = (i + 0.5) / 4 * n * step_h
            cyl('baluster', (sx * (w / 2 - 0.03), -d / 2 + (i + 0.7) * step_d, zstep / 2 + 0.3),
                0.018, zstep, IRON, 8)
    join_all('stairGate')



def transomWindow():
    """Door fanlight — half-round transom with radial muntins over a sill."""
    w, r = 1.3, 0.55
    # sill + side jambs
    cube('sill', (0, 0, 0.04), (w + 0.1, 0.14, 0.08), STONE, 0.01)
    for sx in (-1, 1):
        cube('jamb', (sx * (w / 2 - 0.03), 0, 0.04 + r / 2), (0.06, 0.1, r), STONE, 0.008)
    # arched head band
    ring_seg('head', (0, 0, 0.04 + r), w / 2 + 0.05, w / 2 - 0.03, 0.1, STONE, 16)
    # dark glass pane behind
    cube('glass', (0, 0.035, 0.04 + r / 2), (w - 0.06, 0.02, r), DARK, 0.005)
    # radial muntins — five spokes fanning from the sill center
    for i in range(5):
        a = math.pi * (i + 0.5) / 5
        bar = cube('muntin', (0, -0.005, 0.04 + r / 2), (0.025, 0.02, r * 0.92), IRON, 0.002)
        bar.rotation_euler[1] = a - math.pi / 2
    # center hub
    cyl('hub', (0, -0.01, 0.04), 0.05, 0.06, IRON, 10)
    join_all('transomWindow')


def bookCart():
    """Library cart — two canted shelves, push handle, four casters."""
    w, h, d = 0.9, 1.0, 0.5
    # end panels
    for sx in (-1, 1):
        cube('end', (sx * (w / 2 - 0.025), 0, h / 2), (0.05, d, h), WOOD, 0.008)
    # two shelves canted toward each other
    for i, zz in enumerate((0.32, 0.72)):
        sh = cube('shelf', (0, 0, zz), (w - 0.08, d - 0.06, 0.035), WOOD, 0.006)
        sh.rotation_euler[0] = 0.18 if i == 0 else -0.18
    # book rows on each shelf (leaning)
    rng = [(i * 0.13 - 0.32) for i in range(6)]
    for zz, tilt in ((0.36, 0.18), (0.76, -0.18)):
        for i, x in enumerate(rng):
            bh = 0.2 + (i % 3) * 0.03
            bk = cube('book', (x, -0.02 + (i % 2) * 0.06, zz + bh / 2),
                      (0.05, 0.16, bh), WORN if i % 4 == 0 else CLOTH, 0.003)
            bk.rotation_euler[1] = (i % 5 - 2) * 0.05
            bk.rotation_euler[0] = tilt
    # push handle across the top
    cyl('hnd', (0, -d / 2 - 0.05, h - 0.02), 0.02, w - 0.1, IRON, 10).rotation_euler[2] = math.pi / 2
    for sx in (-1, 1):
        cyl('post', (sx * (w / 2 - 0.05), -d / 2 - 0.02, h - 0.12), 0.015, 0.2, IRON, 8)
    # casters
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('wheel', (sx * (w / 2 - 0.06), sy * (d / 2 - 0.08), 0.05), 0.05, 0.03, IRON, 10).rotation_euler[0] = math.pi / 2
    join_all('bookCart')


def radiatorFin():
    """Cast-iron column radiator — fin tubes on feet, supply valve at one end."""
    w, h, d = 1.0, 0.65, 0.2
    # two headers
    cube('headLo', (0, 0, h * 0.22), (w - 0.08, d * 0.8, 0.07), IRON, 0.01)
    cube('headHi', (0, 0, h * 0.82), (w - 0.08, d * 0.8, 0.07), IRON, 0.01)
    # fin columns
    n = 9
    for i in range(n):
        x = -w / 2 + 0.09 + i * (w - 0.18) / (n - 1)
        cyl('fin', (x, 0, h * 0.5), 0.035, h * 0.66, IRON, 8)
    # feet
    for sx in (-1, 1):
        cube('foot', (sx * (w / 2 - 0.12), 0, 0.05), (0.12, d, 0.1), IRON, 0.01)
    # supply pipe + wheel valve on the right
    cyl('pipe', (w / 2 - 0.02, 0, h * 0.35), 0.025, h * 0.7, IRON, 10)
    torus('valve', (w / 2 - 0.02, -0.06, h * 0.55), 0.055, 0.012, IRON, rot=(math.pi / 2, 0, 0), seg=14)
    join_all('radiatorFin')


def dumbwaiter():
    """Service dumbwaiter — recessed wall shaft, car caught between floors."""
    w, h, d = 0.9, 1.8, 0.5
    # shaft back + side jambs
    cube('shaft', (0, d / 2 - 0.02, h / 2), (w, 0.05, h), DARK, 0.005)
    for sx in (-1, 1):
        cube('jamb', (sx * (w / 2 + 0.05), 0, h / 2), (0.1, d, h), WOOD, 0.012)
    cube('header', (0, 0, h - 0.05), (w + 0.2, d, 0.1), WOOD, 0.012)
    cube('sillB', (0, 0, 0.05), (w + 0.2, d, 0.1), WOOD, 0.012)
    # car shelf mid-shaft with a covered dish
    cube('car', (0, d / 2 - 0.06, h * 0.44), (w - 0.1, d * 0.7, 0.05), IRON, 0.006)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=0.16,
        location=(0, d / 2 - 0.1, h * 0.44 + 0.1))
    dish = bpy.context.object
    dish.scale = (1, 1, 0.55)
    bpy.ops.object.transform_apply(scale=True)
    dish.data.materials.append(IRON)
    # rope + pulley
    cyl('rope', (w / 4, d / 2 - 0.1, h / 2), 0.012, h - 0.2, WORN, 6)
    cyl('pulley', (w / 4, d / 2 - 0.1, h - 0.12), 0.07, 0.04, IRON, 12).rotation_euler[0] = math.pi / 2
    join_all('dumbwaiter')


def ironGrate():
    """Floor drain grate — frame with parallel bars and one bent bar."""
    w = 0.9
    for sx in (-1, 1):
        cube('frameX', (sx * (w / 2 - 0.03), 0, 0.02), (0.06, w, 0.04), IRON, 0.004)
    for sy in (-1, 1):
        cube('frameY', (0, sy * (w / 2 - 0.03), 0.02), (w, 0.06, 0.04), IRON, 0.004)
    n = 7
    for i in range(n):
        x = -w / 2 + 0.1 + i * (w - 0.2) / (n - 1)
        bar = cube('bar', (x, 0, 0.02), (0.035, w - 0.1, 0.035), IRON, 0.004)
        if i == 4:
            bar.rotation_euler[0] = 0.22
            bar.location.y -= 0.04
    join_all('ironGrate')



def keyRack():
    # Hotel front-desk key/mail pigeonhole grid — the wall of cubbies behind
    # the counter. z is up, +y into the wall.
    w, h, d = 2.4, 1.6, 0.22
    cube('back', (0, d / 2 - 0.015, h / 2), (w, 0.03, h), WOOD, 0.004)
    for sx in (-1, 1):
        cube('side', (sx * (w / 2 - 0.025), 0, h / 2), (0.05, d, h), WOOD, 0.004)
    for sz in (0, 1):
        cube('top', (0, 0, sz * (h - 0.05) + 0.025), (w, d, 0.05), WOOD, 0.004)
    cols, rows = 8, 4
    cw, ch = (w - 0.14) / cols, (h - 0.14) / rows
    for r in range(1, rows):
        z = 0.07 + r * ch
        cube('shelf', (0, 0, z), (w - 0.1, d - 0.03, 0.022), WORN, 0.002)
    for c in range(1, cols):
        x = -w / 2 + 0.07 + c * cw
        cube('div', (x, 0, h / 2), (0.022, d - 0.03, h - 0.1), WORN, 0.002)
    import random
    random.seed(7)
    for r in range(rows):
        for c in range(cols):
            if random.random() < 0.22:
                x = -w / 2 + 0.07 + (c + 0.5) * cw
                z = 0.07 + (r + 0.3) * ch
                cube('letter', (x, 0.02, z), (cw * 0.55, 0.015, ch * 0.3), CLOTH, 0.001)
    cube('rail', (0, 0, h + 0.02), (w + 0.06, d + 0.03, 0.05), IRON, 0.003)
    join_all('keyRack')


def counterBell():
    # Small desk-service bell: dome + plunger on a low plinth.
    cyl('plinth', (0, 0, 0.015), 0.045, 0.03, IRON)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=0.038, location=(0, 0, 0.045))
    dome = bpy.context.object; dome.name = 'dome'; dome.scale.z = 0.72
    dome.data.materials.append(IRON)
    cyl('plunger', (0, 0, 0.085), 0.006, 0.02, WORN, 8)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.011, location=(0, 0, 0.098))
    knob = bpy.context.object; knob.name = 'knob'; knob.data.materials.append(IRON)
    join_all('counterBell')


def luggageRack():
    # Folded-iron luggage stand: two X frames + webbing straps across the top.
    w, h, d = 0.62, 0.55, 0.42
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = cube('leg', (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), h / 2), (0.03, 0.03, h), IRON, 0.003)
            leg.rotation_euler[1] = sy * 0.08
    for i in range(4):
        y = -d / 2 + 0.08 + i * (d - 0.16) / 3
        cube('strap', (0, y, h - 0.02), (w - 0.04, 0.06, 0.035), CLOTH, 0.002)
    for sx in (-1, 1):
        cube('siderail', (sx * (w / 2 - 0.03), 0, h * 0.55), (0.028, d - 0.05, 0.03), IRON, 0.002)
    join_all('luggageRack')

def doorPlaque():
    # Brass room-number plaque — small raised-rim plate mounted beside a door.
    w, h, d = 0.34, 0.2, 0.028
    cube('plate', (0, 0, 0), (w, d, h), IRON, 0.006)
    cube('rimT', (0, -0.002, h / 2 - 0.014), (w - 0.04, d + 0.004, 0.014), WORN, 0.003)
    cube('rimB', (0, -0.002, -h / 2 + 0.014), (w - 0.04, d + 0.004, 0.014), WORN, 0.003)
    # three raised digit strokes so the plate reads as numbered from a distance
    for i, sx in enumerate((-0.09, 0.0, 0.09)):
        cube('digit', (sx, -d / 2 - 0.004, 0), (0.045, 0.006, h * 0.5), WORN, 0.002)
    join_all('doorPlaque')

def hallTree():
    # Coat/hat hall tree — turned post, crown of hooks, drip tray base.
    import bpy
    cyl('post', (0, 0, 0.95), 0.035, 1.9, WOOD, 14)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, location=(0, 0, 1.95))
    fin = bpy.context.object
    fin.name = 'finial'
    fin.scale = (0.05, 0.05, 0.07)
    fin.data.materials.append(WORN)
    # crown hooks — four curved arms out from the post at two heights
    for i in range(4):
        a = i * math.pi / 2
        for z, r in ((1.72, 0.11), (1.52, 0.09)):
            x, y = math.cos(a) * r, math.sin(a) * r
            arm = cyl('hook', (x * 0.55, y * 0.55, z), 0.011, r * 1.05, IRON, 8)
            arm.rotation_euler[1] = math.pi / 2
            arm.rotation_euler[2] = a
            tip = cyl('hookTip', (x, y, z + 0.035), 0.011, 0.07, IRON, 8)
    # tray + legs
    cyl('tray', (0, 0, 0.09), 0.21, 0.05, WORN, 18)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        leg = cube('leg', (math.cos(a) * 0.11, math.sin(a) * 0.11, 0.045), (0.22, 0.045, 0.045), WOOD, 0.006)
        leg.rotation_euler[2] = a
    join_all('hallTree')

def umbrellaStand():
    # Brass umbrella stand — open cylinder of spindles with a drip pan.
    import bpy
    cyl('pan', (0, 0, 0.03), 0.16, 0.05, IRON, 18)
    torus('rimB', (0, 0, 0.06), 0.155, 0.009, WORN)
    torus('rimT', (0, 0, 0.42), 0.155, 0.009, WORN)
    for i in range(10):
        a = i * math.pi / 5
        cyl('spindle', (math.cos(a) * 0.152, math.sin(a) * 0.152, 0.24), 0.008, 0.38, IRON, 6)
    # a cane + folded umbrella resting inside
    stick = cyl('cane', (0.05, 0.02, 0.34), 0.012, 0.72, WOOD, 8)
    stick.rotation_euler[0] = 0.1
    um = cyl('brolly', (-0.05, -0.01, 0.3), 0.035, 0.6, CLOTH, 10)
    um.rotation_euler[1] = -0.08
    join_all('umbrellaStand')

def washStand():
    # Marble-top washstand — tiled backsplash, basin, shelf, turned legs.
    import bpy
    w, d, h = 0.85, 0.46, 0.86
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('leg', (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), h / 2), 0.028, h, WOOD, 10)
    cube('skirt', (0, 0, h - 0.09), (w - 0.1, d - 0.1, 0.12), WOOD, 0.008)
    cube('shelf', (0, 0, 0.18), (w - 0.12, d - 0.12, 0.035), WORN, 0.005)
    cube('top', (0, 0, h), (w, d, 0.045), STONE, 0.008)
    # tiled backsplash
    cube('splash', (0, d / 2 - 0.02, h + 0.22), (w, 0.04, 0.44), STONE, 0.006)
    # basin sunk in the top — ring + bowl
    torus('basinRim', (0, -0.02, h + 0.035), 0.14, 0.018, STONE)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=10, location=(0, -0.02, h + 0.01))
    bowl = bpy.context.object
    bowl.name = 'bowl'
    bowl.scale = (0.15, 0.15, 0.07)
    bowl.data.materials.append(STONE)
    # jug beside the basin
    cyl('jug', (0.26, -0.05, h + 0.11), 0.055, 0.16, WORN, 12)
    cyl('jugNeck', (0.26, -0.05, h + 0.22), 0.028, 0.07, WORN, 10)
    join_all('washStand')

def mailCart():
    # Mail/linen cart — brass frame on casters with a slung canvas bag.
    import bpy
    w, d, h = 1.0, 0.5, 0.75
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('post', (sx * w / 2, sy * d / 2, h / 2 + 0.1), 0.016, h, WORN, 8)
    for z in (0.16, h + 0.05):
        cube('railL', (0, d / 2, z), (w, 0.022, 0.022), WORN, 0.004)
        cube('railL2', (0, -d / 2, z), (w, 0.022, 0.022), WORN, 0.004)
        cube('railS', (w / 2, 0, z), (0.022, d, 0.022), WORN, 0.004)
        cube('railS2', (-w / 2, 0, z), (0.022, d, 0.022), WORN, 0.004)
    # canvas bag slung inside — slumped box
    bag = cube('bag', (0, 0, h / 2 + 0.02), (w - 0.08, d - 0.08, h - 0.2), CLOTH, 0.05)
    # casters
    for sx in (-1, 1):
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, location=(sx * w / 2, sy * d / 2, 0.07))
            wh = bpy.context.object
            wh.name = 'caster'
            wh.scale = (0.055, 0.055, 0.07)
            wh.data.materials.append(IRON)
    # push handles
    for sx in (-1, 1):
        torus('handle', (sx * (w / 2 + 0.02), 0, h + 0.1), 0.09, 0.012, IRON, rot=(0, math.pi / 2, 0))
    join_all('mailCart')

def podiumLectern():
    # Sloped lectern — column foot, book lip, reading slope.
    w, d = 0.55, 0.42
    cyl('foot', (0, 0, 0.04), 0.24, 0.06, WOOD, 18)
    cyl('column', (0, 0, 0.5), 0.05, 0.95, WOOD, 12)
    cube('collar', (0, 0, 0.82), (0.14, 0.14, 0.05), WORN, 0.006)
    slope = cube('slope', (0, -0.02, 1.05), (w, d, 0.04), WOOD, 0.008)
    slope.rotation_euler[0] = -0.32
    lip = cube('lip', (0, -d / 2 + 0.03, 0.97), (w, 0.035, 0.05), WORN, 0.005)
    lip.rotation_euler[0] = -0.32
    # a bound ledger left open on the slope
    book = cube('ledger', (0, -0.04, 1.08), (0.34, 0.26, 0.025), CLOTH, 0.006)
    book.rotation_euler[0] = -0.32
    join_all('podiumLectern')


def pipe_seg(name, p0, p1, r, material, seg=10):
    """Cylinder strut between two points."""
    import mathutils
    a, b = mathutils.Vector(p0), mathutils.Vector(p1)
    d = b - a
    mid = (a + b) / 2
    o = cyl(name, mid, r, d.length, material, seg)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return o


def conduitRun():
    """Wall-mounted conduit bundle — three runs on saddles with a junction
    box and a rising stub. Underscript service-wall dressing."""
    w = 2.6
    for zi, z in enumerate((0.05, 0.13, 0.21)):
        cyl('pipe', (0, 0.05 + zi * 0.012, z), 0.028, w, IRON, 10).rotation_euler[1] = math.pi / 2
    for x in (-1.1, -0.35, 0.35, 1.1):
        cube('saddle', (x, 0.05, 0.13), (0.06, 0.1, 0.3), IRON, 0.008)
    cube('jbox', (0.9, 0.08, 0.13), (0.22, 0.12, 0.26), DARK, 0.01)
    cyl('stub', (0.9, 0.06, 0.45), 0.028, 0.5, IRON, 10)
    join_all('conduitRun')


def sumpPump():
    """Cast sump pump — ribbed pot, motor cap, discharge riser elbowing to
    the wall. Underscript floor plant."""
    cyl('base', (0, 0, 0.03), 0.3, 0.06, IRON, 18)
    cyl('pot', (0, 0, 0.3), 0.24, 0.5, IRON, 16)
    for i in range(3):
        torus('rib', (0, 0, 0.16 + i * 0.14), 0.25, 0.018, IRON, seg=20)
    cyl('motor', (0, 0, 0.62), 0.16, 0.22, DARK, 14)
    cyl('riser', (0.18, 0, 0.75), 0.035, 0.5, IRON, 10)
    torus('elbow', (0.18, 0.06, 0.99), 0.06, 0.035, IRON, rot=(0, math.pi / 2, 0), seg=16)
    cyl('wallstub', (0.18, 0.14, 0.99), 0.035, 0.22, IRON, 10).rotation_euler[0] = math.pi / 2
    join_all('sumpPump')


def hangingCable():
    """Drooping cable catenary between two wall brackets + a slack twin —
    Underscript span dressing, hung high."""
    span, dip = 3.0, 0.55
    n = 16
    for cable, r, off in ((0, 0.02, 0.0), (1, 0.013, 0.05)):
        pts = []
        for i in range(n + 1):
            t = i / n
            x = -span / 2 + span * t
            z = -dip * math.sin(math.pi * t) * (1 + 0.15 * cable)
            pts.append((x, 0.02 + off, z))
        for i in range(n):
            pipe_seg('cab', pts[i], pts[i + 1], r, WORN, 6)
    for sx in (-1, 1):
        cube('bracket', (sx * span / 2, 0.06, -0.02), (0.08, 0.12, 0.2), IRON, 0.008)
        torus('eye', (sx * span / 2, 0.02, 0.02), 0.04, 0.012, IRON, rot=(math.pi / 2, 0, 0), seg=12)
    join_all('hangingCable')


def ductRun():
    """Sheet-metal HVAC duct — seamed box run with hanger straps and an
    elbow dropping toward the wall. Ceiling dressing."""
    w, h, d = 2.4, 0.34, 0.42
    cube('duct', (0, 0, 0), (w, d, h), IRON, 0.01)
    for x in (-0.8, -0.2, 0.4, 1.0):
        cube('seam', (x, 0, 0), (0.04, d + 0.02, h + 0.02), IRON, 0.004)
    for x in (-0.9, 0.7):
        cube('strap', (x, -0.02, h / 2 + 0.1), (0.03, 0.02, 0.22), IRON, 0.003)
    cube('elbow', (w / 2 + 0.15, 0.1, -h / 2 - 0.16), (0.4, d * 0.8, 0.4), IRON, 0.01).rotation_euler[0] = -0.5
    join_all('ductRun')


def doorChain():
    """Padlocked hasp + draped chain — mounted on a locked door leaf at
    handle height. Reads 'this door is barred' from across the room.
    Normalized ~0.62 wide, front face +y→glTF -z convention matches props."""
    # hasp plates — one on the leaf edge, one on the jamb beside it
    cube('plateA', (-0.18, 0.03, 0.0), (0.16, 0.06, 0.3), IRON, 0.008)
    cube('plateB', (0.24, 0.03, 0.0), (0.14, 0.06, 0.26), IRON, 0.008)
    for px in (-0.18, 0.24):
        for pz in (-0.1, 0.1):
            cyl('rivet', (px, -0.015, pz), 0.014, 0.02, IRON, 8).rotation_euler[0] = math.pi / 2
    # chain catenary drooping between the two hasps
    n, dip = 10, 0.16
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        x0 = -0.14 + 0.36 * t0
        z0 = -dip * math.sin(math.pi * t0)
        x1 = -0.14 + 0.36 * t1
        z1 = -dip * math.sin(math.pi * t1)
        pipe_seg('link', (x0, -0.06, z0), (x1, -0.06, z1), 0.016, WORN, 6)
    # padlock hanging off the chain's low point
    cube('lock', (0.03, -0.06, -0.26), (0.11, 0.07, 0.14), BRASS, 0.012)
    torus('shackle', (0.03, -0.055, -0.18), 0.045, 0.012, IRON, rot=(math.pi / 2, 0, 0), seg=14)
    cyl('keyhole', (0.03, -0.098, -0.26), 0.012, 0.02, DARK, 8).rotation_euler[0] = math.pi / 2
    join_all('doorChain')


def tollPlate():
    """Brass toll plate — heavy escutcheon with a coin slot and a ring of
    rivets, mounted on the 'it asks a toll' branch doors. ~0.3 wide."""
    cube('plate', (0, 0.02, 0), (0.3, 0.04, 0.42), BRASS, 0.02)
    cube('slot', (0, -0.005, 0.06), (0.14, 0.02, 0.03), DARK, 0.004)
    # shallow embossed bezel around the slot
    cube('bezel', (0, -0.002, 0.06), (0.18, 0.012, 0.07), BRASS, 0.008)
    for ang in range(6):
        a = ang * math.pi / 3
        cyl('rivet', (0.11 * math.cos(a), -0.005, 0.11 * math.sin(a) - 0.04), 0.016, 0.02, BRASS, 8).rotation_euler[0] = math.pi / 2
    torus('ring', (0, -0.01, -0.16), 0.045, 0.011, BRASS, rot=(math.pi / 2, 0, 0), seg=16)
    join_all('tollPlate')


def plinth():
    """Stone display plinth — stepped base, tapered shaft, molded cap.
    Gallery pedestal for busts/vases. ~1.1 tall."""
    cube('base1', (0, 0, 0.05), (0.62, 0.62, 0.10), STONE, 0.015)
    cube('base2', (0, 0, 0.15), (0.52, 0.52, 0.10), STONE, 0.01)
    cube('shaft', (0, 0, 0.6), (0.44, 0.44, 0.8), STONE, 0.012)
    cube('cap1', (0, 0, 1.02), (0.5, 0.5, 0.07), STONE, 0.01)
    cube('cap2', (0, 0, 1.075), (0.56, 0.56, 0.06), STONE, 0.012)
    join_all('plinth')


def displayCase():
    """Museum vitrine — dark plinth base, glass hood, a small artifact inside.
    Gallery centerpiece dressing. ~1.5 tall."""
    cube('base', (0, 0, 0.35), (0.8, 0.8, 0.7), DARK, 0.015)
    cube('baseTrim', (0, 0, 0.72), (0.84, 0.84, 0.05), WOOD, 0.008)
    # artifact — a small pot/vase silhouette on the pedestal
    cyl('artBody', (0, 0, 0.9), 0.11, 0.26, BRASS, 14)
    torus('artLip', (0, 0, 1.04), 0.09, 0.018, BRASS, seg=16)
    cyl('artNeck', (0, 0, 1.1), 0.045, 0.1, BRASS, 12)
    # glass hood — thin box, keep as separate mesh (alpha material)
    import bpy
    m = bpy.data.materials.new('glass'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.8, 0.85, 0.9, 1)
    b.inputs['Roughness'].default_value = 0.08
    b.inputs['Alpha'].default_value = 0.16
    m.surface_render_method = 'DITHERED'
    cube('hood', (0, 0, 1.0), (0.7, 0.7, 0.62), m, 0.008)
    join_all('displayCase')


def ropeBarrier():
    """Twin brass stanchions + a sagging velvet rope — the museum 'do not
    cross' line. ~2.4 wide, 0.95 tall."""
    for sx in (-1.2, 1.2):
        cyl('post', (sx, 0, 0.45), 0.025, 0.9, BRASS, 12)
        bpy_sphere = cyl('finial', (sx, 0, 0.92), 0.05, 0.08, BRASS, 12)
        torus('collar', (sx, 0, 0.78), 0.05, 0.015, BRASS, seg=14)
        cyl('base', (sx, 0, 0.03), 0.16, 0.06, BRASS, 18)
    # rope catenary — fat worn strand drooping between the posts
    n, dip = 12, 0.22
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        p0 = (-1.2 + 2.4 * t0, 0, 0.8 - dip * math.sin(math.pi * t0))
        p1 = (-1.2 + 2.4 * t1, 0, 0.8 - dip * math.sin(math.pi * t1))
        pipe_seg('rope', p0, p1, 0.03, WORN, 8)
    join_all('ropeBarrier')


def exhibitLabel():
    """Small angled exhibit label plate on a tilted stand — sits under
    paintings or beside cases. ~0.2 wide."""
    cube('plate', (0, -0.02, 0.08), (0.22, 0.015, 0.14), WORN, 0.004).rotation_euler[0] = -0.5
    cube('strut', (0, 0.03, 0.04), (0.02, 0.02, 0.09), IRON, 0.003).rotation_euler[0] = -0.5
    cube('foot', (0, 0.05, 0.005), (0.08, 0.06, 0.01), IRON, 0.002)
    join_all('exhibitLabel')


def libraryLadder():
    """Rolling library ladder — tall rails, rungs, top hooks that catch a
    shelf rail, little wheels. Leans ~10deg. ~2.6 tall."""
    lean = math.radians(10)
    for sx in (-0.22, 0.22):
        r = cube('rail', (sx, 0, 1.25), (0.05, 0.04, 2.5), WOOD, 0.006)
        r.rotation_euler[0] = -lean
    for i in range(7):
        y = -0.02 + 0.055 * i  # shift along lean
        z = 0.28 + i * 0.3
        rung = cyl('rung', (0, -z * math.tan(lean) * 0 + 0, z), 0.02, 0.44, WOOD, 8)
        rung.rotation_euler[1] = math.pi / 2
        rung.location.y = z * math.tan(lean)
    # top hooks + wheels
    for sx in (-0.22, 0.22):
        torus('hook', (sx, 0.28, 2.48), 0.06, 0.018, IRON, rot=(math.pi / 2, 0, 0), seg=12)
        torus('wheel', (sx, 0.01, 0.05), 0.05, 0.018, IRON, rot=(0, math.pi / 2, 0), seg=12)
    join_all('libraryLadder')


def cageLocker():
    """Wire-mesh storage locker — corner posts + rails, rod-mesh walls, a
    hasp-and-padlock door. Staff/dormitory storage. ~0.9 wide, 1.9 tall."""
    w, h, d = 0.9, 1.9, 0.55
    for sx in (-1, 1):
        for sy in (-1, 1):
            cube('post', (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), h / 2),
                 (0.05, 0.05, h), IRON, 0.005)
    for z in (0.05, h - 0.05):
        cube('railF', (0, -d / 2 + 0.03, z), (w, 0.05, 0.05), IRON, 0.005)
        cube('railB', (0, d / 2 - 0.03, z), (w, 0.05, 0.05), IRON, 0.005)
        cube('railL', (-w / 2 + 0.03, 0, z), (0.05, d, 0.05), IRON, 0.005)
        cube('railR', (w / 2 - 0.03, 0, z), (0.05, d, 0.05), IRON, 0.005)
    # rod mesh — verticals on every face, sparse horizontal ties
    nv = 10
    for i in range(nv):
        x = -w / 2 + 0.08 + i * (w - 0.16) / (nv - 1)
        cyl('rodF', (x, -d / 2 + 0.03, h / 2), 0.006, h - 0.12, IRON, 6)
        cyl('rodB', (x, d / 2 - 0.03, h / 2), 0.006, h - 0.12, IRON, 6)
    for i in range(6):
        y = -d / 2 + 0.08 + i * (d - 0.16) / 5
        cyl('rodL', (-w / 2 + 0.03, y, h / 2), 0.006, h - 0.12, IRON, 6)
        cyl('rodR', (w / 2 - 0.03, y, h / 2), 0.006, h - 0.12, IRON, 6)
    for z in (h * 0.33, h * 0.62, h * 0.85):
        cube('tieF', (0, -d / 2 + 0.03, z), (w - 0.12, 0.012, 0.014), IRON, 0.002)
        cube('tieB', (0, d / 2 - 0.03, z), (w - 0.12, 0.012, 0.014), IRON, 0.002)
        cube('tieL', (-w / 2 + 0.03, 0, z), (0.012, d - 0.12, 0.014), IRON, 0.002)
        cube('tieR', (w / 2 - 0.03, 0, z), (0.012, d - 0.12, 0.014), IRON, 0.002)
    # door mid-rail + hasp + padlock on the front face
    cube('doorRail', (0, -d / 2 + 0.02, h * 0.52), (w - 0.1, 0.05, 0.05), IRON, 0.004)
    cube('hasp', (w / 2 - 0.14, -d / 2 - 0.005, h * 0.55), (0.05, 0.025, 0.11), IRON, 0.003)
    torus('padShackle', (w / 2 - 0.14, -d / 2 - 0.03, h * 0.49), 0.028, 0.008,
          BRASS, rot=(math.pi / 2, 0, 0), seg=12)
    cube('padBody', (w / 2 - 0.14, -d / 2 - 0.03, h * 0.44), (0.05, 0.025, 0.06), BRASS, 0.004)
    join_all('cageLocker')


def bellCart():
    """Hotel luggage cart — brass birdcage frame: deck with carpet inlay,
    corner posts, arched crown rail, hanging rail, four casters."""
    w, h, d = 1.1, 1.9, 0.62
    cube('deck', (0, 0, 0.14), (w, d, 0.09), WORN, 0.02)
    cube('carpet', (0, 0, 0.19), (w - 0.12, d - 0.12, 0.015), CLOTH, 0.004)
    # skirt rails under the deck
    for z in (0.09,):
        cube('skirtF', (0, -d / 2 + 0.02, z), (w, 0.025, 0.05), BRASS, 0.004)
        cube('skirtB', (0, d / 2 - 0.02, z), (w, 0.025, 0.05), BRASS, 0.004)
    # casters — wheels on the ends, axle along y
    for sx in (-1, 1):
        for sy in (-1, 1):
            wh = cyl('wheel', (sx * (w / 2 - 0.07), sy * (d / 2 - 0.07), 0.045),
                     0.05, 0.03, IRON, 12)
            wh.rotation_euler[0] = math.pi / 2
    # corner posts up to the crown
    post_h = h - 0.42
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('post', (sx * (w / 2 - 0.04), sy * (d / 2 - 0.04), post_h / 2 + 0.16),
                0.018, post_h, BRASS, 10)
    # arched crown band (half-annulus) across the width
    ring_seg('arch', (0, 0, post_h + 0.16), 0.52, 0.48, 0.045, BRASS, segs=18)
    # hanging rail just under the crown
    rail = cyl('hangRail', (0, -d / 2 + 0.04, post_h + 0.12), 0.014, w - 0.14, BRASS, 8)
    rail.rotation_euler[1] = math.pi / 2
    # push handle on the back — posts + crossbar
    for sx in (-1, 1):
        cyl('handlePost', (sx * (w / 2 - 0.04), d / 2 + 0.02, 1.2), 0.012, 0.12,
            BRASS, 8).rotation_euler[0] = math.pi / 2
    hb = cyl('handleBar', (0, d / 2 + 0.08, 1.2), 0.014, w - 0.16, BRASS, 8)
    hb.rotation_euler[1] = math.pi / 2
    join_all('bellCart')


def teaTrolley():
    """Two-tier serving trolley — shelf pair, slim brass legs, big spoked
    side wheels + front casters, push handle."""
    w, h, d = 0.9, 0.85, 0.55
    for z in (0.3, 0.78):
        cube('shelf', (0, 0, z), (w, d, 0.035), WOOD, 0.01)
        cube('lipF', (0, -d / 2 + 0.015, z + 0.028), (w, 0.02, 0.05), WORN, 0.004)
        cube('lipB', (0, d / 2 - 0.015, z + 0.028), (w, 0.02, 0.05), WORN, 0.004)
        cube('lipL', (-w / 2 + 0.015, 0, z + 0.028), (0.02, d, 0.05), WORN, 0.004)
        cube('lipR', (w / 2 - 0.015, 0, z + 0.028), (0.02, d, 0.05), WORN, 0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('leg', (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), h / 2 + 0.02),
                0.014, h - 0.04, BRASS, 8)
    # rear axle with big spoked wheels
    cyl('axle', (0, -d / 2 + 0.06, 0.14), 0.011, w + 0.04, IRON, 8).rotation_euler[1] = math.pi / 2
    for sx in (-1, 1):
        wx = sx * (w / 2 + 0.02)
        torus('wheel', (wx, -d / 2 + 0.06, 0.14), 0.115, 0.014, IRON,
              rot=(0, math.pi / 2, 0), seg=18)
        for a in range(4):
            cyl('spoke', (wx, -d / 2 + 0.06, 0.14), 0.006, 0.21, IRON, 6
                ).rotation_euler[0] = a * math.pi / 4
        cyl('hub', (wx, -d / 2 + 0.06, 0.14), 0.02, 0.05, BRASS, 8).rotation_euler[1] = math.pi / 2
    # front casters
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.045,
            location=(sx * (w / 2 - 0.05), d / 2 - 0.05, 0.05))
        bpy.context.object.data.materials.append(IRON)
    # push handle — uprights + grip at the back edge
    for sx in (-1, 1):
        cyl('hPost', (sx * (w / 2 - 0.04), -d / 2 + 0.03, h + 0.1), 0.012, 0.28,
            BRASS, 8).rotation_euler[0] = -0.25
    hg = cyl('hGrip', (0, -d / 2 - 0.02, h + 0.19), 0.013, w - 0.1, BRASS, 8)
    hg.rotation_euler[1] = math.pi / 2
    join_all('teaTrolley')


def bedBench():
    """Upholstered foot-of-bed bench — padded seat with welt cord, turned
    legs, side + end stretchers, button tufts."""
    w, h, d = 1.3, 0.48, 0.42
    cube('seat', (0, 0, h - 0.08), (w, d, 0.14), CLOTH, 0.05)
    cube('welt', (0, 0, h - 0.155), (w + 0.02, d + 0.02, 0.03), WORN, 0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            lx, ly = sx * (w / 2 - 0.05), sy * (d / 2 - 0.05)
            cyl('leg', (lx, ly, (h - 0.16) / 2), 0.028, h - 0.16, WOOD, 10)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6,
                radius=0.034, location=(lx, ly, (h - 0.16) * 0.5))
            bpy.context.object.data.materials.append(WOOD)
    for sx in (-1, 1):
        cyl('stretchL', (sx * (w / 2 - 0.05), 0, 0.13), 0.011, d - 0.08, WOOD, 8
            ).rotation_euler[0] = math.pi / 2
    for sy in (-1, 1):
        cyl('stretchS', (0, sy * (d / 2 - 0.05), 0.13), 0.011, w - 0.08, WOOD, 8
            ).rotation_euler[1] = math.pi / 2
    # tuft buttons across the seat top
    for i in range(5):
        x = -w / 2 + 0.16 + i * (w - 0.32) / 4
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6,
            radius=0.016, location=(x, 0, h - 0.005))
        bpy.context.object.data.materials.append(WORN)
    join_all('bedBench')


def radiatorTall():
    """Tall column radiator — 11 slim columns between two headers, supply
    pipe + wheel valve, bleeder cock. Narrower/taller than radiatorFin."""
    w, h, d = 0.72, 1.05, 0.24
    cube('headLo', (0, 0, h * 0.15), (w - 0.06, d * 0.7, 0.06), IRON, 0.01)
    cube('headHi', (0, 0, h * 0.86), (w - 0.06, d * 0.7, 0.06), IRON, 0.01)
    n = 11
    for i in range(n):
        x = -w / 2 + 0.07 + i * (w - 0.14) / (n - 1)
        cyl('fin', (x, 0, h * 0.5), 0.028, h * 0.68, IRON, 8)
    for sx in (-1, 1):
        cube('foot', (sx * (w / 2 - 0.09), 0, 0.05), (0.1, d, 0.1), IRON, 0.01)
    cyl('pipe', (w / 2 - 0.01, 0, h * 0.3), 0.022, h * 0.6, IRON, 10)
    torus('valve', (w / 2 - 0.01, -0.06, h * 0.5), 0.05, 0.011, IRON,
          rot=(math.pi / 2, 0, 0), seg=12)
    cyl('bleed', (-w / 2 + 0.01, 0, h * 0.88), 0.008, 0.05, BRASS, 8)
    join_all('radiatorTall')


def linenHamper():
    """Canvas laundry hamper — splayed wood frame with rails, slumped
    canvas bag, folded linen on top."""
    w, h, d = 0.6, 0.72, 0.55
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = cube('leg', (sx * (w / 2 - 0.03), sy * (d / 2 - 0.03), h / 2),
                       (0.04, 0.04, h), WOOD, 0.004)
            leg.rotation_euler[0] = sy * -0.04
            leg.rotation_euler[1] = sx * 0.04
    for z in (0.12, h - 0.05):
        cube('railF', (0, -d / 2 + 0.02, z), (w, 0.03, 0.04), WOOD, 0.003)
        cube('railB', (0, d / 2 - 0.02, z), (w, 0.03, 0.04), WOOD, 0.003)
        cube('railL', (-w / 2 + 0.02, 0, z), (0.03, d, 0.04), WOOD, 0.003)
        cube('railR', (w / 2 - 0.02, 0, z), (0.03, d, 0.04), WOOD, 0.003)
    cube('bag', (0, 0, h * 0.5), (w - 0.09, d - 0.09, h - 0.16), CLOTH, 0.09)
    cube('linen', (-0.06, 0.01, h - 0.03), (w * 0.42, d * 0.55, 0.1), STONE, 0.03)
    cube('linen2', (0.09, -0.03, h + 0.04), (w * 0.34, d * 0.45, 0.08), WORN, 0.03)
    join_all('linenHamper')


def basinSink():
    """Pedestal basin — column foot, shell bowl with rim, tiled backsplash,
    twin brass taps. Hotel-bath dressing. ~0.95 tall."""
    w, h, d = 0.55, 0.95, 0.45
    cyl('foot', (0, 0.04, 0.04), 0.14, 0.07, STONE, 14)
    ped = cyl('column', (0, 0.04, h * 0.42), 0.09, h * 0.78, STONE, 14)
    ped.scale.x = 1.2
    bpy.ops.object.transform_apply(scale=True)
    # shell bowl — flattened sphere + rim torus
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12,
        radius=0.27, location=(0, 0, h * 0.88))
    bowl = bpy.context.object
    bowl.name = 'bowl'
    bowl.scale = (0.95, 0.8, 0.42)
    bpy.ops.object.transform_apply(scale=True)
    bowl.data.materials.append(STONE)
    rim = torus('rim', (0, 0, h * 0.9), 0.235, 0.022, STONE, seg=20)
    rim.scale.x = 1.1
    bpy.ops.object.transform_apply(scale=True)
    # backsplash against the wall
    cube('splash', (0, d / 2 - 0.02, h * 0.92 + 0.12), (w, 0.04, 0.26), STONE, 0.008)
    cube('splashCap', (0, d / 2 - 0.02, h * 0.92 + 0.26), (w + 0.02, 0.05, 0.03), WORN, 0.006)
    # twin taps on the rear rim
    for sx in (-1, 1):
        cyl('tap', (sx * 0.12, d / 2 - 0.1, h * 0.94), 0.014, 0.1, BRASS, 8)
        cyl('tapArm', (sx * 0.12, d / 2 - 0.15, h * 0.99), 0.011, 0.09, BRASS, 8
            ).rotation_euler[0] = math.pi / 2
        torus('tapX', (sx * 0.12, d / 2 - 0.1, h * 0.99 + 0.01), 0.028, 0.008,
              BRASS, seg=10)
    join_all('basinSink')


def pegRail():
    """Wall peg rail — wood backer board, five iron pegs, one draped coat.
    Center-anchored wall mount."""
    w = 1.0
    cube('backer', (0, 0, 0), (w, 0.04, 0.16), WOOD, 0.008)
    cube('backerCap', (0, -0.005, 0.09), (w + 0.02, 0.05, 0.03), WORN, 0.005)
    for i in range(5):
        x = -w / 2 + 0.12 + i * (w - 0.24) / 4
        cyl('peg', (x, -0.05, -0.02), 0.012, 0.12, IRON, 8).rotation_euler[0] = math.pi / 2
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6,
            radius=0.019, location=(x, -0.115, -0.02))
        bpy.context.object.data.materials.append(IRON)
    # one peg carries a draped coat — slumped slab + collar fold
    coat = cube('coat', (0.12, -0.1, -0.34), (0.3, 0.15, 0.62), CLOTH, 0.05)
    coat.rotation_euler[2] = 0.05
    cube('collar', (0.12, -0.07, -0.06), (0.24, 0.1, 0.08), WORN, 0.03)
    join_all('pegRail')


def towelRail():
    """Wall towel rail — brass brackets + bar, folded towel draped over.
    Center-anchored wall mount."""
    w = 0.5
    cube('plateL', (-w / 2 + 0.025, 0, 0), (0.05, 0.03, 0.1), BRASS, 0.006)
    cube('plateR', (w / 2 - 0.025, 0, 0), (0.05, 0.03, 0.1), BRASS, 0.006)
    for sx in (-1, 1):
        cyl('arm', (sx * (w / 2 - 0.025), -0.05, 0), 0.01, 0.1, BRASS, 8
            ).rotation_euler[0] = math.pi / 2
    cyl('bar', (0, -0.1, 0), 0.011, w - 0.08, BRASS, 8).rotation_euler[1] = math.pi / 2
    # towel over the bar — crown fold + hanging face
    cube('towelTop', (0.03, -0.1, 0.015), (0.3, 0.14, 0.04), CLOTH, 0.015)
    cube('towelHang', (0.03, -0.13, -0.22), (0.3, 0.045, 0.42), CLOTH, 0.015)
    cube('towelStripe', (0.03, -0.155, -0.3), (0.28, 0.012, 0.04), WORN, 0.004)
    join_all('towelRail')


def ceilingHook():
    """Hoist chain + open hook — ceiling plate, alternating link run,
    shackle and a gaping iron hook. Center-anchored, hangs ~0.95."""
    cyl('plate', (0, 0, 0.94), 0.07, 0.03, IRON, 14)
    cyl('stud', (0, 0, 0.9), 0.018, 0.06, IRON, 8)
    n = 6
    for i in range(n):
        z = 0.86 - i * 0.075
        torus('link', (0, 0, z), 0.03, 0.008, IRON,
              rot=(math.pi / 2 if i % 2 == 0 else 0, math.pi / 2 if i % 2 else 0, 0), seg=10)
    cyl('shackle', (0, 0, 0.46), 0.028, 0.1, IRON, 8)
    torus('hook', (0, 0, 0.3), 0.06, 0.014, IRON, rot=(0, math.pi / 2, 0), seg=14)
    cyl('hookTip', (0, -0.05, 0.4), 0.013, 0.12, IRON, 8).rotation_euler[0] = 0.5
    join_all('ceilingHook')


def ovalMirror():
    """Oval wall mirror — brass egg frame, glass face, ribbon crest.
    Center-anchored wall mount; variant of 'mirror'."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16,
        radius=0.3, location=(0, 0.005, 0))
    face = bpy.context.object
    face.name = 'glass'
    face.scale = (0.75, 0.08, 1.08)
    bpy.ops.object.transform_apply(scale=True)
    face.data.materials.append(IRON)
    frame = torus('frame', (0, -0.005, 0), 0.235, 0.026, BRASS,
                  rot=(math.pi / 2, 0, 0), seg=24)
    frame.scale = (0.98, 1, 1.36)
    bpy.ops.object.transform_apply(scale=True)
    # ribbon crest above the crown
    torus('crest', (0, -0.01, 0.36), 0.045, 0.014, BRASS, rot=(math.pi / 2, 0, 0), seg=10)
    cube('crestL', (-0.045, -0.01, 0.33), (0.07, 0.02, 0.09), BRASS, 0.005).rotation_euler[1] = -0.3
    cube('crestR', (0.045, -0.01, 0.33), (0.07, 0.02, 0.09), BRASS, 0.005).rotation_euler[1] = 0.3
    join_all('ovalMirror')


def kitchenRange():
    """Cast-iron kitchen range — firebox door, hotplate top with rings,
    flue pipe, side shelf, short legs. ~1.1 tall, 1.4 wide."""
    w, d = 1.4, 0.72
    # body on legs
    for sx in (-1, 1):
        for sz in (-1, 1):
            cyl('leg', (sx * (w / 2 - 0.08), sz * (d / 2 - 0.08), 0.07), 0.028, 0.14, IRON, 8)
    cube('body', (0, 0, 0.55), (w, d, 0.84), IRON, 0.02)
    cube('toeKick', (0, 0, 0.16), (w - 0.1, d - 0.1, 0.1), DARK, 0.01)
    # firebox door + grate air holes
    cube('fireDoor', (0, -d / 2 - 0.012, 0.42), (0.42, 0.04, 0.34), DARK, 0.015)
    torus('doorRing', (0.12, -d / 2 - 0.035, 0.42), 0.035, 0.009, IRON, seg=12)
    for i in range(4):
        cyl('vent', (-0.24 + i * 0.16, -d / 2 - 0.01, 0.66), 0.012, 0.05, BRASS, 6).rotation_euler[0] = math.pi / 2
    # hotplate top — slab + two pot rings + raised back edge
    cube('hotTop', (0, 0, 0.99), (w + 0.02, d + 0.02, 0.045), IRON, 0.01)
    for sx in (-1, 1):
        torus('ring', (sx * 0.32, -0.02, 1.015), 0.14, 0.014, DARK, seg=18)
        cyl('ringPlug', (sx * 0.32, -0.02, 1.012), 0.1, 0.014, DARK, 16)
    cube('backSplash', (0, d / 2 - 0.03, 1.18), (w, 0.05, 0.36), IRON, 0.012)
    # flue pipe rising from rear left
    pipe_seg('flue', (-0.45, d / 2 - 0.12, 1.0), (-0.45, d / 2 - 0.12, 2.4), 0.075, IRON, 14)
    cyl('flueCollar', (-0.45, d / 2 - 0.12, 1.02), 0.095, 0.06, IRON, 14)
    # right side warming shelf on brackets
    cube('sideShelf', (w / 2 + 0.09, 0, 0.86), (0.2, d - 0.1, 0.03), IRON, 0.006)
    pipe_seg('shBrace', (w / 2 + 0.16, -d / 2 + 0.08, 0.62), (w / 2 + 0.16, -d / 2 + 0.08, 0.85), 0.012, IRON, 8)
    pipe_seg('shBrace2', (w / 2 + 0.16, d / 2 - 0.08, 0.62), (w / 2 + 0.16, d / 2 - 0.08, 0.85), 0.012, IRON, 8)
    join_all('kitchenRange')


def sculleryRack():
    """Wall plate rack — two slatted shelves, plate dividers up top,
    drip rail below. Center-anchored wall mount, ~0.75 tall, 1.0 wide."""
    w, d = 1.0, 0.24
    # back frame
    cube('backTop', (0, 0, 0.36), (w, 0.03, 0.06), WOOD, 0.006)
    cube('backBot', (0, 0, -0.36), (w, 0.03, 0.06), WOOD, 0.006)
    for sx in (-1, 1):
        cube('upright', (sx * (w / 2 - 0.03), 0, 0), (0.05, 0.04, 0.78), WOOD, 0.006)
    # two slatted shelves (slats run x, gaps between)
    for sh in (-0.02, -0.34):
        for i in range(5):
            cube('slat', (0, -d / 2 + 0.03 + i * (d - 0.06) / 4, sh), (w - 0.08, 0.025, 0.016), WOOD, 0.003)
    # plate dividers on upper shelf
    for i in range(6):
        x = -w / 2 + 0.14 + i * 0.13
        pipe_seg('divider', (x, -d / 2 + 0.02, -0.02), (x, -d / 2 + 0.02, 0.2), 0.006, IRON, 6)
    # three standing plates
    for i in range(3):
        x = -0.26 + i * 0.26
        pl = cyl('plate', (x, -0.05, 0.1), 0.09, 0.012, STONE, 16)
        pl.rotation_euler[0] = math.pi / 2
    # drip rail
    cyl('dripRail', (0, -d / 2 + 0.02, -0.44), 0.009, w - 0.1, BRASS, 8).rotation_euler[1] = math.pi / 2
    join_all('sculleryRack')


def potRack():
    """Hanging pot rail — iron bar between two wall arms, S-hooks, three
    hanging pans and a ladle. Center-anchored wall mount, ~0.55 tall."""
    w = 0.9
    for sx in (-1, 1):
        cube('armPlate', (sx * (w / 2 - 0.03), 0, 0.02), (0.04, 0.03, 0.1), IRON, 0.004)
        pipe_seg('arm', (sx * (w / 2 - 0.03), 0, 0.04), (sx * (w / 2 - 0.03), -0.26, 0.04), 0.01, IRON, 8)
        pipe_seg('brace', (sx * (w / 2 - 0.03), 0, -0.02), (sx * (w / 2 - 0.03), -0.22, 0.04), 0.007, IRON, 8)
    cyl('rail', (0, -0.26, 0.04), 0.012, w - 0.06, IRON, 10).rotation_euler[1] = math.pi / 2
    # hooks + cookware
    for i, x in enumerate((-0.3, -0.08, 0.16, 0.34)):
        torus('hook', (x, -0.26, -0.02), 0.018, 0.005, IRON, seg=10)
        drop = -0.06 - 0.03 * (i % 2)
        pr = 0.11 - 0.015 * (i % 3)
        pan = cyl('pan', (x, -0.26, drop - 0.09), pr, 0.03, IRON if i % 3 else BRASS, 18)
        torus('panRim', (x, -0.26, drop - 0.075), pr, 0.006, IRON, seg=16)
        pipe_seg('handle', (x, -0.26, drop - 0.02), (x, -0.26, drop - 0.085), 0.008, IRON, 8)
    # ladle at the right end — long stem + bowl
    pipe_seg('ladleStem', (0.42, -0.26, 0.03), (0.42, -0.26, -0.2), 0.006, BRASS, 8)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.035, location=(0.42, -0.26, -0.22))
    lb = bpy.context.object
    lb.scale = (1, 1, 0.6)
    bpy.ops.object.transform_apply(scale=True)
    lb.data.materials.append(BRASS)
    join_all('potRack')


def pantryShelf():
    """Deep pantry shelf — five boards on end cheeks, stocked with jars,
    tins and a bread box. ~1.9 tall, 1.3 wide."""
    w, d, h = 1.3, 0.45, 1.9
    for sx in (-1, 1):
        cube('cheek', (sx * (w / 2 - 0.03), 0, h / 2), (0.06, d, h), WOOD, 0.008)
    cube('back', (0, d / 2 - 0.02, h / 2), (w - 0.06, 0.03, h - 0.1), WORN, 0.006)
    import random
    rng = random.Random(7)
    levels = [0.06, 0.44, 0.82, 1.2, 1.58]
    for li, lv in enumerate(levels):
        cube('board', (0, 0, lv), (w - 0.06, d - 0.04, 0.035), WOOD, 0.005)
        x = -w / 2 + 0.12
        while x < w / 2 - 0.16:
            r = rng.random()
            if r < 0.45:
                # jar — glass-ish stone body + lid
                jr = 0.045 + rng.random() * 0.02
                jh = 0.1 + rng.random() * 0.12
                cyl('jar', (x, rng.uniform(-0.06, 0.06), lv + 0.02 + jh / 2), jr, jh, STONE, 10)
                cyl('jarLid', (x, 0, lv + 0.02 + jh + 0.008), jr + 0.006, 0.016, BRASS, 10)
                x += jr * 2 + 0.05
            elif r < 0.8:
                cube('tin', (x, rng.uniform(-0.04, 0.04), lv + 0.08), (0.1, 0.09, 0.12), WORN, 0.008)
                x += 0.14
            else:
                cube('stackBox', (x, 0, lv + 0.1), (0.16, d * 0.6, 0.16), CLOTH, 0.01)
                x += 0.22
    cube('breadBox', (w / 2 - 0.2, -0.02, h - 0.13), (0.3, 0.3, 0.22), WOOD, 0.04)
    join_all('pantryShelf')


def stackedLinen():
    """Open linen shelf — frame + four boards stacked with folded sheet
    piles in two columns. ~1.8 tall, 1.1 wide."""
    w, d, h = 1.1, 0.5, 1.8
    for sx in (-1, 1):
        cube('cheek', (sx * (w / 2 - 0.03), 0, h / 2), (0.05, d, h), WOOD, 0.008)
    cube('back', (0, d / 2 - 0.02, h / 2), (w - 0.06, 0.03, h - 0.06), WORN, 0.006)
    levels = [0.05, 0.48, 0.91, 1.34]
    import random
    rng = random.Random(11)
    for lv in levels:
        cube('board', (0, 0, lv), (w - 0.06, d - 0.02, 0.03), WOOD, 0.005)
        for cx in (-0.26, 0.26):
            n = 2 + int(rng.random() * 3)
            for k in range(n):
                cube('fold', (cx + rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02),
                              lv + 0.045 + k * 0.075), (0.42, d - 0.12, 0.075),
                     CLOTH if rng.random() > 0.3 else STONE, 0.02)
    join_all('stackedLinen')


def upholsteredHeadboard():
    """Padded headboard — dark wood frame, six tufted cushion cells,
    nailhead edge. Floor anchored ~1.3 tall, 1.7 wide."""
    w = 1.7
    cube('frameL', (-w / 2 + 0.04, 0, 0.62), (0.08, 0.09, 1.24), DARK, 0.01)
    cube('frameR', (w / 2 - 0.04, 0, 0.62), (0.08, 0.09, 1.24), DARK, 0.01)
    cube('frameTop', (0, 0, 1.2), (w, 0.09, 0.09), DARK, 0.01)
    cube('frameBot', (0, 0, 0.05), (w, 0.09, 0.1), DARK, 0.01)
    # tufted cushion grid — 3x2 cells of padded boxes
    for ix in range(3):
        for iz in range(2):
            cube('pad', (-w / 2 + 0.11 + ix * (w - 0.22) / 2.0 + 0.0, -0.055, 0.5 + iz * 0.33),
                 ((w - 0.26) / 3, 0.09, 0.3), WORN, 0.035)
            # tuft button
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.014,
                location=(-w / 2 + 0.11 + ix * (w - 0.22) / 2.0, -0.104, 0.5 + iz * 0.33))
            bpy.context.object.data.materials.append(DARK)
    # nailhead strip along the top frame edge
    for i in range(12):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=4, radius=0.008,
            location=(-w / 2 + 0.12 + i * (w - 0.24) / 11, -0.046, 1.16))
        bpy.context.object.data.materials.append(BRASS)
    join_all('upholsteredHeadboard')


def coalScuttle():
    """Coal scuttle — tilted hod bucket, rim band, brass handle, spilling
    coal lumps and a shovel. ~0.55 tall."""
    hod = cyl('hod', (0, 0, 0.3), 0.19, 0.3, IRON, 16)
    hod.scale = (1, 0.85, 1)
    hod.rotation_euler[0] = 0.35
    bpy.ops.object.transform_apply(scale=True)
    torus('hodRim', (0, -0.115, 0.44), 0.185, 0.014, BRASS, rot=(0.35, 0, 0), seg=18)
    cyl('hodFoot', (0, 0.045, 0.1), 0.14, 0.05, IRON, 14)
    pipe_seg('handleA', (-0.17, 0.02, 0.38), (0, 0.12, 0.58), 0.012, BRASS, 8)
    pipe_seg('handleB', (0.17, 0.02, 0.38), (0, 0.12, 0.58), 0.012, BRASS, 8)
    cyl('grip', (0, 0.12, 0.59), 0.015, 0.1, WORN, 8).rotation_euler[2] = math.pi / 2
    # coal lumps at the mouth + shovel leaning
    import random
    rng = random.Random(3)
    for i in range(5):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.05 + rng.random() * 0.03,
            location=(rng.uniform(-0.1, 0.1), -0.1 + rng.uniform(-0.02, 0.04), 0.42 + rng.uniform(-0.02, 0.05)))
        bpy.context.object.data.materials.append(DARK)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.055,
        location=(0.16, -0.2, 0.05))
    bpy.context.object.data.materials.append(DARK)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.045,
        location=(-0.12, -0.24, 0.04))
    bpy.context.object.data.materials.append(DARK)
    pipe_seg('shovelStick', (0.24, 0.1, 0.05), (0.34, 0.08, 0.62), 0.011, WORN, 8)
    cube('shovelPan', (0.22, 0.09, 0.05), (0.14, 0.16, 0.03), IRON, 0.01)
    join_all('coalScuttle')


PIECES = {
    'archway': archway, 'vault': vault, 'fireplace': fireplace,
    'windowArch': windowArch, 'hatch': hatch, 'medallion': medallion,
    'colonnade': colonnade, 'scissorgate': scissorgate, 'balustrade': balustrade, 'boilerDrum': boilerDrum, 'pipeManifold': pipeManifold, 'stackShelf': stackShelf, 'breakerPanel': breakerPanel, 'wallVent': wallVent, 'portcullis': portcullis, 'wardrobe': wardrobe, 'dresser': dresser, 'nightstand': nightstand,
    'doorLeaf': door_leaf,
    'boneArch': boneArch, 'toppledColumn': toppledColumn,
    'wallNiche': wallNiche, 'stairGate': stairGate,
    'transomWindow': transomWindow, 'bookCart': bookCart,
    'radiatorFin': radiatorFin, 'dumbwaiter': dumbwaiter,
    'ironGrate': ironGrate,
    'keyRack': keyRack, 'counterBell': counterBell, 'luggageRack': luggageRack,
    'doorPlaque': doorPlaque,
    'hallTree': hallTree, 'umbrellaStand': umbrellaStand, 'washStand': washStand,
    'conduitRun': conduitRun, 'sumpPump': sumpPump, 'hangingCable': hangingCable, 'ductRun': ductRun,
    'doorChain': doorChain, 'tollPlate': tollPlate,
    'mailCart': mailCart, 'podiumLectern': podiumLectern,
    'plinth': plinth, 'displayCase': displayCase, 'ropeBarrier': ropeBarrier,
    'exhibitLabel': exhibitLabel, 'libraryLadder': libraryLadder,
    'cageLocker': cageLocker, 'bellCart': bellCart, 'teaTrolley': teaTrolley,
    'bedBench': bedBench, 'radiatorTall': radiatorTall, 'linenHamper': linenHamper,
    'basinSink': basinSink, 'pegRail': pegRail, 'towelRail': towelRail,
    'ceilingHook': ceilingHook, 'ovalMirror': ovalMirror,
    'kitchenRange': kitchenRange, 'sculleryRack': sculleryRack,
    'potRack': potRack, 'pantryShelf': pantryShelf,
    'stackedLinen': stackedLinen, 'upholsteredHeadboard': upholsteredHeadboard,
    'coalScuttle': coalScuttle,
}

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    kind = argv[0] if argv else 'ALL'
    outdir = argv[1] if len(argv) > 1 else '/tmp/mill_out'
    import os
    kinds = list(PIECES) if kind == 'ALL' else [kind]
    for k in kinds:
        clean()
        PIECES[k]()
        os.makedirs(f'{outdir}/{k}', exist_ok=True)
        export(f'{outdir}/{k}/model.gltf')
        print(f'MILL-OK {k}')

main()
