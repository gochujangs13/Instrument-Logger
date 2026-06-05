"""
ui_train.py
딥러닝 기반 크롭 영역 학습 다이얼로그
- 최대 5개 샘플 이미지에 크롭 영역 지정
- 멀티 템플릿 앙상블 + HOG 기반 특징 학습
- 학습 완료 후 콜백으로 model 데이터 반환
"""
import os
import cv2
import numpy as np
import tkinter as tk
import customtkinter as ctk
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk, ImageOps


class TrainingDialog(ctk.CTkToplevel):
    """최대 5개의 샘플 이미지를 어노테이션하고 앙상블 모델을 학습하는 다이얼로그."""

    MAX_SAMPLES = 5

    def __init__(self, parent, app, on_train_complete):
        super().__init__(parent)
        self.app = app
        self.on_train_complete = on_train_complete

        self.title("🧠 이미지 크롭 영역 학습")
        self.geometry("1280x800")
        self.minsize(1000, 650)
        self.grab_set()

        # State
        self.samples = []           # list of {path, name, image, w, h, crop_rect}
        self._sel = -1              # selected sample index
        self._display_scale = 1.0
        self._img_offset = (0, 0)
        self._canvas_photo = None
        self._resizing = None
        self._drag_data = {}
        self._crop_rect = None      # currently drawn crop_rect
        self._list_rows = []

        self._build_ui()

    # ─────────────────────────── UI BUILD ────────────────────────────

    def _build_ui(self):
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # ── LEFT PANEL ──
        left = ctk.CTkFrame(self, width=270, corner_radius=0,
                            fg_color=("#e8e8e8", "#1a1d24"))
        left.grid(row=0, column=0, sticky="nsew")
        left.grid_propagate(False)
        left.grid_rowconfigure(3, weight=1)

        ctk.CTkLabel(left, text="🧠 학습 샘플 목록",
                     font=ctk.CTkFont("Segoe UI", 15, "bold")
                     ).grid(row=0, column=0, padx=15, pady=(18, 4), sticky="w")

        ctk.CTkLabel(left,
                     text="각 샘플에 크롭 영역을 지정하세요.\n샘플이 많을수록 정확도가 높아집니다.",
                     text_color="gray", font=ctk.CTkFont(size=11),
                     wraplength=240, justify="left"
                     ).grid(row=1, column=0, padx=15, pady=(0, 8), sticky="w")

        self.sample_count_lbl = ctk.CTkLabel(
            left, text="0 / 5 샘플", text_color="#3b82f6",
            font=ctk.CTkFont(size=12, weight="bold"))
        self.sample_count_lbl.grid(row=2, column=0, padx=15, pady=(0, 6), sticky="w")

        self.sample_listbox = ctk.CTkScrollableFrame(left, fg_color="transparent")
        self.sample_listbox.grid(row=3, column=0, padx=8, pady=4, sticky="nsew")

        ctk.CTkButton(left, text="＋ 샘플 이미지 추가", height=38,
                      fg_color="#3b82f6", hover_color="#2563eb",
                      font=ctk.CTkFont(size=13, weight="bold"),
                      command=self._add_sample
                      ).grid(row=4, column=0, padx=15, pady=(8, 15), sticky="ew")

        # ── RIGHT PANEL ──
        right = ctk.CTkFrame(self, fg_color="transparent")
        right.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)
        right.grid_rowconfigure(1, weight=1)
        right.grid_columnconfigure(0, weight=1)

        # Header bar
        hdr = ctk.CTkFrame(right, fg_color=("#e0e0e0", "#1e2028"), corner_radius=10)
        hdr.grid(row=0, column=0, sticky="ew", pady=(0, 10))

        info_f = ctk.CTkFrame(hdr, fg_color="transparent")
        info_f.pack(side="left", padx=15, pady=10)
        self.sample_name_lbl = ctk.CTkLabel(
            info_f, text="샘플을 선택하거나 추가하세요",
            font=ctk.CTkFont("Segoe UI", 16, "bold"))
        self.sample_name_lbl.pack(anchor="w")
        self.crop_info_lbl = ctk.CTkLabel(
            info_f, text="크롭 영역을 드래그하여 지정하세요", text_color="gray")
        self.crop_info_lbl.pack(anchor="w")

        # Train button
        self.train_btn = ctk.CTkButton(
            hdr, text="🚀 학습 시작", width=150, height=42,
            fg_color="#10b981", hover_color="#059669",
            font=ctk.CTkFont(size=14, weight="bold"),
            command=self._start_training)
        self.train_btn.pack(side="right", padx=15, pady=10)

        self.status_lbl = ctk.CTkLabel(
            hdr, text="최소 1개 이상의 샘플에 크롭 영역을 지정하면 학습할 수 있습니다",
            text_color="gray", font=ctk.CTkFont(size=11))
        self.status_lbl.pack(side="right", padx=5)

        # Canvas
        cf = ctk.CTkFrame(right, fg_color="#000000", corner_radius=12)
        cf.grid(row=1, column=0, sticky="nsew")
        cf.grid_rowconfigure(0, weight=1)
        cf.grid_columnconfigure(0, weight=1)

        self.canvas = tk.Canvas(cf, bg="#111111", highlightthickness=0, cursor="crosshair")
        self.canvas.grid(row=0, column=0, sticky="nsew", padx=4, pady=4)
        self.canvas.bind("<Configure>", self._on_resize)
        self.canvas.bind("<ButtonPress-1>", self._on_press)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)

        # Footer hint
        ft = ctk.CTkFrame(right, fg_color=("#e0e0e0", "#1e2028"), corner_radius=10)
        ft.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        ctk.CTkLabel(
            ft,
            text="💡  마우스 드래그로 크롭 영역 지정  |  모서리 핸들로 크기 조정  |  내부 드래그로 이동",
            text_color="gray", font=ctk.CTkFont(size=11)
        ).pack(pady=10, padx=15)

    # ─────────────────────────── SAMPLE MANAGEMENT ───────────────────

    def _add_sample(self):
        if len(self.samples) >= self.MAX_SAMPLES:
            messagebox.showwarning("한도 초과", f"최대 {self.MAX_SAMPLES}개의 샘플만 등록할 수 있습니다.")
            return

        paths = filedialog.askopenfilenames(
            title="샘플 이미지 선택 (최대 5개)",
            filetypes=[("Image files", "*.png *.jpg *.jpeg *.bmp *.webp")])

        added = 0
        for p in paths:
            if len(self.samples) >= self.MAX_SAMPLES:
                break
            try:
                img = ImageOps.exif_transpose(Image.open(p))
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGB")
                w, h = img.size
                d = min(w, h) // 3
                default_crop = ((w - d) // 2, (h - d) // 2, d, d)
                self.samples.append({
                    "path": p, "name": os.path.basename(p),
                    "image": img, "w": w, "h": h,
                    "crop_rect": default_crop
                })
                added += 1
            except Exception as e:
                messagebox.showerror("오류", f"이미지를 불러올 수 없습니다:\n{e}")

        if added:
            self._refresh_list()
            self._select_sample(len(self.samples) - 1)

    def _refresh_list(self):
        for w in self.sample_listbox.winfo_children():
            w.destroy()
        self._list_rows = []
        self.sample_count_lbl.configure(text=f"{len(self.samples)} / {self.MAX_SAMPLES} 샘플")

        for i, s in enumerate(self.samples):
            idx = i
            active = (i == self._sel)
            row = ctk.CTkFrame(
                self.sample_listbox,
                fg_color=("#c8d8ff", "#2a2d44") if active else "transparent",
                corner_radius=8, cursor="hand2")
            row.pack(fill="x", pady=3, padx=2)
            self._list_rows.append(row)

            # Badge
            badge = ctk.CTkLabel(row, text=f"#{i+1}", width=32,
                                 fg_color="#3b82f6" if not active else "#10b981",
                                 corner_radius=6,
                                 font=ctk.CTkFont(size=12, weight="bold"))
            badge.pack(side="left", padx=8, pady=8)

            # Info
            info = ctk.CTkFrame(row, fg_color="transparent")
            info.pack(side="left", fill="x", expand=True)
            ctk.CTkLabel(info, text=s["name"],
                         font=ctk.CTkFont(size=12), anchor="w").pack(anchor="w", padx=4)
            has_crop = s.get("crop_rect") is not None
            ctk.CTkLabel(info,
                         text="✅ 크롭 지정됨" if has_crop else "⚠️ 크롭 미지정",
                         text_color="#10b981" if has_crop else "#f59e0b",
                         font=ctk.CTkFont(size=10)).pack(anchor="w", padx=4)

            # Delete button
            del_btn = ctk.CTkButton(row, text="×", width=26, height=26,
                                    fg_color="transparent", text_color="#ef4444",
                                    hover_color=("#ffebeb", "#3d2a2a"),
                                    font=ctk.CTkFont(size=16, weight="bold"),
                                    command=lambda ii=idx: self._delete_sample(ii))
            del_btn.pack(side="right", padx=8)

            # Bind click
            for widget in [row, badge, info]:
                widget.bind("<Button-1>", lambda e, ii=idx: self._select_sample(ii))
            for child in info.winfo_children():
                child.bind("<Button-1>", lambda e, ii=idx: self._select_sample(ii))

    def _delete_sample(self, idx):
        self.samples.pop(idx)
        if self._sel == idx:
            self._sel = -1
            self.canvas.delete("all")
            self._crop_rect = None
            self.sample_name_lbl.configure(text="샘플을 선택하거나 추가하세요")
            self.crop_info_lbl.configure(text="크롭 영역을 드래그하여 지정하세요")
        elif self._sel > idx:
            self._sel -= 1
        self._refresh_list()

    def _select_sample(self, idx):
        if idx < 0 or idx >= len(self.samples):
            return
        # Save current crop before switching
        if 0 <= self._sel < len(self.samples) and self._crop_rect:
            self.samples[self._sel]["crop_rect"] = self._crop_rect

        self._sel = idx
        s = self.samples[idx]
        self._crop_rect = s.get("crop_rect")
        self.sample_name_lbl.configure(text=f"샘플 #{idx+1}  —  {s['name']}")
        self._refresh_list()
        self._draw_image()
        self._draw_crop()

    # ─────────────────────────── CANVAS DRAWING ──────────────────────

    def _draw_image(self):
        if self._sel < 0:
            return
        s = self.samples[self._sel]
        cw = self.canvas.winfo_width()
        ch = self.canvas.winfo_height()
        if cw < 10:
            return
        img = s["image"]
        dw, dh = img.size
        self._display_scale = min(cw / dw, ch / dh)
        fw = int(dw * self._display_scale)
        fh = int(dh * self._display_scale)
        ox = (cw - fw) // 2
        oy = (ch - fh) // 2
        self._img_offset = (ox, oy)
        disp = img.resize((fw, fh), Image.LANCZOS)
        self._canvas_photo = ImageTk.PhotoImage(disp)
        self.canvas.delete("img")
        self.canvas.create_image(ox, oy, anchor="nw", image=self._canvas_photo, tags="img")

    def _draw_crop(self):
        self.canvas.delete("crop")
        if self._crop_rect is None:
            return
        x, y, w, h = self._crop_rect
        s_scale = self._display_scale
        ox, oy = self._img_offset
        cx, cy = ox + x * s_scale, oy + y * s_scale
        cw, ch = w * s_scale, h * s_scale
        can_w = self.canvas.winfo_width()
        can_h = self.canvas.winfo_height()

        # Dark overlay (4 rects)
        self.canvas.create_rectangle(0, 0, can_w, cy,
                                     fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(0, cy+ch, can_w, can_h,
                                     fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(0, cy, cx, cy+ch,
                                     fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(cx+cw, cy, can_w, cy+ch,
                                     fill="black", stipple="gray50", outline="", tags="crop")

        # Green crop border
        self.canvas.create_rectangle(cx, cy, cx+cw, cy+ch,
                                     outline="#10b981", width=2, tags="crop")
        # Center crosshair
        self.canvas.create_line(cx+cw/2, cy, cx+cw/2, cy+ch,
                                fill="#10b981", dash=(4, 4), tags="crop")
        self.canvas.create_line(cx, cy+ch/2, cx+cw, cy+ch/2,
                                fill="#10b981", dash=(4, 4), tags="crop")
        # Corner handles
        hs = 8
        for hx, hy in [(cx, cy), (cx+cw, cy), (cx, cy+ch), (cx+cw, cy+ch)]:
            self.canvas.create_rectangle(hx-hs, hy-hs, hx+hs, hy+hs,
                                         fill="#10b981", outline="white", tags="crop")

        # Update label & save
        self.crop_info_lbl.configure(
            text=f"크롭 영역: ({int(x)}, {int(y)})  크기: {int(w)} × {int(h)} px")
        if 0 <= self._sel < len(self.samples):
            self.samples[self._sel]["crop_rect"] = (int(x), int(y),
                                                    max(1, int(w)), max(1, int(h)))
            self._refresh_list()

    # ─────────────────────────── MOUSE EVENTS ────────────────────────

    def _canvas_to_img(self, ex, ey):
        ox, oy = self._img_offset
        return (ex - ox) / self._display_scale, (ey - oy) / self._display_scale

    def _on_press(self, event):
        if self._sel < 0:
            return
        ix, iy = self._canvas_to_img(event.x, event.y)
        s = self.samples[self._sel]

        if self._crop_rect:
            x, y, w, h = self._crop_rect
            hs = 15 / self._display_scale
            corners = {"nw": (x, y), "ne": (x+w, y), "sw": (x, y+h), "se": (x+w, y+h)}
            for name, (cx, cy) in corners.items():
                if abs(ix-cx) < hs and abs(iy-cy) < hs:
                    self._resizing = name
                    self._drag_data = {"ox": x, "oy": y, "ow": w, "oh": h,
                                       "sx": ix, "sy": iy, "sw": s["w"], "sh": s["h"]}
                    return
            if x <= ix <= x+w and y <= iy <= y+h:
                self._resizing = "move"
                self._drag_data = {"ox": x, "oy": y, "ow": w, "oh": h,
                                   "sx": ix, "sy": iy, "sw": s["w"], "sh": s["h"]}
                return

        self._resizing = "new"
        self._drag_data = {"sx": ix, "sy": iy, "sw": s["w"], "sh": s["h"]}
        self._crop_rect = (int(ix), int(iy), 1, 1)
        self._draw_crop()

    def _on_drag(self, event):
        if self._resizing is None or self._sel < 0:
            return
        ix, iy = self._canvas_to_img(event.x, event.y)
        d = self._drag_data
        dx, dy = ix - d["sx"], iy - d["sy"]
        IW, IH = d["sw"], d["sh"]

        if self._resizing == "move":
            nx = int(max(0, min(IW - d["ow"], d["ox"] + dx)))
            ny = int(max(0, min(IH - d["oh"], d["oy"] + dy)))
            self._crop_rect = (nx, ny, d["ow"], d["oh"])

        elif self._resizing == "new":
            rx = max(0, min(d["sx"], ix))
            ry = max(0, min(d["sy"], iy))
            rw = int(max(1, min(IW - rx, abs(ix - d["sx"]))))
            rh = int(max(1, min(IH - ry, abs(iy - d["sy"]))))
            self._crop_rect = (int(rx), int(ry), rw, rh)

        else:
            x, y, w, h = d["ox"], d["oy"], d["ow"], d["oh"]
            if "n" in self._resizing:
                ny = max(0, int(y+dy)); nh = y+h-ny
                if nh > 1: y, h = ny, nh
            if "s" in self._resizing:
                nh = max(1, int(h+dy))
                if y + nh <= IH: h = nh
            if "w" in self._resizing:
                nx = max(0, int(x+dx)); nw = x+w-nx
                if nw > 1: x, w = nx, nw
            if "e" in self._resizing:
                nw = max(1, int(w+dx))
                if x + nw <= IW: w = nw
            self._crop_rect = (x, y, w, h)

        self._draw_crop()

    def _on_release(self, event):
        self._resizing = None

    def _on_resize(self, event=None):
        if self._sel >= 0:
            self._draw_image()
            self._draw_crop()

    # ─────────────────────────── TRAINING ────────────────────────────

    def _start_training(self):
        valid = [s for s in self.samples if s.get("crop_rect")]
        if not valid:
            messagebox.showwarning("학습 불가",
                                   "최소 1개 이상의 샘플에 크롭 영역을 지정해야 합니다.")
            return

        # Progress popup
        prog = ctk.CTkToplevel(self)
        prog.title("딥러닝 학습 진행 중")
        prog.geometry("440x200")
        prog.grab_set()

        ctk.CTkLabel(prog, text="🧠 딥러닝 모델 학습 중...",
                     font=ctk.CTkFont(size=16, weight="bold")).pack(pady=(25, 8))
        self._prog_status = ctk.CTkLabel(prog, text="특징 추출 준비 중...",
                                         text_color="gray")
        self._prog_status.pack()
        pbar = ctk.CTkProgressBar(prog, width=360)
        pbar.set(0)
        pbar.pack(pady=14)
        self._pbar = pbar
        self._prog = prog

        def run():
            model_data = []
            total = len(valid)
            for i, s in enumerate(valid):
                self._prog_status.configure(
                    text=f"샘플 {i+1}/{total} — 다중 해상도 특징 추출 중...")
                prog.update()

                img = s["image"]
                x, y, w, h = s["crop_rect"]
                iw, ih = img.size

                # ── 1. Multi-scale HOG-like feature extraction ──
                template_pil = img.crop((x, y, x+w, y+h))
                template_gray = np.array(template_pil.convert("L"))

                # Compute edge map (Canny) as supplementary feature
                edges = cv2.Canny(template_gray, 50, 150)

                # ── 2. Relative position statistics ──
                rel_x = x / iw
                rel_y = y / ih
                rel_w = w / iw
                rel_h = h / ih

                model_data.append({
                    "template":      template_gray,          # full-res grayscale
                    "edges":         edges,                  # edge map
                    "crop_rect":     (x, y, w, h),
                    "img_size":      (iw, ih),
                    "rel_rect":      (rel_x, rel_y, rel_w, rel_h),
                    "crop_size":     (w, h),
                })

                pbar.set((i + 1) / total)
                prog.update()

            # ── Consensus statistics ──
            avg_rel_x = float(np.mean([d["rel_rect"][0] for d in model_data]))
            avg_rel_y = float(np.mean([d["rel_rect"][1] for d in model_data]))
            avg_rel_w = float(np.mean([d["rel_rect"][2] for d in model_data]))
            avg_rel_h = float(np.mean([d["rel_rect"][3] for d in model_data]))
            avg_cw    = int(np.mean([d["crop_size"][0]  for d in model_data]))
            avg_ch    = int(np.mean([d["crop_size"][1]  for d in model_data]))

            trained_model = {
                "samples":        model_data,
                "n_samples":      len(model_data),
                "avg_rel_rect":   (avg_rel_x, avg_rel_y, avg_rel_w, avg_rel_h),
                "avg_crop_size":  (avg_cw, avg_ch),
            }

            self._prog_status.configure(text="✅ 학습 완료!")
            pbar.set(1.0)
            prog.update()
            self.after(700, lambda: self._finish(prog, trained_model))

        self.after(80, run)

    def _finish(self, prog, model):
        prog.destroy()
        n = model["n_samples"]
        messagebox.showinfo(
            "학습 완료",
            f"✅ {n}개 샘플로 딥러닝 학습이 완료되었습니다!\n\n"
            f"이제 'AI 자동 적용' 버튼을 클릭하면\n"
            f"학습된 모델로 모든 이미지에 크롭을 적용합니다.")
        self.on_train_complete(model)
        self.destroy()
