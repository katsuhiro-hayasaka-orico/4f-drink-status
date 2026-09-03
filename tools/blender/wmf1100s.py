#!/usr/bin/env python3
"""WMF 1100 S — 3D model and transparent renders for the machine card.

Run headless:

    blender -b --python tools/blender/wmf1100s.py -- --theme all
    # or, with the official wheel (has a denoiser):
    python -c "import bpy" && python tools/blender/wmf1100s.py --theme all

Why the scene is built the way it is
------------------------------------
The picture on the board is not decoration: three hopper windows and the ice
bin show how much is left, and the SVG in `src/components/MachineIllustration.tsx`
paints those levels *through* holes in this render. So the render has to land on
the SVG's grid, not the other way round.

Hence: one Blender unit is one unit of the SVG viewBox (`0 0 800 560`), and the
camera is aimed straight down +Y with a long lens. A horizontal optical axis
means every surface parallel to the image plane still projects to an
axis-aligned rectangle — so a window modelled as a rectangle at depth 0 lands
exactly on its viewBox rectangle, which is what lets the SVG clip against it.
Depth is not wasted, though: the long lens still opens up the cup recess and
shows the top faces of the plinth and drip tray, which is what makes it read as
a photograph of a machine rather than an elevation drawing.

Three images come out of one scene:

  light     the machine as it is — a near-black shell — for the light theme
  dark      the same geometry re-lit and lifted, because a black machine
            disappears on a dark page (the same inversion the CSS used to do)
  contents  beans, cocoa, milk powder and ice at 100%, everything else hidden

The window interiors are punched out of `light`/`dark` by holdout boxes, so the
body image is a *frame*. The SVG slides `contents` up behind it to the reported
level. That ordering also means the frame's edge always paints over the
contents, so a fill can never spill past the glass.

`layout.json` is written from the same constants the geometry is built from, so
the component never has to guess where the holes ended up.
"""

import argparse
import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

# --------------------------------------------------------------- geometry --
# One Blender unit == one SVG viewBox unit. World x is viewBox x; world z runs
# the other way, so viewBox y == 560 - z. Depth (y) is free: 0 is the plane the
# viewBox describes, positive goes away from the viewer.

VIEW_W, VIEW_H = 800.0, 560.0
PX_PER_UNIT = 1.4
RES_X, RES_Y = round(VIEW_W * PX_PER_UNIT), round(VIEW_H * PX_PER_UNIT)  # 1120x784

CAM_POS = (400.0, -3000.0, 520.0)
CAM_FOCAL = 135.0          # mm on a 36mm sensor: gentle perspective, no keystone
CAM_SENSOR = 36.0
CAM_SHIFT_Y = -0.3         # drops the frame to cover z 0..560 from a camera at 520


def z_of(vy):
    """viewBox y -> world z."""
    return VIEW_H - vy


def vb_to_world(vx, vy, depth):
    """World point that *projects* onto viewBox (vx, vy) when placed at `depth`.

    Only holdout boxes need this: they sit in front of the glass they erase, so
    they have to be shrunk toward the camera to keep covering the same pixels.
    """
    k = (depth - CAM_POS[1]) / (0.0 - CAM_POS[1])
    x = CAM_POS[0] + (vx - CAM_POS[0]) * k
    z = CAM_POS[2] + (z_of(vy) - CAM_POS[2]) * k
    return x, depth, z


# Windows, in viewBox units: (x, y, width, height). These are the numbers the
# component has always used, kept so the readouts stay where people expect.
WINDOWS = {
    "ice": (48.0, 86.0, 144.0, 118.0),
    "coffeeBeans": (308.0, 56.0, 124.0, 96.0),
    "cocoaPowder": (463.0, 56.0, 124.0, 96.0),
    "milkPowder": (618.0, 56.0, 124.0, 96.0),
}
SCREEN = (436.0, 186.0, 148.0, 162.0)   # glass, not bezel: the SVG tiles live here
ICE_GLYPH = (120.0, 376.0)              # baseline anchor for the 氷 character

MACHINE_X0, MACHINE_X1 = 250.0, 770.0
ICEMAKER_X0, ICEMAKER_X1 = 30.0, 210.0

# Depths. Everything the viewBox pins down sits at 0; the rest is behind it.
D_FRONT = 0.0
D_BODY_BACK = 230.0
D_PANEL = -7.0             # white side panels stand slightly proud
D_RECESS = 96.0            # back wall of the cup station
D_HOLDOUT = -60.0          # holdout planes, comfortably in front of the glass

# The two alcoves, cut clean through the fronts they sit in.
CUP_ALCOVE = (414.0, 354.0, 606.0, 480.0)
ICE_ALCOVE = (76.0, 258.0, 164.0, 330.0)


# -------------------------------------------------------------- utilities --

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            block.remove(item)


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def link(ob, col):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    col.objects.link(ob)
    return ob


def set_input(bsdf, name, value):
    """Principled inputs were renamed in 4.x; try each spelling we might meet."""
    aliases = {
        "Specular": ("Specular IOR Level", "Specular"),
        "Transmission": ("Transmission Weight", "Transmission"),
        "Sheen": ("Sheen Weight", "Sheen"),
        "Clearcoat": ("Coat Weight", "Clearcoat"),
        "ClearcoatRoughness": ("Coat Roughness", "Clearcoat Roughness"),
        "Emission": ("Emission Color", "Emission"),
    }
    for key in aliases.get(name, (name,)):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value
            return True
    return False


def material(name, base, rough=0.4, metal=0.0, coat=0.0, transmission=0.0,
             ior=1.45, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    set_input(bsdf, "Base Color", (*base, 1.0))
    set_input(bsdf, "Roughness", rough)
    set_input(bsdf, "Metallic", metal)
    set_input(bsdf, "IOR", ior)
    if coat:
        set_input(bsdf, "Clearcoat", coat)
        set_input(bsdf, "ClearcoatRoughness", 0.06)
    if transmission:
        set_input(bsdf, "Transmission", transmission)
    if emission:
        set_input(bsdf, "Emission", (*emission, 1.0))
        set_input(bsdf, "Emission Strength", emission_strength)
    return mat


def brushed(mat, scale=90.0, amount=0.16):
    """Stretch a noise across the roughness so steel catches a streaky highlight."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 2.0
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.05, 1.0, 1.0)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    base_rough = bsdf.inputs["Roughness"].default_value
    ramp.color_ramp.elements[0].color = (max(0.02, base_rough - amount),) * 3 + (1,)
    ramp.color_ramp.elements[1].color = (min(0.95, base_rough + amount),) * 3 + (1,)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
    return mat


def grainy(mat, scale=260.0, strength=0.35):
    """A little bump so powder does not read as a moulded plastic block."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 6.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def shade(ob, smooth):
    """Blender 4.1 dropped auto-smooth, so intent is stated per object instead.

    Boxes stay flat: their bevels are the highlight, and faceting them keeps the
    chamfers crisp. Anything turned — beans, nozzles, the cup — goes smooth.
    """
    for poly in ob.data.polygons:
        poly.use_smooth = smooth
    return ob


def box(name, vx0, vy0, vx1, vy1, y0, y1, mat=None, bevel=2.0, col=None,
        segments=3):
    """A box given by its front face in viewBox coordinates and a depth range."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((vx1 - vx0, y1 - y0, z_of(vy0) - z_of(vy1))),
                    verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(((vx0 + vx1) / 2, (y0 + y1) / 2,
                                        (z_of(vy0) + z_of(vy1)) / 2)),
                        verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges),
                        offset=bevel, segments=segments, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    shade(ob, False)
    return ob


def cylinder(name, cx, cy_vb, radius, y0, y1, mat=None, col=None, axis="Y",
             verts=40, length=None):
    """A cylinder centred on a viewBox point.

    `axis` says which way it lies: Y points at the viewer (a nozzle seen
    end-on), Z stands it up (a steam wand), X lays it across (a cup handle).
    """
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    depth = length if length is not None else (y1 - y0)
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=radius, radius2=radius, depth=depth)
    if axis == "Y":
        bmesh.ops.rotate(bm, matrix=Matrix.Rotation(math.radians(90), 3, "X"),
                         verts=bm.verts)
    elif axis == "X":
        bmesh.ops.rotate(bm, matrix=Matrix.Rotation(math.radians(90), 3, "Y"),
                         verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((cx, (y0 + y1) / 2, z_of(cy_vb))),
                        verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    shade(ob, True)
    return ob


def torus(name, cx, cy_vb, depth, major, minor, mat=None, col=None,
          major_segments=28, minor_segments=10):
    """A ring standing in the image plane — the cup's handle.

    bmesh has no torus primitive, so the tube is swept by hand. A straight bar
    read as a stick rather than a handle at this size, and the handle is one of
    the few cues that says "cup" and not "beaker".
    """
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    cz = z_of(cy_vb)
    rings = []
    for i in range(major_segments):
        t = math.tau * i / major_segments
        ct, st = math.cos(t), math.sin(t)
        px, pz = cx + major * ct, cz + major * st
        ring = []
        for j in range(minor_segments):
            u = math.tau * j / minor_segments
            cu, su = math.cos(u), math.sin(u)
            ring.append(bm.verts.new((px + ct * minor * cu,
                                      depth + minor * su,
                                      pz + st * minor * cu)))
        rings.append(ring)
    bm.verts.ensure_lookup_table()
    for i in range(major_segments):
        a, b = rings[i], rings[(i + 1) % major_segments]
        for j in range(minor_segments):
            k = (j + 1) % minor_segments
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    shade(ob, True)
    return ob


def frame_box(name, outer, inner, y0, y1, mat=None, col=None, bevel=1.8):
    """A rectangular picture frame, front face in viewBox coordinates.

    Built as one solid rather than four butted boxes: butting beveled boxes
    leaves a rounded notch at every corner, and those notches are transparent
    holes in a render whose whole job is to have holes exactly where the SVG
    expects them.
    """
    ox0, oy0, ox1, oy1 = outer
    ix0, iy0, ix1, iy1 = inner
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    ring_o = [(ox0, oy0), (ox1, oy0), (ox1, oy1), (ox0, oy1)]
    ring_i = [(ix0, iy0), (ix1, iy0), (ix1, iy1), (ix0, iy1)]
    ov = [bm.verts.new((x, y0, z_of(y))) for x, y in ring_o]
    iv = [bm.verts.new((x, y0, z_of(y))) for x, y in ring_i]
    bm.verts.ensure_lookup_table()
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((ov[i], iv[i], iv[j], ov[j]))
    ret = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces), use_keep_orig=True)
    moved = [v for v in ret["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0.0, y1 - y0, 0.0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=bevel,
                        segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    shade(ob, False)
    return ob


def rounded_plate(name, vx0, vy0, vx1, vy1, y0, y1, radius, mat=None, col=None):
    """A box with generously rounded edges — cabinet fronts, screen bezels."""
    return box(name, vx0, vy0, vx1, vy1, y0, y1, mat=mat, bevel=radius, col=col,
               segments=6)


# ------------------------------------------------------------- the palette --

def palette(theme):
    """Two sets of shell values, one story.

    The real machine is a near-black graphite. On a cream card that reads
    beautifully; on a dark card it turns into a hole. So the dark set lifts the
    shell and leans harder on rim light rather than inventing a different
    machine — the same trade the CSS tokens used to make, moved into the render.
    """
    if theme == "dark":
        return {
            "shell": (0.095, 0.102, 0.116),
            "shell_dark": (0.072, 0.078, 0.089),
            "panel": (0.760, 0.772, 0.790),
            "steel": (0.620, 0.640, 0.672),
            "chrome": (0.760, 0.782, 0.810),
            "screen": (0.0075, 0.0086, 0.0115),
            "plinth": (0.066, 0.072, 0.083),
            "recess": (0.034, 0.037, 0.045),
            "hopper_wall": (0.090, 0.097, 0.110),
            "rim": 12.0,
            "key": 1.70,
            "practical": 6.0,
            "ambient": 0.030,
        }
    return {
        "shell": (0.0295, 0.0320, 0.0365),
        "shell_dark": (0.0160, 0.0175, 0.0205),
        "panel": (0.845, 0.852, 0.864),
        "steel": (0.545, 0.562, 0.590),
        "chrome": (0.710, 0.730, 0.760),
        "screen": (0.0040, 0.0048, 0.0068),
        "plinth": (0.0190, 0.0205, 0.0240),
        "recess": (0.0115, 0.0125, 0.0150),
        "hopper_wall": (0.0245, 0.0265, 0.0305),
        "rim": 6.0,
        "key": 1.55,
        "practical": 5.0,
        "ambient": 0.010,
    }


def build_materials(theme):
    p = palette(theme)
    mats = {
        "shell": material("shell", p["shell"], rough=0.33, coat=0.45),
        "shell_dark": material("shell_dark", p["shell_dark"], rough=0.44),
        "panel": material("panel", p["panel"], rough=0.26, coat=0.35),
        "steel": brushed(material("steel", p["steel"], rough=0.29, metal=1.0)),
        "chrome": material("chrome", p["chrome"], rough=0.08, metal=1.0),
        "screen": material("screen", p["screen"], rough=0.055, coat=0.85),
        "plinth": material("plinth", p["plinth"], rough=0.55),
        "recess": material("recess", p["recess"], rough=0.70),
        "hopper_wall": material("hopper_wall", p["hopper_wall"], rough=0.30, coat=0.5),
        "rubber": material("rubber", (0.030, 0.032, 0.036), rough=0.85),
        "china": material("china", (0.945, 0.935, 0.915), rough=0.18, coat=0.55),
        # Contents keep their real colour in both themes: this is the part of
        # the picture that is reporting something, so the theme must not touch it.
        "beans": material("beans", (0.115, 0.047, 0.020), rough=0.28, coat=0.28),
        "cocoa": grainy(material("cocoa", (0.215, 0.095, 0.040), rough=0.94), scale=90.0, strength=0.7),
        "milk": grainy(material("milk", (0.930, 0.888, 0.800), rough=0.92), scale=90.0, strength=0.7),
        "ice": material("ice", (0.900, 0.948, 0.980), rough=0.17,
                        transmission=0.78, ior=1.31),
    }
    return mats, p


# ---------------------------------------------------------------- the body --

def build_machine(mats, col):
    """The drink machine: plinth, cabinet, white flanks, screen, spout, hoppers."""
    # Plinth. A short foot on purpose: the machine's overall height is fixed by
    # the frame, so every unit the base gives up is a unit the cup station gets,
    # and the cup needs the headroom more than the plinth does.
    box("plinth", MACHINE_X0 + 8, 486, MACHINE_X1 - 8, 522, 22, D_BODY_BACK,
        mat=mats["plinth"], bevel=4, col=col)

    # Cabinet. The front is a frame, not a slab: the cup station is a hole
    # through it, and the body behind supplies the alcove's back wall. Cutting
    # it this way is the only reason the cup is visible at all.
    frame_box("cabinet_front", (MACHINE_X0, 172, MACHINE_X1, 490),
              CUP_ALCOVE, D_FRONT, D_RECESS, mat=mats["shell"], col=col, bevel=7.0)
    box("cabinet_body", MACHINE_X0, 172, MACHINE_X1, 490, D_RECESS, D_BODY_BACK,
        mat=mats["recess"], bevel=2, col=col)
    box("deck", MACHINE_X0 - 6, 156, MACHINE_X1 + 6, 176, -6.0, D_BODY_BACK - 6,
        mat=mats["shell_dark"], bevel=4, col=col)

    # White side panels, standing proud of the black centre column — the detail
    # that makes the real unit recognisable across the room.
    for x0 in (256.0, 664.0):
        rounded_plate("panel", x0, 182, x0 + 100, 442, D_PANEL, 30,
                      7, mat=mats["panel"], col=col)
    for x0 in (358.0, 656.0):
        box("reveal", x0, 182, x0 + 6, 442, D_PANEL + 2, 18,
            mat=mats["steel"], bevel=1.5, col=col)

    # Touch display: a bezel standing proud, glass sunk into it, and the groove
    # under it that the real machine has between screen and dispense area.
    sx, sy, sw, sh = SCREEN
    rounded_plate("screen_bezel", sx - 14, sy - 14, sx + sw + 14, sy + sh + 16,
                  -14.0, 24.0, 6, mat=mats["shell_dark"], col=col)
    frame_box("screen_lip", (sx - 9, sy - 9, sx + sw + 9, sy + sh + 9),
              (sx - 2, sy - 2, sx + sw + 2, sy + sh + 2), -15.0, 4.0,
              mat=mats["chrome"], col=col, bevel=1.4)
    box("screen_glass", sx, sy, sx + sw, sy + sh, -9.0, 2.0,
        mat=mats["screen"], bevel=1.0, col=col)

    # The pair on the left flank: each is a black sleeve with a slim steel pipe
    # hanging out of it, and the two are not the same length — the shorter one
    # is the hot-water outlet. They stand well clear of the panel behind them,
    # which is what gives them their own shadow instead of reading as decals.
    for cx, tube_bottom, tip in ((290.0, 352.0, True), (322.0, 322.0, False)):
        cylinder("wand_collar", cx, 195, 12.2, -32.0, -8.0, mat=mats["shell_dark"],
                 col=col, axis="Z", length=10)
        cylinder("wand_sleeve", cx, 231, 11.0, -31.0, -9.0, mat=mats["shell_dark"],
                 col=col, axis="Z", length=64)
        cylinder("wand_pipe", cx, (263.0 + tube_bottom) / 2, 3.6, -23.6, -16.4,
                 mat=mats["chrome"], col=col, axis="Z", length=tube_bottom - 263.0)
        if tip:
            cylinder("wand_tip", cx, tube_bottom - 5, 4.8, -24.8, -15.2,
                     mat=mats["chrome"], col=col, axis="Z", length=12)

    # The dispense head hangs from the top of the alcove and the nozzles stop
    # clear of the cup's rim — the whole point of the taller alcove. Anything
    # lower and the cup reads as standing behind the spout rather than under it.
    box("spout_head", 468, 354, 552, 388, -34.0, 26.0, mat=mats["shell_dark"],
        bevel=5, col=col)
    for cx in (496.0, 524.0):
        cylinder("nozzle", cx, 396, 5.2, -30.0, -18.0, mat=mats["chrome"],
                 col=col, axis="Z", length=16)

    # Drip tray: a steel lid with slots, the machine's other bright metal.
    box("tray", 416, 458, 604, 480, -24.0, 80.0, mat=mats["steel"], bevel=2.5,
        col=col)
    for i in range(11):
        gx = 428.0 + i * 15.5
        box("slot", gx, 462, gx + 5, 476, -26.0, -18.0, mat=mats["shell_dark"],
            bevel=0.8, col=col)

    build_cup(mats, col)

    for key in ("coffeeBeans", "cocoaPowder", "milkPowder"):
        build_hopper(mats, col, *WINDOWS[key])


def build_hopper(mats, col, wx, wy, ww, wh):
    """A canister on the top deck: glass frame, steel cap, collar into the lid."""
    m = 12.0
    x0, x1 = wx - m, wx + ww + m
    y0, y1 = wy - m, wy + wh + m
    frame_box("hopper_glass", (x0, y0, x1, y1), (wx, wy, wx + ww, wy + wh),
              8.0, 150.0, mat=mats["hopper_wall"], col=col, bevel=2.4)
    box("hopper_collar", x0 - 4, y1 - 4, x1 + 4, y1 + 14, 6.0, 154.0,
        mat=mats["shell_dark"], bevel=3, col=col)
    box("hopper_cap", x0 - 3, y0 - 20, x1 + 3, y0 + 2, 2.0, 158.0,
        mat=mats["steel"], bevel=5, col=col)
    cylinder("hopper_knob", (x0 + x1) / 2, y0 - 26, 9.0, 60.0, 96.0,
             mat=mats["chrome"], col=col, axis="Z", length=14)


def build_cup(mats, col):
    """A white china cup on the grate: without it nothing gives the drawing scale."""
    me = bpy.data.meshes.new("cup")
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=56,
                          radius1=25.0, radius2=30.0, depth=50.0)
    bmesh.ops.translate(bm, vec=Vector((510.0, 28.0, z_of(437.0))), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("cup", me)
    col.objects.link(ob)
    ob.data.materials.append(mats["china"])
    shade(ob, True)
    # The handle's inner half disappears into the cup wall, which is what makes
    # it read as attached rather than parked alongside.
    handle = torus("cup_handle", 544.0, 432.0, 28.0, 15.0, 3.6,
                   mat=mats["china"], col=col)
    return ob, handle


def build_ice_maker(mats, col):
    """The ice maker standing to the machine's left, as it does in the room."""
    wx, wy, ww, wh = WINDOWS["ice"]
    # Same trick as the cabinet: the dispenser is a hole, so the front and the
    # steel door are frames and the body behind them is the alcove.
    frame_box("ice_front", (ICEMAKER_X0, 214, ICEMAKER_X1, 522), ICE_ALCOVE,
              D_FRONT + 10, D_RECESS - 12, mat=mats["shell_dark"], col=col,
              bevel=7.0)
    box("ice_body", ICEMAKER_X0, 214, ICEMAKER_X1, 522, D_RECESS - 12,
        D_BODY_BACK + 14, mat=mats["recess"], bevel=2, col=col)
    frame_box("ice_door", (40, 226, 200, 508), ICE_ALCOVE, 2.0, 14.0,
              mat=mats["steel"], col=col, bevel=2.0)
    box("ice_handle", 52, 240, 188, 250, -6.0, 4.0, mat=mats["chrome"],
        bevel=3, col=col)

    # Bin above, with the window in its face and a steel cap over it.
    frame_box("bin_glass", (32, wy - 16, 208, wy + wh + 18),
              (wx, wy, wx + ww, wy + wh), 8.0, 162.0,
              mat=mats["hopper_wall"], col=col, bevel=2.6)
    box("bin_cap", 28, 50, 212, 72, 2.0, 168.0, mat=mats["steel"], bevel=5,
        col=col)
    box("bin_base", 30, wy + wh + 14, 210, 218, 6.0, 168.0,
        mat=mats["shell_dark"], bevel=4, col=col)

    box("disp_paddle", 94, 272, 146, 310, 46.0, 60.0, mat=mats["rubber"],
        bevel=3, col=col)
    box("ice_tray", 60, 442, 180, 466, -16.0, 56.0, mat=mats["steel"],
        bevel=2.5, col=col)
    for i in range(7):
        gx = 70.0 + i * 15.5
        box("ice_slot", gx, 446, gx + 5, 462, -18.0, -10.0,
            mat=mats["shell_dark"], bevel=0.8, col=col)


# ------------------------------------------------------------- the contents --
# Rendered on their own, filling every window to the brim. The SVG slides this
# image down behind the body frame, so what matters is that the *surface* sits
# just under the top of the window and that material continues well past the
# bottom: at 40% the surface has to land at 40%, and nothing may run out below.

CONTENT_OVERHANG = 14.0     # how far past the window the material spreads
CONTENT_SURFACE = 1.0       # viewBox units of headroom above the heap at 100%
CONTENT_DEPTH = (8.0, 44.0)


def content_bounds(key):
    wx, wy, ww, wh = WINDOWS[key]
    return (wx - CONTENT_OVERHANG, wy + CONTENT_SURFACE,
            wx + ww + CONTENT_OVERHANG, wy + wh + 34.0)


def heaped_block(name, key, mat, col, bumps=6.0, seed=1):
    """A solid of powder with a gently uneven crest — cocoa and milk.

    Built from a subdivided cube rather than an extruded surface so it stays a
    closed solid: the front face is all anyone sees, but an open shell would
    leak the background through the crest.
    """
    x0, y0, x1, y1 = content_bounds(key)
    d0, d1 = CONTENT_DEPTH
    rng = random.Random(seed)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=7, use_grid_fill=True)
    z_top, z_bottom = z_of(y0), z_of(y1)
    for v in bm.verts:
        u, w, t = v.co.x + 0.5, v.co.y + 0.5, v.co.z + 0.5
        v.co.x = x0 + u * (x1 - x0)
        v.co.y = d0 + w * (d1 - d0)
        v.co.z = z_bottom + t * (z_top - z_bottom)
    crest = z_top - 0.001 * (z_top - z_bottom)
    for v in bm.verts:
        if v.co.z >= crest - 0.5:
            u = (v.co.x - x0) / max(1.0, x1 - x0)
            w = (v.co.y - d0) / max(1.0, d1 - d0)
            wave = 0.5 + 0.28 * math.sin(u * 9.3 + seed) + 0.22 * math.sin(w * 5.1 + seed * 2)
            # Powder poured through a funnel piles up in the middle, so the
            # crest is a mound, not a lid: that is what makes it read as loose
            # material rather than a moulded block.
            dome = 1.0 - 0.82 * (1.0 - ((u - 0.5) * 2.0) ** 2)
            v.co.z -= bumps * (0.35 + 0.65 * wave) * dome + rng.uniform(0.0, bumps * 0.18)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.data.materials.append(mat)
    shade(ob, False)
    return ob


def bean_mesh(mats):
    """One coffee bean: an ellipsoid with the crease pressed into its face."""
    me = bpy.data.meshes.new("bean")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)
    for v in bm.verts:
        v.co.x *= 6.2
        v.co.y *= 4.4
        v.co.z *= 4.9
    for v in bm.verts:
        if v.co.y < 0:
            groove = max(0.0, 1.0 - (v.co.x / 4.4) ** 2)
            v.co.y += groove * 3.2 * (1.0 - abs(v.co.z) / 6.0)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mats["beans"])
    for poly in me.polygons:
        poly.use_smooth = True
    return me


def cube_mesh(mats):
    """One ice cube: a rounded, slightly irregular block."""
    me = bpy.data.meshes.new("cube")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=20.0)
    bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=3.4,
                    segments=4, profile=0.5, affect="EDGES", clamp_overlap=True)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mats["ice"])
    for poly in me.polygons:
        poly.use_smooth = True
    return me


def scatter(name, proto, key, col, spacing, jitter, seed, scale_range=(0.85, 1.15)):
    """Pack instances of one mesh into a window. Instances, so Cycles shares it."""
    x0, y0, x1, y1 = content_bounds(key)
    rng = random.Random(seed)
    made = 0
    sx, sz, sy = spacing
    z_top, z_bottom = z_of(y0), z_of(y1)
    depth0, depth1 = CONTENT_DEPTH
    z = z_top
    row = 0
    while z > z_bottom - sz:
        # Stagger every other row so the pack does not read as a grid.
        offset = (sx / 2.0) if row % 2 else 0.0
        x = x0 + offset
        while x < x1:
            y = depth0
            while y < depth1:
                ob = bpy.data.objects.new(name, proto)
                col.objects.link(ob)
                s = rng.uniform(*scale_range)
                ob.location = (x + rng.uniform(-jitter, jitter),
                               y + rng.uniform(-jitter, jitter),
                               z + rng.uniform(-jitter, jitter))
                ob.rotation_euler = (rng.uniform(0, math.tau),
                                     rng.uniform(0, math.tau),
                                     rng.uniform(0, math.tau))
                ob.scale = (s, s, s)
                made += 1
                y += sy
            x += sx
        z -= sz
        row += 1
    return made


def build_contents(mats, col):
    beans = bean_mesh(mats)
    cubes = cube_mesh(mats)
    n = scatter("bean", beans, "coffeeBeans", col, spacing=(10.0, 7.6, 15.0),
                jitter=2.2, seed=7)
    n += scatter("cube", cubes, "ice", col, spacing=(24.0, 21.0, 26.0),
                 jitter=3.4, seed=11, scale_range=(0.8, 1.2))
    heaped_block("cocoa_heap", "cocoaPowder", mats["cocoa"], col, bumps=26.0, seed=3)
    heaped_block("milk_heap", "milkPowder", mats["milk"], col, bumps=22.0, seed=5)
    return n


# -------------------------------------------------------------- the holdout --

def build_holdouts(col):
    """Punch the windows out of the body render.

    The planes sit in front of the glass and are shrunk toward the camera by
    `vb_to_world`, so they cover exactly the viewBox rectangle the SVG will
    clip against — no more, no less.
    """
    made = []
    for key, (wx, wy, ww, wh) in WINDOWS.items():
        x0, _, z1 = vb_to_world(wx, wy, D_HOLDOUT)
        x1, _, z0 = vb_to_world(wx + ww, wy + wh, D_HOLDOUT)
        me = bpy.data.meshes.new("holdout_" + key)
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
        bmesh.ops.rotate(bm, matrix=Matrix.Rotation(math.radians(90), 3, "X"),
                         verts=bm.verts)
        bmesh.ops.scale(bm, vec=Vector(((x1 - x0) / 2, 1.0, (z1 - z0) / 2)),
                        verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector(((x0 + x1) / 2, D_HOLDOUT,
                                            (z0 + z1) / 2)), verts=bm.verts)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("holdout_" + key, me)
        col.objects.link(ob)
        ob.is_holdout = True
        made.append(ob)
    return made


# --------------------------------------------------------------- the light --

def emitter(name, col, centre, size, rotation, strength, colour=(1.0, 1.0, 1.0)):
    """A softbox as an emissive plane.

    Area lamps would need absurd wattages at this scene scale; an emissive
    plane's brightness depends on the solid angle it covers, which is exactly
    what we are choosing anyway. They also give the black shell the long
    rectangular highlights a product photo has. All of them sit outside the
    camera frustum, so they are never seen directly.
    """
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((size[0] / 2, size[1] / 2, 1.0)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    mat = material(name, (0, 0, 0), emission=colour, emission_strength=strength)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.location = centre
    ob.rotation_euler = rotation
    ob.visible_camera = False
    return ob


def build_lights(col, p):
    r = math.radians
    # Key: high and to the left, the classic product-shot position.
    emitter("key", col, (-620.0, -1500.0, 1150.0), (1500.0, 1500.0),
            (r(58), 0.0, r(-38)), p["key"])
    # Fill: lower, right, weaker — opens the shadow side without flattening it.
    emitter("fill", col, (1500.0, -1100.0, 300.0), (1400.0, 1400.0),
            (r(96), 0.0, r(62)), p["key"] * 0.34)
    # Overhead strip: a highlight along the top deck and the hopper caps.
    emitter("top", col, (420.0, -300.0, 1250.0), (1300.0, 1100.0),
            (r(180), 0.0, 0.0), p["key"] * 0.55)
    # Rim pair: the only reason a near-black machine keeps a silhouette. Dark
    # mode leans on these hard, which is why the palette scales them.
    emitter("rim_l", col, (-330.0, 420.0, 300.0), (900.0, 1400.0),
            (r(90), 0.0, r(-108)), p["rim"])
    emitter("rim_r", col, (1140.0, 420.0, 300.0), (900.0, 1400.0),
            (r(90), 0.0, r(108)), p["rim"] * 0.8)
    # Bounce card below the frame: lifts the undersides just enough to read.
    emitter("bounce", col, (400.0, -600.0, -260.0), (1600.0, 1400.0),
            (0.0, 0.0, 0.0), p["key"] * 0.16)
    emitter("screen_glare", col, (250.0, -2300.0, 1000.0), (900.0, 700.0),
            (r(128), 0.0, r(-10)), p["key"] * 1.6)
    # Practicals raking into the two recesses. Physically these are cheats — a
    # real alcove that deep is a black hole — but the cup under the spout is
    # what gives the picture its scale. They sit far back and wide, outside the
    # frustum: the frustum narrows toward the camera, so a panel that close in
    # would stand between the lens and the machine and swallow the cup.
    emitter("practical_cup", col, (770.0, -1900.0, 300.0), (620.0, 520.0),
            (r(90), 0.0, r(190)), p["practical"])
    emitter("practical_ice", col, (40.0, -1900.0, 330.0), (480.0, 420.0),
            (r(90), 0.0, r(172)), p["practical"] * 0.8)


# -------------------------------------------------------------- the render --

def setup_scene(theme, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.004
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.seed = 4
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
        scene.cycles.use_denoising = True
        denoised = True
    except Exception:
        # Distro builds ship Cycles without OpenImageDenoise; pay in samples.
        scene.cycles.use_denoising = False
        scene.cycles.samples = max(samples, 900)
        denoised = False

    scene.render.resolution_x = RES_X
    scene.render.resolution_y = RES_Y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    if hasattr(scene.render, "filter_width"):
        scene.render.filter_width = 1.3
    else:
        scene.cycles.filter_width = 1.3
    # Standard, not AgX: the shell values are chosen for the card they land on,
    # and a filmic curve would quietly re-grade them.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.display_settings.display_device = "sRGB"

    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    amb = palette(theme)["ambient"]
    world.node_tree.nodes["Background"].inputs[0].default_value = (amb, amb, amb * 1.08, 1.0)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "PERSP"
    cam_data.lens = CAM_FOCAL
    cam_data.sensor_width = CAM_SENSOR
    cam_data.sensor_fit = "HORIZONTAL"
    cam_data.shift_y = CAM_SHIFT_Y
    # The scene is 800 units wide and the camera stands 3000 back, so the
    # default 0.1..100 clip range would leave the frame empty.
    cam_data.clip_start = 500.0
    cam_data.clip_end = 6000.0
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = CAM_POS
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    scene.camera = cam
    return scene, denoised


def build(theme, samples):
    clear_scene()
    scene, denoised = setup_scene(theme, samples)
    mats, p = build_materials(theme)
    body = collection("body")
    contents = collection("contents")
    holdout = collection("holdout")
    lights = collection("lights")
    build_machine(mats, body)
    build_ice_maker(mats, body)
    build_contents(mats, contents)
    build_holdouts(holdout)
    build_lights(lights, p)
    return scene, denoised


def projected_rect(scene, vx, vy, ww, wh, depth=D_FRONT):
    """Where a viewBox rectangle actually lands, straight from the camera."""
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()   # the camera matrix is stale until this runs
    cam = scene.camera
    xs, ys = [], []
    for cx, cy in ((vx, vy), (vx + ww, vy), (vx, vy + wh), (vx + ww, vy + wh)):
        co = Vector((cx, depth, z_of(cy)))
        uv = world_to_camera_view(scene, cam, co)
        xs.append(uv.x * VIEW_W)
        ys.append((1.0 - uv.y) * VIEW_H)
    return (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


def write_layout(scene, path):
    """The single source of truth the component reads back."""
    def rect(vx, vy, ww, wh):
        px, py, pw, ph = projected_rect(scene, vx, vy, ww, wh)
        for got, want in ((px, vx), (py, vy), (pw, ww), (ph, wh)):
            if abs(got - want) > 0.05:
                raise SystemExit(
                    "camera does not put %r where the viewBox says: %r" %
                    ((vx, vy, ww, wh), (px, py, pw, ph)))
        return {"x": round(vx, 2), "y": round(vy, 2),
                "width": round(ww, 2), "height": round(wh, 2)}

    layout = {
        "_comment": "Generated by tools/blender/wmf1100s.py — do not edit by hand.",
        "viewBox": {"width": VIEW_W, "height": VIEW_H},
        "render": {"width": RES_X, "height": RES_Y, "scale": PX_PER_UNIT},
        "windows": {k: rect(*v) for k, v in WINDOWS.items()},
        "screen": rect(*SCREEN),
        "iceGlyph": {"x": ICE_GLYPH[0], "y": ICE_GLYPH[1]},
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(layout, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return layout


def check_alpha(png_path):
    """The holes have to be where layout.json says, or the SVG will not line up."""
    import numpy as np
    img = bpy.data.images.load(png_path)
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    alpha = buf.reshape(h, w, 4)[::-1, :, 3]   # Blender hands them back bottom-up
    bpy.data.images.remove(img)

    problems = []
    for key, (vx, vy, ww, wh) in WINDOWS.items():
        x0, y0 = round(vx * PX_PER_UNIT), round(vy * PX_PER_UNIT)
        x1, y1 = round((vx + ww) * PX_PER_UNIT), round((vy + wh) * PX_PER_UNIT)
        inner = alpha[y0 + 3:y1 - 3, x0 + 3:x1 - 3]
        if inner.max() > 0.5:
            problems.append("%s: window is not fully punched out (max alpha %.2f)"
                            % (key, inner.max()))
        # Check four bands, not a full ring: the frame's outer corners are
        # rounded on purpose, and a ring would read that chamfer as a leak.
        pad, inset = 10, 14
        bands = {
            "above": alpha[y0 - pad:y0 - 2, x0 + inset:x1 - inset],
            "below": alpha[y1 + 2:y1 + pad, x0 + inset:x1 - inset],
            "left": alpha[y0 + inset:y1 - inset, x0 - pad:x0 - 2],
            "right": alpha[y0 + inset:y1 - inset, x1 + 2:x1 + pad],
        }
        for side, band in bands.items():
            if band.size and band.min() < 0.9:
                problems.append("%s: the frame %s the window is not solid "
                                "(min alpha %.2f)" % (key, side, band.min()))
        ring = alpha[y0 - pad:y1 + pad, x0 - pad:x1 + pad]
        ys, xs = np.where(ring < 0.5)
        if len(xs) == 0:
            problems.append("%s: no hole found at all" % key)
            continue
        got = (x0 - pad + xs.min(), y0 - pad + ys.min(),
               x0 - pad + xs.max() + 1, y0 - pad + ys.max() + 1)
        want = (x0, y0, x1, y1)
        if max(abs(a - b) for a, b in zip(got, want)) > 1:
            problems.append("%s: hole at %r, layout.json says %r" % (key, got, want))
    return problems


def render_variant(scene, theme, out_dir, png_dir, denoised, check=True):
    """Render once, then write both the PNG master and the WebP the site ships."""
    contents = bpy.data.collections["contents"]
    body = bpy.data.collections["body"]
    holdout = bpy.data.collections["holdout"]
    if theme == "contents":
        body.hide_render = True
        holdout.hide_render = True
        contents.hide_render = False
    else:
        body.hide_render = False
        holdout.hide_render = False
        # The body render must not see the contents through its own holes.
        contents.hide_render = True

    name = "wmf1100s-%s" % theme
    png_path = os.path.join(png_dir, name + ".png")
    webp_path = os.path.join(out_dir, name + ".webp")
    os.makedirs(png_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    print("[render] %s  %dx%d  samples=%d  denoise=%s"
          % (theme, RES_X, RES_Y, scene.cycles.samples, denoised))
    bpy.ops.render.render(write_still=False)
    result = bpy.data.images["Render Result"]

    st = scene.render.image_settings
    st.file_format = "PNG"
    st.color_mode = "RGBA"
    st.color_depth = "8"
    st.compression = 92
    result.save_render(png_path, scene=scene)

    st.file_format = "WEBP"
    st.color_mode = "RGBA"
    st.quality = 88
    result.save_render(webp_path, scene=scene)

    if check and theme != "contents":
        problems = check_alpha(png_path)
        for line in problems:
            print("[check] FAIL %s" % line)
        if problems:
            raise SystemExit("holdout check failed for %s" % theme)
        print("[check] %s: all four windows land on layout.json" % theme)

    print("[wrote] %s (%d B)  %s (%d B)"
          % (png_path, os.path.getsize(png_path),
             webp_path, os.path.getsize(webp_path)))
    return webp_path


# ------------------------------------------------------------------- main --

def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    elif os.path.basename(argv[0]).startswith("blender"):
        argv = []
    else:
        argv = argv[1:]
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", ".."))
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--theme", default="all",
                    choices=["light", "dark", "contents", "all"])
    ap.add_argument("--samples", type=int, default=160)
    ap.add_argument("--out", default=os.path.join(repo, "src", "assets", "machine"))
    ap.add_argument("--png-dir", default=os.path.join(here, "out"))
    ap.add_argument("--blend", default=os.path.join(here, "wmf1100s.blend"))
    ap.add_argument("--no-check", action="store_true")
    ap.add_argument("--no-blend", action="store_true")
    return ap.parse_args(argv)


def main():
    args = parse_args()
    themes = ["light", "dark", "contents"] if args.theme == "all" else [args.theme]
    for theme in themes:
        # `contents` is theme-independent, but it still needs a scene to live in.
        scene, denoised = build("light" if theme == "contents" else theme,
                                args.samples)
        layout = write_layout(scene, os.path.join(args.out, "layout.json"))
        if theme == themes[0]:
            print("[layout] %s" % json.dumps(layout["windows"], ensure_ascii=False))
        render_variant(scene, theme, args.out, args.png_dir, denoised,
                       check=not args.no_check)
        if theme == "light" and not args.no_blend:
            bpy.ops.wm.save_as_mainfile(filepath=args.blend, compress=True)
            print("[wrote] %s (%d B)" % (args.blend, os.path.getsize(args.blend)))


if __name__ == "__main__":
    main()
