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

def init_mats():
    global STONE, DARK, IRON
    STONE = mat('stone', (0.42, 0.38, 0.33))
    DARK = mat('darkwood', (0.16, 0.10, 0.07), rough=0.7)
    IRON = mat('iron', (0.11, 0.11, 0.12), rough=0.45, metal=0.85)

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

PIECES = {
    'archway': archway, 'vault': vault, 'fireplace': fireplace,
    'windowArch': windowArch, 'hatch': hatch, 'medallion': medallion,
    'colonnade': colonnade, 'scissorgate': scissorgate, 'balustrade': balustrade, 'boilerDrum': boilerDrum, 'pipeManifold': pipeManifold, 'stackShelf': stackShelf,
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
