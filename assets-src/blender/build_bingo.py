"""
Bombo: static and moving parts of the bingo machine, built procedurally with bpy.

Reads every measurement from src/scene/bingoLayout.json (the same file the
web scene uses), so the chute the ball rides along in three.js is exactly the
chute modelled here.

Run inside Blender with STEP set: "build" | "render" | "export".
Exporting is most reliable from a fresh load of the saved .blend:
    blender -b assets-src/blender/bombo_assets.blend --python-expr "STEP='export'; exec(open(r'...build_bingo.py').read())"

Conventions:
- 1 Blender metre = 1 three.js unit; coordinates below are written in
  three.js axes (Y up, +Z to camera) and converted with B().
- MachineFrame and ExitChute are static, origin at the scene origin (table felt, machine centre).
- Crank turns with the cage: its origin is on the cage axle (cage centre), rotate it about X.
- The cage and the balls are not modelled here: three.js builds and animates them.
"""

import json
import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = r"C:\Dev\Personal\random"
LAYOUT = json.load(open(os.path.join(ROOT, "src", "scene", "bingoLayout.json"), encoding="utf-8"))
OUT_DIR = os.path.join(ROOT, "public", "models")
SRC_DIR = os.path.join(ROOT, "assets-src", "blender")
SCENE_NAME = "BomboAssets"

CAGE = LAYOUT["cage"]
CY = CAGE["center"][1]
BASE = LAYOUT["base"]
CHUTE = LAYOUT["chute"]
TRAY = LAYOUT["tray"]
AXLE = LAYOUT["axle"]
CRANK = LAYOUT["crank"]


def B(x, y, z):
    """three.js (Y up, +Z to camera) -> Blender (Z up, -Y to camera)."""
    return Vector((x, -z, y))


# --- Materials ---------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def material(name, color, metallic=0.0, roughness=0.5, coat=0.0, coat_roughness=0.1, double_sided=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    rgb = hex_color(color)
    p.inputs["Base Color"].default_value = (*rgb, 1.0)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = coat_roughness
    m.diffuse_color = (*rgb, 1.0)
    m.use_backface_culling = not double_sided
    return m


def make_materials():
    return {
        "walnut": material("Walnut", "#33190f", roughness=0.42, coat=0.7, coat_roughness=0.18),
        "enamel": material("OxbloodEnamel", "#4a1410", roughness=0.3, coat=0.9, coat_roughness=0.12),
        "brass": material("Brass", "#c9a04a", metallic=1.0, roughness=0.27),
        "steel": material("BrushedSteel", "#b4b1ab", metallic=1.0, roughness=0.36),
        "chrome": material("Chrome", "#dadada", metallic=1.0, roughness=0.12, double_sided=True),
        "felt": material("FeltPad", "#1d1a17", roughness=0.95),
    }


# --- Geometry helpers --------------------------------------------------------

def _finalize(bm, material_index):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.material_index = material_index


def lathe(profile, material_index, axis="y", center=(0, 0, 0), segments=32, closed=False):
    """Revolve (radius, height) around three.js X, Y or Z through `center`."""
    bm = bmesh.new()
    if axis == "x":
        pts, ax = [B(h, r, 0) for r, h in profile], Vector((1, 0, 0))
    elif axis == "z":
        pts, ax = [B(r, 0, h) for r, h in profile], Vector((0, -1, 0))
    else:
        pts, ax = [B(r, h, 0) for r, h in profile], Vector((0, 0, 1))
    verts = [bm.verts.new(p) for p in pts]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    if closed:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=ax, angle=2 * math.pi, steps=segments, use_merge=True)
    bmesh.ops.translate(bm, verts=bm.verts, vec=B(*center))
    _finalize(bm, material_index)
    return bm


def bevel_hard_edges(bm, width, segments, min_angle_deg=30):
    edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0.0) > math.radians(min_angle_deg)]
    if edges and width > 0:
        bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type="OFFSET", segments=segments,
                        profile=0.5, affect="EDGES", clamp_overlap=True)


def prism(outline, extrude, material_index, bevel=0.0, bevel_segments=3):
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new(p) for p in outline])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, verts=[g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)], vec=extrude)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel_hard_edges(bm, bevel, bevel_segments)
    _finalize(bm, material_index)
    return bm


def rounded_rect(cx, cy, width, height, radius, per_corner=6):
    """Rounded rectangle as (u, v) pairs, counter-clockwise."""
    radius = min(radius, width / 2, height / 2)
    hx, hy = width / 2 - radius, height / 2 - radius
    pts = []
    for ox, oy, start in [(hx, hy, 0.0), (-hx, hy, 90.0), (-hx, -hy, 180.0), (hx, -hy, 270.0)]:
        for k in range(per_corner + 1):
            a = math.radians(start + 90.0 * k / per_corner)
            p = (cx + ox + math.cos(a) * radius, cy + oy + math.sin(a) * radius)
            if not pts or abs(p[0] - pts[-1][0]) + abs(p[1] - pts[-1][1]) > 1e-7:
                pts.append(p)
    if abs(pts[0][0] - pts[-1][0]) + abs(pts[0][1] - pts[-1][1]) < 1e-7:
        pts.pop()
    return pts


def catmull_rom(points, samples_per_segment=12):
    """Centripetal Catmull-Rom, same formulation as THREE.CatmullRomCurve3 ('centripetal')."""
    P = [Vector(p) for p in points]
    n = len(P)

    def poly(x0, x1, t0, t1):
        return (x0, t0, -3 * x0 + 3 * x1 - 2 * t0 - t1, 2 * x0 - 2 * x1 + t0 + t1)

    out = []
    for i in range(n - 1):
        p0 = P[i - 1] if i > 0 else P[0] + (P[0] - P[1])
        p1, p2 = P[i], P[i + 1]
        p3 = P[i + 2] if i + 2 < n else P[n - 1] + (P[n - 1] - P[n - 2])
        dt0 = max((p1 - p0).length ** 0.5, 1e-4)
        dt1 = max((p2 - p1).length ** 0.5, 1e-4)
        dt2 = max((p3 - p2).length ** 0.5, 1e-4)
        coeffs = []
        for axis in range(3):
            x0, x1, x2, x3 = p0[axis], p1[axis], p2[axis], p3[axis]
            t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
            t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
            coeffs.append(poly(x1, x2, t1, t2))
        for k in range(samples_per_segment + (1 if i == n - 2 else 0)):
            t = k / samples_per_segment
            out.append(Vector([c[0] + c[1] * t + c[2] * t * t + c[3] * t * t * t for c in coeffs]))
    return out


def sweep(path_three, profile, material_index, close_profile=True, cap=True):
    """
    Sweep a 2D profile [(side, up)] along a path given in three.js coordinates.
    The frame keeps 'up' near world up, which suits a descending chute.
    """
    pts = [B(*p) for p in path_three]
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(Vector((0, 0, 1))).normalized()
        up = side.cross(t).normalized()
        rings.append([bm.verts.new(p + side * s + up * u) for s, u in profile])
    m = len(profile)
    for a, b in zip(rings, rings[1:]):
        for j in range(m if close_profile else m - 1):
            k = (j + 1) % m
            bm.faces.new((a[j], a[k], b[k], b[j]))
    if cap and close_profile:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    if close_profile:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _finalize(bm, material_index) if close_profile else [setattr(f, "material_index", material_index) for f in bm.faces]
    return bm


def build_object(name, parts, mats, collection, smooth_angle=34.0, location=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    tmp = bpy.data.meshes.new(name + "_tmp")
    combined = bmesh.new()
    for part in parts:
        part.to_mesh(tmp)
        part.free()
        combined.from_mesh(tmp)
    combined.to_mesh(me)
    combined.free()
    bpy.data.meshes.remove(tmp)
    for m in mats:
        me.materials.append(m)
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    obj = bpy.data.objects.new(name, me)
    obj.location = B(*location)
    collection.objects.link(obj)
    return obj


def hex_bolt(center, axis, r=0.007, h=0.005, mat=0):
    """Hex bolt head: a 6-sided lathe with a domed top."""
    return lathe([(0, h), (r * 0.7, h), (r, h * 0.55), (r, 0), (0, 0)], mat, axis=axis, center=center, segments=6)


# --- Static frame ------------------------------------------------------------

def build_frame(M, col):
    mats = [M["walnut"], M["enamel"], M["brass"], M["steel"], M["felt"]]
    W, E, BR, S, F = range(5)
    parts = []
    foot_h = 0.012
    top = BASE["height"]

    # Walnut plinth on four turned brass feet with felt pads.
    cx = (BASE["minX"] + BASE["maxX"]) / 2
    cz = (BASE["minZ"] + BASE["maxZ"]) / 2
    w = BASE["maxX"] - BASE["minX"]
    d = BASE["maxZ"] - BASE["minZ"]
    outline = [B(x, foot_h, z) for x, z in rounded_rect(cx, cz, w, d, 0.035, 8)]
    parts.append(prism(outline, B(0, top - foot_h, 0), W, bevel=0.007, bevel_segments=3))
    # Brass inlay running round the plinth.
    band = [B(x, foot_h + 0.016, z) for x, z in rounded_rect(cx, cz, w + 0.003, d + 0.003, 0.0365, 8)]
    parts.append(prism(band, B(0, 0.005, 0), BR, bevel=0.0012, bevel_segments=1))
    for fx in (BASE["minX"] + 0.05, BASE["maxX"] - 0.05):
        for fz in (BASE["minZ"] + 0.045, BASE["maxZ"] - 0.045):
            parts.append(lathe([(0, foot_h), (0.02, foot_h), (0.02, 0.009), (0.014, 0.003), (0, 0.003)], BR,
                               center=(fx, 0, fz), segments=24))
            parts.append(lathe([(0, 0.003), (0.015, 0.003), (0.015, 0), (0, 0)], F, center=(fx, 0, fz), segments=24))

    # Cast uprights in oxblood enamel: a tapered lyre plate under each bearing.
    thickness = 0.022
    for sx in (-AXLE["bearingX"], AXLE["bearingX"]):
        prof = []
        bottom_w, neck_w, neck_y = 0.27, 0.07, CY - 0.07
        steps = 10
        for k in range(steps + 1):  # concave flank, bottom to neck (front side)
            t = k / steps
            y = top + (neck_y - top) * t
            half = neck_w / 2 + (bottom_w / 2 - neck_w / 2) * (1 - t) ** 1.8
            prof.append((half, y))
        for k in range(1, 12):  # rounded head around the bearing
            a = -0.35 + (math.pi + 0.7) * k / 12
            prof.append((math.cos(a) * 0.055, CY + math.sin(a) * 0.055))
        for k in range(steps, -1, -1):
            t = k / steps
            y = top + (neck_y - top) * t
            half = neck_w / 2 + (bottom_w / 2 - neck_w / 2) * (1 - t) ** 1.8
            prof.append((-half, y))
        outline = [B(sx - thickness / 2, y, z) for z, y in prof]
        parts.append(prism(outline, B(thickness, 0, 0), E, bevel=0.004, bevel_segments=2))
        # Turned brass bearing housing through the plate.
        parts.append(lathe([(0, -0.032), (0.026, -0.032), (0.034, -0.026), (0.034, 0.026), (0.026, 0.032), (0, 0.032)],
                           BR, axis="x", center=(sx, CY, 0), segments=32))
        # Bolts fixing the plate to the plinth.
        for bz in (-0.09, 0.09):
            for side in (-1, 1):
                parts.append(hex_bolt((sx + side * (thickness / 2 + 0.006), top, bz), "y", mat=S))
    # Small brass maker's plate on the front edge.
    plate = [B(x, y, BASE["maxZ"]) for x, y in rounded_rect(-0.02, top * 0.55 + foot_h * 0.5, 0.14, 0.022, 0.004, 3)]
    parts.append(prism(plate, B(0, 0, 0.003), BR, bevel=0.001, bevel_segments=1))
    for px in (-0.082, 0.042):
        parts.append(lathe([(0, 0.0045), (0.0025, 0.004), (0.003, 0)], S, axis="z",
                           center=(px, top * 0.55 + foot_h * 0.5, BASE["maxZ"] + 0.0015), segments=10))
    return build_object("MachineFrame", parts, mats, col)


# --- Exit chute and tray -----------------------------------------------------

def build_chute(M, col):
    mats = [M["chrome"], M["brass"], M["steel"]]
    C, BR, S = range(3)
    parts = []
    inner = CHUTE["tubeInnerRadius"]
    wall = 0.004

    # Enclosed tube from inside the pole ring, through the right bearing, bending down.
    tube_path = catmull_rom(CHUTE["tube"], 10)
    ring = [(math.cos(a) * (inner + wall), math.sin(a) * (inner + wall))
            for a in [2 * math.pi * k / 28 for k in range(28)]]
    parts.append(sweep(tube_path, ring, C, close_profile=True, cap=False))
    # Collar where the cage turns on the fixed tube, and a flange at the bend.
    parts.append(lathe([(inner + wall, -0.012), (inner + 0.012, -0.012), (inner + 0.012, 0.012), (inner + wall, 0.012)],
                       BR, axis="x", center=(CAGE["poleX"] + 0.02, CY, 0), segments=32, closed=True))

    # Open U channel: half-pipe with a rolled lip on each side.
    ramp_path = catmull_rom(CHUTE["ramp"], 12)
    outer_r = inner + wall
    u_profile = []
    for k in range(0, 15):
        a = math.pi + math.pi * k / 14  # inner surface, left to right through the bottom
        u_profile.append((math.cos(a) * inner, math.sin(a) * inner))
    u_profile += [(outer_r, 0.002), (outer_r, -0.0005)]
    for k in range(14, -1, -1):
        a = math.pi + math.pi * k / 14
        u_profile.append((math.cos(a) * outer_r, math.sin(a) * outer_r))
    u_profile += [(-outer_r, 0.002), (-inner, 0.002)]
    parts.append(sweep(ramp_path, u_profile, C, close_profile=True, cap=True))

    # Two brass stays carry the ramp down to the table.
    for idx in (2, 3):
        x, y, z = CHUTE["ramp"][idx]
        y_bottom = y - outer_r
        parts.append(lathe([(0, y_bottom), (0.0045, y_bottom), (0.0045, 0.006), (0.012, 0.004), (0.012, 0), (0, 0)],
                           BR, center=(x, 0, z), segments=16))

    # Brass receiving tray on the felt.
    tx, _, tz = TRAY["center"]
    r_in, floor, rim = TRAY["innerRadius"], TRAY["floorY"], TRAY["rimHeight"]
    parts.append(lathe([(0, floor), (r_in * 0.7, floor), (r_in, floor + 0.01), (r_in + 0.003, rim),
                        (r_in + 0.012, rim + 0.002), (r_in + 0.016, rim - 0.004), (r_in + 0.012, 0.004),
                        (r_in + 0.004, 0), (0, 0)], BR, center=(tx, 0, tz), segments=48))
    return build_object("ExitChute", parts, mats, col)


# --- Crank (turns with the cage) ---------------------------------------------

def build_crank(M, col):
    mats = [M["steel"], M["brass"], M["walnut"]]
    S, BR, W = range(3)
    parts = []
    x_pole = -CAGE["poleX"]
    x_arm = CRANK["x"]
    # Axle from the cage's left pole through the bearing to the crank hub (local: origin on the axle).
    parts.append(lathe([(0, x_arm - 0.012), (AXLE["radius"], x_arm - 0.012), (AXLE["radius"], x_pole + 0.01),
                        (0, x_pole + 0.01)], S, axis="x", segments=24))
    parts.append(lathe([(0, x_arm - 0.014), (0.026, x_arm - 0.014), (0.03, x_arm - 0.008), (0.03, x_arm + 0.006),
                        (0.022, x_arm + 0.01), (0, x_arm + 0.01)], BR, axis="x", segments=32))
    # Flat brass arm with rounded ends.
    arm = CRANK["armLength"]
    outline = []
    for k in range(13):
        a = math.pi / 2 + math.pi * k / 12
        outline.append((math.cos(a) * 0.017, math.sin(a) * 0.017))
    for k in range(13):
        a = -math.pi / 2 + math.pi * k / 12
        outline.append((math.cos(a) * 0.012, -arm + math.sin(a) * 0.012))
    outline = [B(x_arm - 0.018, y, z) for z, y in reversed(outline)]
    parts.append(prism(outline, B(0.009, 0, 0), BR, bevel=0.0025, bevel_segments=2))
    # Turned walnut handle sticking out from the arm's end.
    parts.append(lathe([(0, x_arm - 0.105), (0.008, x_arm - 0.104), (0.014, x_arm - 0.095), (0.0125, x_arm - 0.06),
                        (0.0105, x_arm - 0.035), (0.009, x_arm - 0.02), (0, x_arm - 0.02)], W, axis="x",
                       center=(0, -arm, 0), segments=24))
    return build_object("Crank", parts, mats, col)


# --- Preview-only stand-ins (cage, balls, table) -----------------------------

def build_preview(M, col):
    felt = material("Preview_Felt", "#1f4a36", roughness=0.92)
    wood = material("Preview_TableWood", "#3a2216", roughness=0.4, coat=0.5)
    t = LAYOUT["table"]
    top = [B(x, -0.04, z) for x, z in rounded_rect(t["centerX"], t["centerZ"], t["width"], t["depth"], 0.06, 6)]
    build_object("Preview_Table", [prism(top, B(0, 0.04, 0), 0)], [wood], col)
    inset = [B(x, -0.001, z) for x, z in rounded_rect(t["centerX"], t["centerZ"], t["width"] - 0.15, t["depth"] - 0.15, 0.03, 6)]
    build_object("Preview_Felt", [prism(inset, B(0, 0.002, 0), 0)], [felt], col)

    wire = material("Preview_Wire", "#c9a04a", metallic=1.0, roughness=0.3)
    rings = []
    R = CAGE["radius"]
    for x in CAGE["latitudes"]:
        r = math.sqrt(R * R - x * x)
        rings.append(lathe([(r - 0.004, 0.004), (r + 0.004, 0.004), (r + 0.004, -0.004), (r - 0.004, -0.004)], 0,
                           axis="x", center=(x, CY, 0), segments=64, closed=True))
    build_object("Preview_Cage", rings, [wire], col)
    ball_colors = ["#2459a8", "#c3322a", "#ece2c8", "#2c7a4c", "#e09a26"]
    bmats = [material(f"Preview_Ball{i}", c, roughness=0.24, coat=1.0) for i, c in enumerate(ball_colors)]
    for i in range(10):
        a = i * 2.4
        p = (math.cos(a) * 0.12 * (0.4 + (i % 3) * 0.3), CY - 0.19 + (i % 4) * 0.03, math.sin(a) * 0.1)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.03)
        bmesh.ops.translate(bm, verts=bm.verts, vec=B(*p))
        _finalize(bm, 0)
        build_object(f"Preview_Ball{i}", [bm], [bmats[i % 5]], col)


# --- Scene / render / export -------------------------------------------------

def reset_scene():
    if bpy.context.window is None and SCENE_NAME not in bpy.data.scenes:
        bpy.context.scene.name = SCENE_NAME
    scene = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for c in list(scene.collection.children):
        bpy.data.collections.remove(c)
    assets = bpy.data.collections.new("Assets")
    preview = bpy.data.collections.new("Preview")
    scene.collection.children.link(assets)
    scene.collection.children.link(preview)
    if bpy.context.window:
        bpy.context.window.scene = scene
    return scene, assets, preview


def setup_stage(scene, col):
    def area(name, pos, power, size, color, target=(0.05, 0.25, 0.05)):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size, light.color = power, size, color
        o = bpy.data.objects.new(name, light)
        o.location = B(*pos)
        o.rotation_euler = (B(*target) - o.location).to_track_quat("-Z", "Y").to_euler()
        col.objects.link(o)

    area("Preview_Key", (-0.6, 1.6, 0.9), 220, 0.8, (1.0, 0.86, 0.66))
    area("Preview_Fill", (1.6, 0.6, 1.4), 60, 1.2, (1.0, 0.95, 0.9))
    area("Preview_Rim", (0.2, 1.2, -1.4), 90, 1.0, (1.0, 0.8, 0.6))
    world = bpy.data.worlds.get("Preview_World") or bpy.data.worlds.new("Preview_World")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*hex_color("#2a1c14"), 1.0)
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world
    cam_data = bpy.data.cameras.new("Preview_Camera")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle = math.radians(32)
    cam = bpy.data.objects.new("Preview_Camera", cam_data)
    col.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 1000
    scene.eevee.taa_render_samples = 48
    scene.view_settings.view_transform = "Khronos PBR Neutral"


VIEWS = {
    "three_quarter": ((0.95, 0.62, 1.15), (0.03, 0.27, 0.06), 1.75),
    "chute_detail": ((1.1, 0.5, 0.75), (0.38, 0.17, 0.2), 0.85),
    "crank_side": ((-1.0, 0.45, 0.7), (-0.25, 0.33, 0.0), 1.1),
}


def build():
    scene, assets, preview = reset_scene()
    M = make_materials()
    objs = [build_frame(M, assets), build_chute(M, assets), build_crank(M, assets)]
    # The exported crank sits on the axle at the origin; preview a linked copy at the cage's height.
    objs[2].hide_render = True
    crank_preview = bpy.data.objects.new("Preview_Crank", objs[2].data)
    crank_preview.location = B(0, CY, 0)
    preview.objects.link(crank_preview)
    build_preview(M, preview)
    setup_stage(scene, preview)
    for o in objs:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        print(f"{o.name}: tris~{tris} mats={[m.name for m in o.data.materials]}")


def render(views=tuple(VIEWS)):
    scene = bpy.data.scenes[SCENE_NAME]
    os.makedirs(SRC_DIR, exist_ok=True)
    out = []
    for name in views:
        direction, target, distance = VIEWS[name]
        d = B(*direction).normalized()
        t = B(*target)
        scene.camera.location = t + d * distance
        scene.camera.rotation_euler = (t - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(SRC_DIR, f"bombo_preview_{name}.png")
        bpy.ops.render.render(write_still=True, scene=scene.name)
        out.append(scene.render.filepath)
    print("rendered:", out)


EXPORTS = {"MachineFrame": "bingo-frame.glb", "ExitChute": "bingo-chute.glb", "Crank": "bingo-crank.glb"}


def export():
    scene = bpy.context.scene
    if scene.name != SCENE_NAME:
        raise RuntimeError(f"Open the saved .blend so '{SCENE_NAME}' is the active scene")
    view_layer = bpy.context.view_layer
    os.makedirs(OUT_DIR, exist_ok=True)
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    for obj_name, filename in EXPORTS.items():
        obj = scene.objects[obj_name]
        for o in view_layer.objects:
            o.select_set(o == obj)
        view_layer.objects.active = obj
        selected = [o.name for o in bpy.context.selected_objects]
        if selected != [obj_name]:
            raise RuntimeError(f"Expected only {obj_name} selected, got {selected}")
        options = dict(filepath=os.path.join(OUT_DIR, filename), export_format="GLB", use_selection=True,
                       export_apply=True, export_yup=True, export_materials="EXPORT", export_texcoords=False,
                       export_normals=True, export_tangents=False, export_cameras=False, export_lights=False,
                       export_extras=False, export_animations=False)
        bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in known})
        path = os.path.join(OUT_DIR, filename)
        print(f"{path}  {os.path.getsize(path) / 1024:.1f} KB")


if "STEP" in globals():
    if STEP == "build":
        build()
    elif STEP == "render":
        render()
    elif STEP == "export":
        export()
