#!/usr/bin/env python3
"""Balisong-style (butterfly-knife) holder for a Clipper lighter.

Generates three printable parts (carrier + two handles) as STL files, a
preview image, and checks that the handles swing through 180 degrees without
hitting the carrier or the lighter.

    pip install manifold3d trimesh numpy matplotlib
    python3 generate.py

All dimensions are millimetres. Model axes: Y runs along the lighter, the
pivot screws run along Z, and the two handles sit side by side along X.
"""
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import CrossSection, Manifold

# ----------------------------------------------------------------- parameters
LIGHTER_D = 16.0       # Clipper Classic (CP11) body diameter - measure yours
LIGHTER_L = 74.0       # overall lighter length
FIT = 0.1              # added to the sleeve bore; the slit lets it spring open
SLEEVE_WALL = 1.8
SLEEVE_H = 48.0        # how much of the lighter body the sleeve grips
SLEEVE_FLOOR = 2.5
SLIT_W = 3.0           # slit that turns the sleeve into a spring clip

HANDLE_WALL = 2.0      # handle wall outside the lighter cavity
CLEAR = 0.4            # gap between sleeve and handle cavity
FACE_GAP = 0.15        # gap between the two handles where they meet
TANG_T = 11.0          # thickness of the pivot tang
TANG_CLEAR = 0.3       # gap each side between tang and handle cheeks
TANG_EDGE = 4.2        # tang material around each pivot hole
SLEEVE_Y = 12.0        # sleeve starts this far above the pivot line
CHAMFER = 4.0          # chamfer on the outer back edges of the handles
TIP_R = 3.0            # corner radius at the handle tip
TIP_BLOCK = 9.5        # solid block past the lighter top (holds magnets)

SCREW_D = 3.4          # M3 clearance hole
SCREW_LEN = 20.0       # M3 x 20 pivot screws
HEAD_D = 6.2           # M3 cap head pocket
NUT_AF = 5.8           # M3 nut across flats + clearance
MAGNET_D = 6.2         # 6 x 3 mm disc magnets (set MAGNETS = False to skip)
MAGNET_H = 3.2
MAGNETS = True

SEG = 96
OUT = Path(__file__).parent

# -------------------------------------------------------------------- derived
R_SLEEVE = LIGHTER_D / 2 + FIT / 2 + SLEEVE_WALL
R_CAV = R_SLEEVE + CLEAR
HALF_T = R_CAV + HANDLE_WALL            # half thickness (Z) of the holder
PX = HALF_T / 2                         # pivot offset from the centre line
R_END = PX - FACE_GAP                   # rounded pivot end of each handle
LIGHTER_Y0 = SLEEVE_Y + SLEEVE_FLOOR
LIGHTER_Y1 = LIGHTER_Y0 + LIGHTER_L
CAV_Y1 = LIGHTER_Y1 + 1.0
HANDLE_L = CAV_Y1 + TIP_BLOCK
# lowest point of the lighter cavity: low enough that the cheeks swing under
# the sleeve floor without touching it
CAV_Y0 = np.floor(np.sqrt(SLEEVE_Y**2 - R_END**2) * 2) / 2 - 0.5
TANG_HALF_W = PX + TANG_EDGE
SLOT_Y1 = np.hypot(TANG_HALF_W - PX, SLEEVE_Y) + 0.5   # tang corner swing
RECESS = (2 * HALF_T - (SCREW_LEN - 2.5)) / 2          # head / nut pockets


# -------------------------------------------------------------------- helpers
def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def cyl_z(r, z0, z1, cx=0.0, cy=0.0, seg=SEG):
    return Manifold.cylinder(z1 - z0, r, r, seg).translate([cx, cy, z0])


def cyl_y(r, y0, y1, cx=0.0, cz=0.0, seg=SEG):
    c = Manifold.cylinder(y1 - y0, r, r, seg).rotate([-90, 0, 0])
    return c.translate([cx, y0, cz])


def cyl_x(r, x0, x1, cy=0.0, cz=0.0, seg=SEG):
    c = Manifold.cylinder(x1 - x0, r, r, seg).rotate([0, 90, 0])
    return c.translate([x0, cy, cz])


def hull_xy(circles, z0, z1):
    """Extrude (along Z) the convex hull of circles given as (x, y, r)."""
    parts = [CrossSection.circle(max(r, 1e-3), SEG).translate([x, y])
             for x, y, r in circles]
    return Manifold.extrude(CrossSection.batch_hull(parts), z1 - z0).translate([0, 0, z0])


# ---------------------------------------------------------------------- parts
def carrier():
    tang = hull_xy([(-PX, 0, TANG_EDGE), (PX, 0, TANG_EDGE),
                    (-TANG_HALF_W, SLEEVE_Y, 0), (TANG_HALF_W, SLEEVE_Y, 0)],
                   -TANG_T / 2, TANG_T / 2)
    top = LIGHTER_Y0 + SLEEVE_H
    sleeve = cyl_y(R_SLEEVE, SLEEVE_Y, top)
    body = tang + sleeve
    body -= cyl_y(LIGHTER_D / 2 + FIT / 2, LIGHTER_Y0, top + 1)
    body -= box(-SLIT_W / 2, SLIT_W / 2, LIGHTER_Y0, top + 1, 0, R_SLEEVE + 1)
    for sx in (-PX, PX):
        body -= cyl_z(SCREW_D / 2, -TANG_T, TANG_T, sx, 0, 32)
    return body


def handle_right():
    x0, x1 = FACE_GAP, 2 * PX - FACE_GAP
    plan = hull_xy([(PX, 0, R_END),
                    (x0 + TIP_R, HANDLE_L - TIP_R, TIP_R),
                    (x1 - TIP_R, HANDLE_L - TIP_R, TIP_R)], -HALF_T, HALF_T)
    # chamfered section in the XZ plane, extruded along Y
    c = CHAMFER
    section = CrossSection([[(x0, -HALF_T), (x1 - c, -HALF_T), (x1, -HALF_T + c),
                             (x1, HALF_T - c), (x1 - c, HALF_T), (x0, HALF_T)]])
    prism = Manifold.extrude(section, HANDLE_L + R_END + 2)       # along +Z
    prism = prism.rotate([-90, 0, 0]).mirror([0, 0, 1]).translate([0, -R_END - 1, 0])
    body = plan ^ prism

    body -= cyl_y(R_CAV, CAV_Y0, CAV_Y1)                          # lighter cavity
    slot = TANG_T / 2 + TANG_CLEAR
    body -= box(-1, 2 * PX + 1, -R_END - 2, SLOT_Y1, -slot, slot)  # tang slot
    body -= cyl_z(SCREW_D / 2, -HALF_T - 1, HALF_T + 1, PX, 0, 32)
    body -= cyl_z(HEAD_D / 2, HALF_T - RECESS, HALF_T + 1, PX, 0, 48)
    body -= cyl_z(NUT_AF / np.sqrt(3), -HALF_T - 1, -HALF_T + RECESS, PX, 0, 6)
    if MAGNETS:
        my = CAV_Y1 + (TIP_BLOCK - TIP_R * 0.3) / 2
        body -= cyl_x(MAGNET_D / 2, x0 - 1, x0 + MAGNET_H, my, 0, 48)
        body -= cyl_x(MAGNET_D / 2, x1 - MAGNET_H, x1 + 1, my, 0, 48)
    return body


def lighter():
    return cyl_y(LIGHTER_D / 2, LIGHTER_Y0, LIGHTER_Y1)


def swing(handle, deg, side=1):
    """Rotate a handle about its pivot; 0 = closed, 180 = fully open."""
    return (handle.translate([-side * PX, 0, 0])
                  .rotate([0, 0, -side * deg])
                  .translate([side * PX, 0, 0]))


# --------------------------------------------------------------------- output
def to_trimesh(m):
    mesh = m.to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3],
                           np.asarray(mesh.tri_verts), process=False)


def export(m, name):
    """Drop a part onto the bed (z = 0), centre it, and write an STL."""
    lo, hi = np.array(m.bounding_box()).reshape(2, 3)
    m = m.translate([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
    tm = to_trimesh(m)
    assert tm.is_watertight, name
    (OUT / "stl").mkdir(exist_ok=True)
    tm.export(OUT / "stl" / name)
    size = hi - lo
    print(f"  {name:22s} {size[0]:6.1f} x {size[1]:6.1f} x {size[2]:6.1f} mm"
          f"   {m.volume() / 1000:5.1f} cm3")


def check_clearance(car, hr):
    fixed = car + lighter()
    worst = 0.0
    for deg in range(0, 181, 2):
        worst = max(worst, (fixed ^ swing(hr, deg)).volume())
    return worst


def preview(car, hr, hl):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    fig = plt.figure(figsize=(15, 7.5), dpi=130)
    poses = [("Closed", 0, 0), ("Mid-flip", 60, 135), ("Open", 180, 180)]
    for i, (title, a_r, a_l) in enumerate(poses):
        ax = fig.add_subplot(1, 3, i + 1, projection="3d")
        items = [(car, "#f2c230"), (lighter(), "#d9d9d9"),
                 (swing(hr, a_r, 1), "#1f6fd0"), (swing(hl, a_l, -1), "#e0483e")]
        for m, colour in items:
            tm = to_trimesh(m)
            tris = tm.vertices[tm.faces][:, :, [0, 2, 1]]       # Y up on screen
            shade = 0.55 + 0.45 * np.abs(tm.face_normals @ np.array([0.4, 0.5, 0.77]))
            rgb = np.array(matplotlib.colors.to_rgb(colour))
            ax.add_collection3d(Poly3DCollection(
                tris, facecolors=np.clip(shade[:, None] * rgb, 0, 1), edgecolors="none"))
        ax.set_xlim(-110, 110); ax.set_ylim(-65, 65); ax.set_zlim(-110, 110)
        ax.set_box_aspect((220, 130, 220))
        ax.view_init(elev=18, azim=-62)
        ax.set_axis_off()
        ax.set_title(title, fontsize=15)
    fig.subplots_adjust(left=0, right=1, bottom=0, top=0.94, wspace=-0.1)
    fig.savefig(OUT / "preview.png")


def main():
    car, hr = carrier(), handle_right()
    hl = hr.mirror([1, 0, 0])

    print(f"Holder closed: {4 * PX:.1f} x {2 * HALF_T:.1f} x {HANDLE_L + R_END:.1f} mm")
    print(f"Pivot screws:  2x M3 x {SCREW_LEN:.0f} + 2x M3 nut "
          f"(pockets {RECESS:.2f} mm deep)")
    worst = check_clearance(car, hr)
    print(f"Swing check:   worst overlap {worst:.4f} mm3 over 0-180 deg")
    assert worst < 1e-6, "handle collides with carrier or lighter"

    print("Parts (print orientation):")
    export(car.rotate([-90, 0, 0]), "carrier.stl")           # sleeve opening on the bed
    export(hr.rotate([0, 90, 0]), "handle_right.stl")        # back face on the bed
    export(hl.rotate([0, -90, 0]), "handle_left.stl")
    export(car + lighter() + hr + hl, "assembly_closed.stl")
    export(car + lighter() + swing(hr, 180, 1) + swing(hl, 180, -1), "assembly_open.stl")
    preview(car, hr, hl)


if __name__ == "__main__":
    main()
