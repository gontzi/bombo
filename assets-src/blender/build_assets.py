"""
Rueda: static 3D assets for the web wheel, built procedurally with bpy.

Run inside Blender (Blender MCP or the Text Editor). Set STEP before exec:
    STEP = "build" | "render" | "export" | "all"

Conventions (shared with src/scene/dimensions.ts):
- 1 Blender metre = 1 three.js unit; the wheel's segment outer radius is 1.
- Coordinates below are written in three.js axes (Y up, +Z towards the camera)
  and converted with B(); the glTF exporter turns Blender Z-up back into Y-up.
- Wheel-space assets (pedestal, axle housing, hub cap) have their origin at the
  wheel centre on its back plane, so they drop into the scene at identity.
- The pointer flap's origin is its pivot; the peg's origin is the centre of its base.
- Option labels and segments are NOT modelled: they stay dynamic in three.js.
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = r"C:\Dev\Personal\random"
OUT_DIR = os.path.join(ROOT, "public", "models")
SRC_DIR = os.path.join(ROOT, "assets-src", "blender")
SCENE_NAME = "RuedaAssets"

# --- Mirrors src/scene/dimensions.ts --------------------------------------
SEGMENT_OUTER = 1.0
SEGMENT_INNER = 0.21
SEGMENT_FRONT = 0.094
BACKPLATE_DEPTH = 0.035
RIM_INNER = 1.004
RIM_OUTER = 1.1
RIM_FRONT = 0.124
PEG_RADIUS = 1.05
PEG_HEIGHT = 0.05
POINTER_Z = 0.199
POINTER_PIVOT_X = 1.24
POINTER_TIP_X = 0.93

# --- Pedestal layout (new) --------------------------------------------------
FLOOR_Y = -1.495
PLINTH_TOP = -1.36
COLUMN_Z = -0.13
MAST_Z = 0.14


def B(x, y, z):
    """three.js (Y up, +Z to camera) -> Blender (Z up, -Y to camera)."""
    return Vector((x, -z, y))


# --- Materials ---------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def material(name, color, metallic=0.0, roughness=0.5, coat=0.0, coat_roughness=0.1):
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
    m.metallic = metallic
    m.roughness = roughness
    return m


def make_materials():
    return {
        # Same values as src/scene/materials.ts so web and Blender agree.
        "brass": material("Brass", "#c9a04a", metallic=1.0, roughness=0.3),
        "ink": material("InkLacquer", "#1c1714", roughness=0.32, coat=1.0, coat_roughness=0.12),
        "steel": material("DarkSteel", "#2b2520", metallic=0.7, roughness=0.45),
        "graphite": material("GraphiteSatin", "#2f2a25", roughness=0.62, coat=0.25, coat_roughness=0.4),
    }


# --- Geometry helpers --------------------------------------------------------

def _finalize_part(bm, material_index):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.material_index = material_index


def lathe(profile, material_index, axis="z", center=(0.0, 0.0, 0.0), segments=48, closed=False):
    """
    Revolve a (radius, height) profile. axis "z": around three.js Z (the wheel
    axle); axis "y": around three.js Y (vertical). Profiles either start and
    end on the axis, or are closed loops (closed=True).
    """
    bm = bmesh.new()
    if axis == "z":
        pts = [B(r, 0.0, h) for r, h in profile]
        ax = Vector((0.0, -1.0, 0.0))
    else:
        pts = [B(r, h, 0.0) for r, h in profile]
        ax = Vector((0.0, 0.0, 1.0))
    verts = [bm.verts.new(p) for p in pts]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    if closed:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=ax,
                   angle=2 * math.pi, steps=segments, use_merge=True)
    bmesh.ops.translate(bm, verts=bm.verts, vec=B(*center))
    _finalize_part(bm, material_index)
    return bm


def bevel_hard_edges(bm, width, segments, min_angle_deg=30):
    edges = [e for e in bm.edges
             if e.is_manifold and e.calc_face_angle(0.0) > math.radians(min_angle_deg)]
    if edges and width > 0:
        bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type="OFFSET",
                        segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)


def prism(outline, extrude, material_index, bevel=0.0, bevel_segments=3):
    """Extrude a planar outline (Blender-space points) along a vector, then bevel its hard edges."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new(p) for p in outline])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=extrude)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel_hard_edges(bm, bevel, bevel_segments)
    _finalize_part(bm, material_index)
    return bm


def loft(bottom, top, material_index, bevel=0.0, bevel_segments=2):
    """Skin two loops with the same vertex count, capped at both ends."""
    bm = bmesh.new()
    vb = [bm.verts.new(p) for p in bottom]
    vt = [bm.verts.new(p) for p in top]
    n = len(vb)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    bm.faces.new(list(reversed(vb)))
    bm.faces.new(vt)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel_hard_edges(bm, bevel, bevel_segments)
    _finalize_part(bm, material_index)
    return bm


def rounded_rect(cx, cz, width, depth, radius, per_corner=8):
    """Rounded rectangle in the three.js XZ plane, as (x, z) pairs, counter-clockwise."""
    radius = min(radius, width / 2, depth / 2)
    hx, hz = width / 2 - radius, depth / 2 - radius
    corners = [(hx, hz, 0.0), (-hx, hz, 90.0), (-hx, -hz, 180.0), (hx, -hz, 270.0)]
    pts = []
    for ox, oz, start in corners:
        for k in range(per_corner + 1):
            a = math.radians(start + 90.0 * k / per_corner)
            pts.append((cx + ox + math.cos(a) * radius, cz + oz + math.sin(a) * radius))
    # Drop duplicates where straight sides have zero length (stadium ends).
    clean = []
    for p in pts:
        if not clean or (abs(p[0] - clean[-1][0]) > 1e-7 or abs(p[1] - clean[-1][1]) > 1e-7):
            clean.append(p)
    if abs(clean[0][0] - clean[-1][0]) < 1e-7 and abs(clean[0][1] - clean[-1][1]) < 1e-7:
        clean.pop()
    return clean


def build_object(name, parts, mats, collection, smooth_angle=34.0, location=(0, 0, 0)):
    """Merge bmesh parts into one mesh object with per-part material slots."""
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


# --- Assets -------------------------------------------------------------------

def build_pedestal(M, col):
    mats = [M["graphite"], M["steel"], M["ink"], M["brass"]]
    G, S, I, Br = range(4)

    # Stadium plinth, wider than the wheel and offset right to carry the pointer mast.
    cx, cz, w, d = 0.17, -0.02, 2.66, 0.76
    plinth_h = PLINTH_TOP - (FLOOR_Y + 0.025)
    plinth = prism([B(x, FLOOR_Y + 0.025, z) for x, z in rounded_rect(cx, cz, w, d, d / 2, 16)],
                   B(0, plinth_h, 0), G, bevel=0.018, bevel_segments=3)
    # Recessed foot: leaves a thin shadow gap so the plinth seems to float.
    foot = prism([B(x, FLOOR_Y, z) for x, z in rounded_rect(cx, cz, w - 0.12, d - 0.12, d / 2 - 0.06, 16)],
                 B(0, 0.026, 0), S, bevel=0.004, bevel_segments=1)
    # Inlaid brass band halfway up the plinth's flat sides.
    band_y = FLOOR_Y + 0.025 + plinth_h * 0.42
    band = prism([B(x, band_y, z) for x, z in rounded_rect(cx, cz, w + 0.004, d + 0.004, d / 2 + 0.002, 16)],
                 B(0, 0.01, 0), Br, bevel=0.002, bevel_segments=1)

    # Tapered blade column behind the wheel, up into the axle housing.
    bottom = [B(x, PLINTH_TOP, z) for x, z in rounded_rect(0.0, COLUMN_Z, 0.2, 0.075, 0.03, 5)]
    top = [B(x, 0.0, z) for x, z in rounded_rect(0.0, COLUMN_Z, 0.13, 0.068, 0.03, 5)]
    column = loft(bottom, top, I)
    plate = prism([B(x, PLINTH_TOP - 0.002, z) for x, z in rounded_rect(0.0, COLUMN_Z, 0.29, 0.15, 0.05, 6)],
                  B(0, 0.016, 0), Br, bevel=0.004, bevel_segments=2)

    # Pointer mast: brass rod on a turned boss, ending in a steel pivot head.
    rod = lathe([(0.0, PLINTH_TOP - 0.002), (0.058, PLINTH_TOP - 0.002), (0.058, PLINTH_TOP + 0.01),
                 (0.04, PLINTH_TOP + 0.026), (0.022, PLINTH_TOP + 0.04), (0.022, -0.03), (0.0, -0.03)],
                Br, axis="y", center=(POINTER_PIVOT_X, 0.0, MAST_Z), segments=28)
    head = lathe([(0.0, POINTER_Z - 0.004), (0.03, POINTER_Z - 0.004), (0.042, POINTER_Z - 0.016),
                  (0.042, 0.1), (0.034, 0.09), (0.0, 0.09)],
                 S, axis="z", center=(POINTER_PIVOT_X, 0.0, 0.0), segments=32)

    return build_object("Pedestal", [plinth, foot, band, column, plate, rod, head], mats, col)


def build_axle_housing(M, col):
    profile = [
        (0.0, -BACKPLATE_DEPTH), (0.045, -BACKPLATE_DEPTH),       # axle stub face, touching the wheel
        (0.045, -0.05), (0.07, -0.05), (0.072, -0.056),            # stepped bearing seat
        (0.09, -0.058), (0.105, -0.072),                           # front chamfer
        (0.105, -0.112), (0.1, -0.116), (0.1, -0.124), (0.105, -0.128),  # fine groove
        (0.105, -0.176), (0.097, -0.192), (0.07, -0.2), (0.0, -0.204),   # rounded back cap
    ]
    return build_object("AxleHousing", [lathe(profile, 0, segments=48)], [M["steel"]], col)


def build_hub_cap(M, col):
    collar = lathe([(0.128, 0.122), (0.138, 0.138), (0.172, 0.138), (0.176, 0.134),
                    (0.18, 0.134), (0.192, 0.124), (0.2, 0.108), (0.2, 0.0), (0.128, 0.0)],
                   0, segments=64, closed=True)
    dome = lathe([(0.0, 0.152), (0.045, 0.15), (0.09, 0.141), (0.13, 0.125), (0.13, 0.1), (0.0, 0.1)],
                 1, segments=64)
    bolt = lathe([(0.0, 0.177), (0.016, 0.176), (0.026, 0.169), (0.03, 0.159), (0.03, 0.146), (0.0, 0.146)],
                 0, segments=32)
    return build_object("HubCap", [collar, dome, bolt], [M["brass"], M["ink"]], col)


def pointer_outline(length, width, steps=20):
    """Same silhouette as createPointerGeometry() in src/scene/geometry.ts."""
    pts = []

    def quad(p0, p1, p2, include_start):
        for k in range(0 if include_start else 1, steps + 1):
            t = k / steps
            pts.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))

    quad((-length, 0.0), (-length * 0.45, width * 0.55), (0.0, width), True)
    for k in range(1, steps * 2):
        a = math.pi / 2 - math.pi * k / (steps * 2)
        pts.append((math.cos(a) * width, math.sin(a) * width))
    quad((0.0, -width), (-length * 0.45, -width * 0.55), (-length, 0.0), True)
    pts.pop()
    return pts


def build_pointer(M, col):
    length = POINTER_PIVOT_X - POINTER_TIP_X
    depth = 0.045
    flap = prism([B(x, y, 0.0) for x, y in pointer_outline(length, 0.075)], B(0, 0, depth), 0,
                 bevel=0.008, bevel_segments=3)
    cap = lathe([(0.0, depth + 0.017), (0.026, depth + 0.017), (0.034, depth + 0.009),
                 (0.034, depth - 0.006), (0.0, depth - 0.006)], 1, segments=32)
    return build_object("PointerFlap", [flap, cap], [M["ink"], M["brass"]], col,
                        location=(POINTER_PIVOT_X, 0.0, POINTER_Z))


def build_peg(M, col):
    peg = lathe([(0.0, PEG_HEIGHT), (0.009, PEG_HEIGHT - 0.001), (0.014, PEG_HEIGHT - 0.007),
                 (0.014, 0.0), (0.0, 0.0)], 0, segments=16)
    return build_object("Peg", [peg], [M["brass"]], col)


# --- Preview-only proxy of the dynamic wheel (never exported) ---------------

PALETTE = ["#D4462C", "#EFDFC0", "#1F6B5C", "#E2A93B", "#25406E", "#7A2F4C", "#D4462C", "#EFDFC0"]


def build_preview_wheel(M, col, peg_obj, n=8):
    seg_mats = [material(f"Preview_Seg{i}", c, roughness=0.42, coat=0.85, coat_roughness=0.2)
                for i, c in enumerate(PALETTE[:6])]
    parts = []
    s = 2 * math.pi / n
    for i in range(n):
        a0, a1 = i * s + 0.012, (i + 1) * s - 0.012
        arc_out = [(math.cos(a0 + (a1 - a0) * k / 24), math.sin(a0 + (a1 - a0) * k / 24)) for k in range(25)]
        outline = [B(x * SEGMENT_OUTER, y * SEGMENT_OUTER, 0.0) for x, y in arc_out]
        outline += [B(math.cos(a) * SEGMENT_INNER, math.sin(a) * SEGMENT_INNER, 0.0)
                    for a in (a1 - 0.03, a0 + 0.03)]
        parts.append(prism(outline, B(0, 0, SEGMENT_FRONT), i % 6, bevel=0.01, bevel_segments=2))
    build_object("Preview_Segments", parts, seg_mats, col)

    back = lathe([(0.0, 0.0), (1.01, 0.0), (1.01, -BACKPLATE_DEPTH), (0.0, -BACKPLATE_DEPTH)], 0, segments=96)
    rim = lathe([(RIM_INNER, -BACKPLATE_DEPTH), (1.088, -BACKPLATE_DEPTH), (RIM_OUTER, -0.023),
                 (RIM_OUTER, RIM_FRONT - 0.012), (1.088, RIM_FRONT), (1.016, RIM_FRONT),
                 (RIM_INNER, RIM_FRONT - 0.012)], 1, segments=128, closed=True)
    build_object("Preview_RimBack", [back, rim], [M["steel"], M["ink"]], col)

    for i in range(n):
        a = i * s
        inst = bpy.data.objects.new(f"Preview_Peg{i}", peg_obj.data)
        inst.location = B(math.cos(a) * PEG_RADIUS, math.sin(a) * PEG_RADIUS, RIM_FRONT - 0.006)
        col.objects.link(inst)


# --- Scene -------------------------------------------------------------------

def reset_scene():
    # Headless runs reuse the (disposable) startup scene; in a live session a
    # separate scene keeps the user's own work untouched.
    if bpy.context.window is None and SCENE_NAME not in bpy.data.scenes:
        bpy.context.scene.name = SCENE_NAME
    scene = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for c in list(scene.collection.children):
        bpy.data.collections.remove(c)
    for block in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    assets = bpy.data.collections.new("Assets")
    preview = bpy.data.collections.new("Preview")
    scene.collection.children.link(assets)
    scene.collection.children.link(preview)
    activate(scene)
    return scene, assets, preview


def activate(scene):
    """Make the scene AND its view layer the context ones (the exporter reads both)."""
    window = bpy.context.window
    if window:
        window.scene = scene
        window.view_layer = scene.view_layers[0]


def setup_stage(scene, col):
    paper = material("Preview_Paper", "#EEE7DA", roughness=0.9)
    floor = bpy.data.meshes.new("Preview_Floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12)
    bm.to_mesh(floor)
    bm.free()
    floor.materials.append(paper)
    obj = bpy.data.objects.new("Preview_Floor", floor)
    obj.location = (0.0, 0.0, FLOOR_Y)
    col.objects.link(obj)
    wall = bpy.data.objects.new("Preview_Wall", floor)
    wall.location = B(0.0, FLOOR_Y, -2.5)
    wall.rotation_euler = (math.pi / 2, 0.0, 0.0)
    col.objects.link(wall)

    def area(name, pos, power, size, color):
        light = bpy.data.lights.new(name, "AREA")
        light.energy = power
        light.size = size
        light.color = color
        o = bpy.data.objects.new(name, light)
        o.location = pos
        o.rotation_euler = (Vector((0.15, 0.0, -0.4)) - pos).to_track_quat("-Z", "Y").to_euler()
        col.objects.link(o)

    area("Preview_Key", B(-3.2, 4.0, 5.4), 1500, 3.0, (1.0, 0.96, 0.9))
    area("Preview_Fill", B(5.0, 0.6, 2.8), 350, 2.0, (1.0, 0.86, 0.68))
    area("Preview_Rim", B(0.5, 3.5, -3.5), 500, 2.5, (1.0, 1.0, 1.0))

    world = bpy.data.worlds.get("Preview_World") or bpy.data.worlds.new("Preview_World")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*hex_color("#EEE7DA"), 1.0)
    bg.inputs["Strength"].default_value = 0.35
    scene.world = world

    cam_data = bpy.data.cameras.new("Preview_Camera")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle = math.radians(28)
    cam = bpy.data.objects.new("Preview_Camera", cam_data)
    col.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 1100
    scene.render.film_transparent = False
    scene.eevee.taa_render_samples = 64
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    return cam


def aim_camera(cam, direction, target, distance):
    d = B(*direction).normalized()
    t = B(*target)
    cam.location = t + d * distance
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()


def build():
    scene, assets, preview = reset_scene()
    M = make_materials()
    objs = {
        "pedestal": build_pedestal(M, assets),
        "axle_housing": build_axle_housing(M, assets),
        "hub_cap": build_hub_cap(M, assets),
        "pointer": build_pointer(M, assets),
        "peg": build_peg(M, assets),
    }
    # The master peg sits at the origin for export; the preview uses linked copies on the rim.
    objs["peg"].hide_render = True
    build_preview_wheel(M, preview, objs["peg"])
    setup_stage(scene, preview)
    for name, o in objs.items():
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        print(f"{name}: {o.name} tris={tris} mats={[m.name for m in o.data.materials]}")
    return objs


VIEWS = {
    "front": ((0.16, 0.12, 1.0), (0.17, -0.2, 0.0), 7.6),
    "three_quarter": ((0.9, 0.35, 0.75), (0.17, -0.25, -0.05), 7.4),
    "hub_detail": ((0.35, 0.25, 1.0), (0.55, 0.0, 0.1), 3.0),
}


def render(views=("front", "three_quarter", "hub_detail")):
    scene = bpy.data.scenes[SCENE_NAME]
    os.makedirs(SRC_DIR, exist_ok=True)
    out = []
    for name in views:
        direction, target, distance = VIEWS[name]
        aim_camera(scene.camera, direction, target, distance)
        scene.render.filepath = os.path.join(SRC_DIR, f"preview_{name}.png")
        with bpy.context.temp_override(scene=scene):
            bpy.ops.render.render(write_still=True, scene=scene.name)
        out.append(scene.render.filepath)
    aim_camera(scene.camera, *VIEWS["front"])
    print("rendered:", out)
    return out


EXPORTS = {
    "Pedestal": "rueda-pedestal.glb",
    "AxleHousing": "rueda-axle-housing.glb",
    "HubCap": "rueda-hub-cap.glb",
    "PointerFlap": "rueda-pointer.glb",
    "Peg": "rueda-peg.glb",
}


def export():
    # Overriding the context to a non-active scene crashes the exporter's
    # depsgraph evaluation (Blender 5.2), so export only from the active scene.
    scene = bpy.data.scenes[SCENE_NAME]
    activate(scene)
    view_layer = bpy.context.view_layer
    if bpy.context.scene != scene or view_layer.name not in scene.view_layers:
        raise RuntimeError(f"Make '{SCENE_NAME}' and its view layer active before exporting")
    os.makedirs(OUT_DIR, exist_ok=True)
    written = []
    for obj_name, filename in EXPORTS.items():
        obj = scene.objects[obj_name]
        saved = obj.location.copy()
        obj.location = (0.0, 0.0, 0.0)  # every file ships with an identity root
        for o in view_layer.objects:
            o.select_set(o == obj)
        view_layer.objects.active = obj
        path = os.path.join(OUT_DIR, filename)
        options = dict(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_materials="EXPORT",
            export_texcoords=False,  # no textures, so no UVs to ship
            export_normals=True,
            export_tangents=False,
            export_cameras=False,
            export_lights=False,
            export_extras=False,
            export_animations=False,
        )
        # Exporter option names drift between Blender versions: pass only the ones this one knows.
        known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
        options = {k: v for k, v in options.items() if k in known}
        view_layer.update()
        selected = [o.name for o in bpy.context.selected_objects]
        if selected != [obj.name]:
            raise RuntimeError(f"Expected only {obj.name} selected, got {selected}")
        bpy.ops.export_scene.gltf(**options)
        obj.location = saved
        written.append((path, os.path.getsize(path)))
    for path, size in written:
        print(f"{path}  {size / 1024:.1f} KB")
    return written


if __name__ in ("__main__", "<run_path>") or "STEP" in globals():
    step = globals().get("STEP", "all")
    if step in ("build", "all"):
        build()
    if step in ("render", "all"):
        render()
    if step in ("export", "all"):
        export()
