"""
Bombo: the hanging winner sign and the hall's neon name sign, built procedurally with bpy.

A marquee board in the hall's materials: walnut back, brass frame studded
with bulbs, an oxblood crest with raised brass "¡BOLA!" and two chains to
the ceiling. The winner itself is painted at runtime by three.js onto the
face (material "SignFace"), whose UVs span 0-1 across the opening.

Reuses the helpers and materials of build_bingo.py. Run inside Blender with
STEP set: "build" | "export". Export from the saved file, headless:
    blender -b assets-src/blender/bombo_sign.blend --python-expr "STEP='export'; exec(open(r'...build_sign.py').read())"

Conventions (as in build_bingo.py): 1 Blender metre = 1 three.js unit,
coordinates written in three.js axes and converted with B(). The origin is
the hook the chains hang from, so three.js can swing the sign around it.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = r"C:\Dev\Personal\random"
helpers = {}
exec(open(os.path.join(ROOT, "assets-src", "blender", "build_bingo.py"), encoding="utf-8").read(), helpers)
B = helpers["B"]
lathe, prism, rounded_rect, build_object = helpers["lathe"], helpers["prism"], helpers["rounded_rect"], helpers["build_object"]
material, hex_color, bevel_hard_edges, _finalize = (
    helpers["material"], helpers["hex_color"], helpers["bevel_hard_edges"], helpers["_finalize"])

SCENE_NAME = "BomboSign"
EXPORTS = {"WinnerSign": "bingo-sign.glb", "HallSign": "bingo-hall-sign.glb"}
BLEND = os.path.join(ROOT, "assets-src", "blender", "bombo_sign.blend")

# Board, in metres. The face's aspect is mirrored in src/scene/sign/signTexture.ts (FACE_ASPECT).
W, H, T = 0.86, 0.34, 0.03
CHAIN = 0.55
TOP = -CHAIN
CY = TOP - H / 2
BAND = 0.026
FACE_W, FACE_H = W - 2 * BAND, H - 2 * BAND
CHAIN_X = 0.34

WALNUT, BRASS, ENAMEL, FACE, BULB, NEON = range(6)


def make_materials():
    neon = material("Neon", "#ffd08a", roughness=0.2)
    p = next(n for n in neon.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Emission Color"].default_value = (*hex_color("#ff9a2e"), 1.0)
    p.inputs["Emission Strength"].default_value = 6.0
    bulb = material("Bulb", "#ffe3a6", roughness=0.15)
    p = next(n for n in bulb.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Emission Color"].default_value = (*hex_color("#ffcf7a"), 1.0)
    p.inputs["Emission Strength"].default_value = 2.0
    return [
        material("Walnut", "#33190f", roughness=0.42, coat=0.7, coat_roughness=0.18),
        material("Brass", "#c9a04a", metallic=1.0, roughness=0.27),
        material("OxbloodEnamel", "#4a1410", roughness=0.3, coat=0.9, coat_roughness=0.12),
        material("SignFace", "#3a0f0c", roughness=0.35),
        bulb,
        neon,
    ]


def ring(outer, inner, z0, z1, mat, bevel=0.0):
    """A flat frame between two closed outlines with the same number of points, from z0 to z1."""
    bm = bmesh.new()
    rings = []
    for z in (z0, z1):
        rings.append(([bm.verts.new(B(x, y, z)) for x, y in outer], [bm.verts.new(B(x, y, z)) for x, y in inner]))
    (ob, ib), (of, if_) = rings
    n = len(outer)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((of[i], of[j], if_[j], if_[i]))  # front
        bm.faces.new((ob[j], ob[i], ib[i], ib[j]))  # back
        bm.faces.new((ob[i], ob[j], of[j], of[i]))  # outer wall
        bm.faces.new((ib[j], ib[i], if_[i], if_[j]))  # inner wall
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel_hard_edges(bm, bevel, 2)
    _finalize(bm, mat)
    return bm


def slab(outline, z0, z1, mat, bevel=0.0):
    return prism([B(x, y, z0) for x, y in outline], B(0, 0, z1 - z0) - B(0, 0, 0), mat, bevel=bevel)


def plane(cx, cy, w, h, z, mat):
    bm = bmesh.new()
    vs = [bm.verts.new(B(cx + sx * w / 2, cy + sy * h / 2, z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(vs)
    _finalize(bm, mat)
    return bm


def link(center, vertical_plane_x):
    """One oval chain link; alternate links turn 90 degrees."""
    r_wire, r_ring = 0.0032, 0.0085
    profile = [(r_ring + r_wire * math.cos(a), r_wire * math.sin(a))
               for a in (2 * math.pi * k / 6 for k in range(6))]
    bm = lathe(profile, BRASS, axis="x" if vertical_plane_x else "z", segments=10, closed=True)
    for v in bm.verts:
        v.co.z *= 1.55  # elongate along three.js Y (Blender Z)
    bmesh.ops.translate(bm, verts=bm.verts, vec=B(*center))
    return bm


def chain(x, z):
    parts = []
    pitch = 0.024
    count = int((CHAIN + 0.01) / pitch)
    for k in range(count):
        parts.append(link((x, -k * pitch - 0.01, z), k % 2 == 1))
    return parts


def perimeter(w, h, r, spacing):
    """Evenly spaced points round a rounded rectangle centred on the board."""
    pts = rounded_rect(0, CY, w, h, r, per_corner=10)
    segs = [(Vector(pts[i]), Vector(pts[(i + 1) % len(pts)])) for i in range(len(pts))]
    total = sum((b - a).length for a, b in segs)
    n = max(4, round(total / spacing))
    step, out, walked, i = total / n, [], 0.0, 0
    for k in range(n):
        target = k * step
        while walked + (segs[i][1] - segs[i][0]).length < target:
            walked += (segs[i][1] - segs[i][0]).length
            i += 1
        a, b = segs[i]
        out.append(a.lerp(b, (target - walked) / (b - a).length))
    return out


def bulb(x, y, z):
    socket = lathe([(0, 0), (0.0068, 0), (0.0068, 0.004), (0.0058, 0.0065), (0, 0.0065)], BRASS,
                   axis="z", center=(x, y, z), segments=12)
    glass = lathe([(0, 0.004), (0.0062, 0.006), (0.0078, 0.0105), (0.0065, 0.0155), (0, 0.0175)], BULB,
                  axis="z", center=(x, y, z), segments=12)
    return [socket, glass]


def text_mesh(body, size, center, mat, extrude=0.0, tube=0.0, space=1.0):
    """Text as mesh, facing the viewer (+Z in three.js) and centred on `center`.
    With `tube`, only the letter outlines are kept and swept as round tubes: neon."""
    curve = bpy.data.curves.new("Text", "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.space_character = space
    curve.resolution_u = 4
    if tube:
        curve.fill_mode = "NONE"
        curve.bevel_depth = tube
        curve.bevel_resolution = 2
    else:
        curve.extrude = extrude
    obj = bpy.data.objects.new("Text", curve)
    bpy.context.scene.collection.objects.link(obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(curve)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    # Text lies in Blender XY facing +Z; stand it up facing the viewer (-Y).
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "X"))
    bmesh.ops.translate(bm, verts=bm.verts, vec=B(*center))
    _finalize(bm, mat)
    return bm


def crest_text(z):
    """Raised brass "¡BOLA!" on the crest."""
    return text_mesh("¡BOLA!", 0.066, (0, TOP + 0.047, z), BRASS, extrude=0.003, space=1.12)


def build_sign(mats, col):
    front = T / 2
    parts = [
        # Walnut board and its brass frame with the bulbs on it.
        slab(rounded_rect(0, CY, W, H, 0.03, 8), -front, front, WALNUT, bevel=0.004),
        ring(rounded_rect(0, CY, W, H, 0.03, 8), rounded_rect(0, CY, FACE_W, FACE_H, 0.012, 8),
             front, front + 0.01, BRASS, bevel=0.002),
        # Fine inner bead round the opening.
        ring(rounded_rect(0, CY, FACE_W + 0.006, FACE_H + 0.006, 0.014, 8),
             rounded_rect(0, CY, FACE_W, FACE_H, 0.012, 8), front, front + 0.014, BRASS, bevel=0.001),
        plane(0, CY, FACE_W, FACE_H, front + 0.0012, FACE),
        # Oxblood crest with a brass rim, overlapping the top edge.
        slab(rounded_rect(0, TOP + 0.045, 0.36, 0.12, 0.06, 10), -front + 0.004, front + 0.012, ENAMEL, bevel=0.003),
        ring(rounded_rect(0, TOP + 0.045, 0.36, 0.12, 0.06, 10), rounded_rect(0, TOP + 0.045, 0.342, 0.102, 0.051, 10),
             front + 0.012, front + 0.018, BRASS, bevel=0.0012),
        crest_text(front + 0.013),
    ]
    for p in perimeter(W - BAND, H - BAND, 0.03 - BAND / 2, 0.072):
        parts += bulb(p.x, p.y, front + 0.008)
    for x in (-CHAIN_X, CHAIN_X):
        # Eyelet screwed into the top of the board, then the chain up to the hook.
        parts.append(lathe([(0.0035, -0.004), (0.0035, 0.0), (0.0, 0.0)], BRASS, axis="y", center=(x, TOP, 0), segments=10))
        parts += chain(x, 0)
        parts.append(lathe([(0, 0), (0.012, 0), (0.012, 0.006), (0, 0.006)], BRASS, axis="y", center=(x, -0.004, 0), segments=16))
    obj = build_object("WinnerSign", parts, mats, col, smooth_angle=40)
    face_uvs(obj)
    return obj


# The hall's own sign: "BOMBO" in neon on a walnut board, for the back wall. Origin at its centre.
HALL_W, HALL_H = 1.06, 0.46


def build_hall_sign(mats, col):
    front = 0.02
    outer = rounded_rect(0, 0, HALL_W, HALL_H, 0.035, 8)
    inner = rounded_rect(0, 0, HALL_W - 0.05, HALL_H - 0.05, 0.016, 8)
    parts = [
        slab(outer, -front, front, WALNUT, bevel=0.004),
        ring(outer, inner, front, front + 0.012, BRASS, bevel=0.002),
        slab(inner, front - 0.002, front + 0.002, ENAMEL),
        # Neon letters stand off the board on short pins.
        text_mesh("BOMBO", 0.215, (0, 0.035, front + 0.03), NEON, tube=0.0055, space=1.08),
        text_mesh("SALA DE SORTEOS", 0.043, (0, -0.152, front + 0.004), BRASS, extrude=0.002, space=1.35),
    ]
    for x in (-0.36, -0.12, 0.12, 0.36):
        for y in (0.11, -0.04):
            parts.append(lathe([(0.0022, 0), (0.0022, 0.026), (0, 0.026)], BRASS, axis="z",
                               center=(x, y, front + 0.002), segments=6))
    return build_object("HallSign", parts, mats, col, smooth_angle=40)


def face_uvs(obj):
    """UVs 0-1 across the face opening (u right, v up); everything else at 0."""
    me = obj.data
    # The text mesh brings its own UV layer along; the face's must be the only (first) one.
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name="UVMap")
    face_index = [m.name for m in me.materials].index("SignFace")
    for poly in me.polygons:
        for li in poly.loop_indices:
            if poly.material_index != face_index:
                uv.data[li].uv = (0, 0)
                continue
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x + FACE_W / 2) / FACE_W, (co.z - (CY - FACE_H / 2)) / FACE_H)


def scene():
    sc = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    for obj in list(sc.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    if bpy.context.window:
        bpy.context.window.scene = sc
    return sc


def build():
    sc = scene()
    mats = make_materials()
    objs = [build_sign(mats, sc.collection), build_hall_sign(mats, sc.collection)]
    # Side by side for previewing; each exports on its own, from its own origin.
    objs[1].location = B(1.4, -0.7, 0)
    for obj in objs:
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        print(f"{obj.name}: tris~{tris} mats={[m.name for m in obj.data.materials]} dims={tuple(round(d, 3) for d in obj.dimensions)}")
    data = {sc, *objs, *(o.data for o in objs), *mats}
    bpy.data.libraries.write(BLEND, data, fake_user=True)
    print("saved", BLEND)


def export():
    sc = bpy.data.scenes[SCENE_NAME]
    if bpy.context.scene != sc:
        if bpy.context.window is None:
            raise RuntimeError(f"Open bombo_sign.blend so '{SCENE_NAME}' is the active scene")
        bpy.context.window.scene = sc
    view_layer = bpy.context.view_layer
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    for name, filename in EXPORTS.items():
        obj = sc.objects[name]
        for o in view_layer.objects:
            o.select_set(o == obj)
        view_layer.objects.active = obj
        # Export from the origin, whatever the preview layout.
        placed = obj.location.copy()
        obj.location = (0, 0, 0)
        out = os.path.join(ROOT, "public", "models", filename)
        options = dict(filepath=out, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                       export_materials="EXPORT", export_texcoords=name == "WinnerSign", export_normals=True,
                       export_tangents=False, export_cameras=False, export_lights=False, export_extras=False,
                       export_animations=False)
        bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in known})
        obj.location = placed
        print(f"{out}  {os.path.getsize(out) / 1024:.1f} KB")

if "STEP" in globals():
    if STEP == "build":
        build()
    elif STEP == "export":
        export()
