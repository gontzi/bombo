"""
Bombo: the wooden ball rack (portabolas) that stands on the table to the right
of the cage, built procedurally with bpy.

A stepped walnut stand like a little grandstand: rows of turned brass cups,
each tier higher than the one in front so every ball shows, between two
shaped cheeks with brass finials, a brass nosing along each step and a
green-felt base. New options sit here as balls until the green button tips
them all into the cage; three.js places the balls and draws the button.

Measurements come from src/scene/bingoLayout.json ("rack"), which three.js
also reads to put each ball in its cup (src/scene/rack/layout.ts).

Reuses the helpers and materials of build_bingo.py. Run inside Blender with
STEP set: "build" | "export". Conventions as there: 1 Blender metre = 1
three.js unit, coordinates in three.js axes converted with B(). The origin is
the rack's centre on the table, before its yaw.
"""

import math
import os

import bmesh
import bpy

ROOT = r"C:\Dev\Personal\random"
helpers = {}
exec(open(os.path.join(ROOT, "assets-src", "blender", "build_bingo.py"), encoding="utf-8").read(), helpers)
B, LAYOUT = helpers["B"], helpers["LAYOUT"]
lathe, prism, rounded_rect, build_object = helpers["lathe"], helpers["prism"], helpers["rounded_rect"], helpers["build_object"]
material = helpers["material"]

SCENE_NAME = "BomboRack"
EXPORT = ("BallRack", "bingo-rack.glb")
BLEND = os.path.join(ROOT, "assets-src", "blender", "bombo_rack.blend")

R = LAYOUT["rack"]
TIERS, PER, PITCH = R["tiers"], R["perTier"], R["pitch"]
DEPTH, BASE_H, RISE = R["tierDepth"], R["baseHeight"], R["tierRise"]
CHEEK, CUP = R["cheek"], R["cupRadius"]
INNER_W = PER * PITCH + 2 * R["sideMargin"]
FRONT = TIERS * DEPTH / 2
PLINTH = R["plinth"]

WALNUT, BRASS, FELT = range(3)


def tier_top(k):
    return PLINTH + BASE_H + RISE * k


def tier_z(k):
    """Front and back edge of tier k (0 is the front, lowest one)."""
    return FRONT - k * DEPTH, FRONT - (k + 1) * DEPTH


def step_profile(extra=0.0):
    """Side outline of the steps as (z, y), front to back, with `extra` added on top."""
    pts = [(FRONT, PLINTH)]
    for k in range(TIERS):
        zf, zb = tier_z(k)
        pts += [(zf, tier_top(k) + extra), (zb, tier_top(k) + extra)]
    pts.append((-FRONT, PLINTH))
    return pts


def side_prism(profile, x0, x1, mat, bevel):
    """Extrude a side outline (z, y) across x from x0 to x1."""
    outline = [B(x0, y, z) for z, y in profile]
    return prism(outline, B(x1 - x0, 0, 0) - B(0, 0, 0), mat, bevel=bevel)


def box(cx, cy, cz, w, h, d, mat, bevel=0.0):
    outline = [B(cx + sx * w / 2, cy - h / 2, cz + sz * d / 2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    return prism(outline, B(0, h, 0) - B(0, 0, 0), mat, bevel=bevel)


def cup(x, y, z):
    """A turned brass cup set into the step: the ball rests on its lip."""
    return lathe([(0.0, 0.0005), (CUP * 0.75, 0.001), (CUP, 0.0035), (CUP + 0.004, 0.0035), (CUP + 0.005, 0.0)],
                 BRASS, axis="y", center=(x, y, z), segments=28)


def finial(x, y, z):
    return lathe([(0, 0), (0.009, 0), (0.009, 0.004), (0.006, 0.007), (0.0085, 0.013), (0.005, 0.019), (0, 0.021)],
                 BRASS, axis="y", center=(x, y, z), segments=16)


def build_rack(mats, col):
    half = INNER_W / 2
    parts = [
        # Plinth with a felt underside, a touch wider than the stand.
        box(0, PLINTH / 2, 0, INNER_W + 2 * CHEEK + 0.02, PLINTH, TIERS * DEPTH + 0.02, WALNUT, bevel=0.003),
        box(0, 0.0008, 0, INNER_W + 2 * CHEEK + 0.012, 0.0016, TIERS * DEPTH + 0.012, FELT),
        # The steps.
        side_prism(step_profile(), -half, half, WALNUT, bevel=0.003),
    ]
    # Cheeks: the same steps, standing proud with a rounded back.
    cheek = step_profile(0.03)
    for x0 in (-half - CHEEK, half):
        parts.append(side_prism(cheek, x0, x0 + CHEEK, WALNUT, bevel=0.004))
        x = x0 + CHEEK / 2
        parts.append(finial(x, tier_top(TIERS - 1) + 0.03, tier_z(TIERS - 1)[1] + 0.02))
        parts.append(finial(x, tier_top(0) + 0.03, tier_z(0)[0] - 0.014))
    for k in range(TIERS):
        zf, zb = tier_z(k)
        top = tier_top(k)
        # Brass nosing on the front edge of each step.
        parts.append(box(0, top - 0.002, zf - 0.002, INNER_W, 0.006, 0.006, BRASS, bevel=0.0015))
        zc = (zf + zb) / 2
        for i in range(PER):
            parts.append(cup((i - (PER - 1) / 2) * PITCH, top, zc))
    return build_object("BallRack", parts, mats, col, smooth_angle=40)


def scene():
    sc = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    for obj in list(sc.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    if bpy.context.window:
        bpy.context.window.scene = sc
    return sc


def build():
    sc = scene()
    mats = [
        material("Walnut", "#33190f", roughness=0.42, coat=0.7, coat_roughness=0.18),
        material("Brass", "#c9a04a", metallic=1.0, roughness=0.27),
        material("FeltPad", "#1d1a17", roughness=0.95),
    ]
    obj = build_rack(mats, sc.collection)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"{obj.name}: tris~{tris} dims={tuple(round(d, 3) for d in obj.dimensions)}")
    bpy.data.libraries.write(BLEND, {sc, obj, obj.data, *mats}, fake_user=True)
    print("saved", BLEND)


def export():
    sc = bpy.data.scenes[SCENE_NAME]
    name, filename = EXPORT
    obj = sc.objects[name]
    # The exporter works on the context's scene, which may be another one open in the file:
    # show the rack there for the export, selected on its own.
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    linked = obj.name not in scene.objects
    if linked:
        scene.collection.objects.link(obj)
    for o in view_layer.objects:
        o.select_set(o == obj)
    view_layer.objects.active = obj
    out = os.path.join(ROOT, "public", "models", filename)
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    options = dict(filepath=out, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                   export_materials="EXPORT", export_texcoords=False, export_normals=True, export_tangents=False,
                   export_cameras=False, export_lights=False, export_extras=False, export_animations=False)
    bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in known})
    if linked:
        scene.collection.objects.unlink(obj)
    print(f"{out}  {os.path.getsize(out) / 1024:.1f} KB")


if "STEP" in globals():
    if STEP == "build":
        build()
    elif STEP == "export":
        export()
