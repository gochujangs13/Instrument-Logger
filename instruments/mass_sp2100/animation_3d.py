"""90deg Peel Tester 3D Animation Module (v6 - Semi-Transparent Platen)"""
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

# 고정 크기 상수
CLAMP_H = 3.5
GRIP_W = 3.8
GRIP_H = 0.8
ROD_LEN = 5.0
ROD_R = 0.15
TAPE_LEN = 8.0
N_ARC = 20
PLATE_W = 5.0
PLATE_THICK = 0.5

# 색상 팔레트
C_PLATE_TOP = '#dfe6e9'
C_PLATE_SIDE = '#95a5a6'
C_TAPE_BODY = '#0000FF'   # 순수 파랑
C_TAPE_TOP = '#1e90ff'    
C_TAPE_SIDE = '#00008b'   
C_CLAMP = '#2d3436'
C_ROD = '#636e72'
BG = '#1e293b'

def _face(ax, verts, color, alpha=1.0):
    poly = Poly3DCollection([verts], alpha=alpha)
    poly.set_facecolor(color)
    poly.set_edgecolor('black')
    poly.set_linewidth(0.4)
    ax.add_collection3d(poly)

def draw(ax, fig, progress=0.0, width_mm=25.0, thick_mm=2.0):
    ax.cla()
    ax.set_facecolor(BG)
    fig.patch.set_facecolor(BG)

    W = max(width_mm, 1.0)
    T = max(thick_mm, 0.1)
    ws = min(W / 50.0, 1.0) * 3.5   
    ts = min(T / 10.0, 1.0) * 1.5   
    
    peel_dist = TAPE_LEN * progress
    platen_x_off = -peel_dist
    
    tape_y0 = (PLATE_W - ws) / 2.0
    tape_y1 = tape_y0 + ws
    
    f = lambda v, c, a=1.0: _face(ax, v, c, a)

    # ── 1. 움직이는 바닥판 (Platen) ──
    # 투명하게 처리 (alpha=0.4)
    px0, px1 = platen_x_off - 1.0, platen_x_off + TAPE_LEN + 1.0
    pz_top, pz_bot = -0.1, -0.6
    
    # 상면 (투명)
    f([[px0, 0, pz_top], [px1, 0, pz_top], [px1, PLATE_W, pz_top], [px0, PLATE_W, pz_top]], C_PLATE_TOP, 0.4)
    # 전면/측면 (약간 투명)
    f([[px0, 0, pz_top], [px1, 0, pz_top], [px1, 0, pz_bot], [px0, 0, pz_bot]], C_PLATE_SIDE, 0.5)

    # ── 2. 바닥에 붙어 있는 테이프 (Attached Tape) ──
    tape_end_x = platen_x_off + TAPE_LEN
    if tape_end_x > 0:
        x0, x1 = 0.0, tape_end_x
        z0, z1 = 0.0, ts
        f([[x0, tape_y0, z0], [x1, tape_y0, z0], [x1, tape_y1, z0], [x0, tape_y1, z0]], C_TAPE_SIDE)
        f([[x0, tape_y0, z1], [x1, tape_y0, z1], [x1, tape_y1, z1], [x0, tape_y1, z1]], C_TAPE_TOP)
        f([[x0, tape_y0, z0], [x1, tape_y0, z0], [x1, tape_y0, z1], [x0, tape_y0, z1]], C_TAPE_BODY)
        f([[x1, tape_y0, z0], [x1, tape_y1, z0], [x1, tape_y1, z1], [x1, tape_y0, z1]], C_TAPE_BODY)

    # ── 3. 박리 곡선 및 수직 부분 ──
    r = max(ts * 1.5, 0.5)
    theta = np.linspace(0, np.pi/2, N_ARC)
    arc_x = - r * np.sin(theta)
    arc_z = ts + r - r * np.cos(theta)
    
    for yi in [tape_y0, tape_y1]:
        for i in range(len(arc_x)-1):
            f([[arc_x[i], yi, arc_z[i]], [arc_x[i+1], yi, arc_z[i+1]], 
               [arc_x[i+1]-ts*0.3, yi, arc_z[i+1]], [arc_x[i]-ts*0.3, yi, arc_z[i]]], C_TAPE_SIDE)
    for i in range(len(arc_x)-1):
        f([[arc_x[i], tape_y0, arc_z[i]], [arc_x[i+1], tape_y0, arc_z[i+1]], 
           [arc_x[i+1], tape_y1, arc_z[i+1]], [arc_x[i], tape_y1, arc_z[i]]], C_TAPE_TOP)

    lx, lz_b, lz_t = arc_x[-1], arc_z[-1], CLAMP_H
    f([[lx, tape_y0, lz_b], [lx, tape_y0, lz_t], [lx, tape_y1, lz_t], [lx, tape_y1, lz_b]], C_TAPE_TOP)
    f([[lx-ts*0.3, tape_y0, lz_b], [lx-ts*0.3, tape_y0, lz_t], [lx-ts*0.3, tape_y1, lz_t], [lx-ts*0.3, tape_y1, lz_b]], C_TAPE_SIDE)

    # ── 4. 고정 구조물 (Clamp) ──
    gx0, gx1, gz0, gz1 = lx - 0.8, lx + 0.2, CLAMP_H, CLAMP_H + GRIP_H
    gy0, gy1 = (PLATE_W - GRIP_W) / 2.0, (PLATE_W + GRIP_W) / 2.0
    f([[gx0, gy0, gz0], [gx1, gy0, gz0], [gx1, gy1, gz0], [gx0, gy1, gz0]], C_CLAMP)
    f([[gx0, gy0, gz1], [gx1, gy0, gz1], [gx1, gy1, gz1], [gx0, gy1, gz1]], '#34495e')

    # 로드셀 봉
    rx0, rx1, rz, rym = gx1, gx1 + ROD_LEN, (gz0 + gz1) / 2, (gy0 + gy1) / 2
    t2 = np.linspace(0, 2*np.pi, 12)
    for i in range(len(t2)-1):
        f([[rx0, rym+ROD_R*np.cos(t2[i]), rz+ROD_R*np.sin(t2[i])],
           [rx1, rym+ROD_R*np.cos(t2[i]), rz+ROD_R*np.sin(t2[i])],
           [rx1, rym+ROD_R*np.cos(t2[i+1]), rz+ROD_R*np.sin(t2[i+1])],
           [rx0, rym+ROD_R*np.cos(t2[i+1]), rz+ROD_R*np.sin(t2[i+1])]], C_ROD)

    # 텍스트 및 상태
    if progress <= 0: s, c = 'READY', 'white'
    elif progress < 1.0: s, c = f'PEELING {progress*100:.0f}%', '#f1c40f'
    else: s, c = 'FINISHED', '#2ecc71'
    ax.text2D(0.5, 0.95, s, transform=ax.transAxes, ha='center', va='top', 
              color=c, fontsize=12, fontweight='bold', fontfamily='monospace')

    ax.set_xlim([-TAPE_LEN, TAPE_LEN])
    ax.set_ylim([-1, PLATE_W + 1])
    ax.set_zlim([-1, CLAMP_H + 2])
    ax.set_axis_off()
    ax.view_init(elev=25, azim=-55)
    ax.set_box_aspect([TAPE_LEN*2, PLATE_W + 2, CLAMP_H + 3])
