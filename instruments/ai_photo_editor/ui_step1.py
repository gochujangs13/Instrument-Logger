import os
import re
import cv2
import json
import numpy as np
import tkinter as tk
import customtkinter as ctk
from tkinter import filedialog, messagebox
from tkinterdnd2 import DND_FILES
from PIL import Image, ImageTk, ImageOps
from .ui_yolo_train import YoloTrainDialog

class Step1Frame(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color="transparent")
        self.app = app
        self._drag_data = {}
        self._canvas_img = None
        self._crop_id = None
        self._handle_ids = []
        self._display_scale = 1.0
        self._selected_idx = -1
        self._resizing = None
        self._cur_draw_size = (1, 1)
        self._zoom_level = 1.0
        self._pan_offset = [0, 0]
        self._last_mouse = (0, 0)
        self._ref_template = None
        self._trained_models = []   # 딥러닝 학습된 모델 목록 (여러 보드 타입 지원)

        self._build_ui()
        
        # Bind Return/Enter globally on the master window to navigate to next file
        def on_enter(event):
            try:
                if self.winfo_ismapped():
                    focused = self.focus_get()
                    if focused and "entry" in str(focused).lower():
                        return
                    if self._selected_idx >= 0 and self._selected_idx < len(self.app.files) - 1:
                        self._select_file(self._selected_idx + 1)
            except:
                pass
        self.master.bind("<Return>", on_enter, add="+")

    def _build_ui(self):
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # LEFT sidebar
        sidebar = ctk.CTkFrame(self, width=300, corner_radius=0,
                               fg_color=("#e8e8e8", "#1a1d24"))
        sidebar.grid(row=0, column=0, sticky="nsew")
        sidebar.grid_propagate(False)
        sidebar.grid_rowconfigure(2, weight=1)

        header = ctk.CTkLabel(sidebar, text=self.app.app.t("ai_step1_file", "📁  파일 리스트"),
                               font=ctk.CTkFont("Segoe UI", 16, "bold"))
        header.grid(row=0, column=0, padx=15, pady=(15, 5), sticky="w")

        self.file_count_lbl = ctk.CTkLabel(sidebar, text=self.app.app.t("ai_step1_zero_files", "0개의 파일"),
                                           text_color="gray")
        self.file_count_lbl.grid(row=0, column=0, padx=15, pady=(15, 5), sticky="e")

        # DELETE ALL BUTTON
        self.del_all_btn = ctk.CTkButton(sidebar, text=self.app.app.t("ai_step1_del_all", "전체 삭제"), width=80, height=24,
                                          fg_color="transparent", text_color="gray",
                                          hover_color=("#ffebeb", "#3d2a2a"),
                                          font=ctk.CTkFont(size=11),
                                          command=self._delete_all_files)
        self.del_all_btn.grid(row=0, column=0, padx=(0, 80), pady=(15, 5), sticky="e")

        drop = ctk.CTkButton(sidebar, text=self.app.app.t("ai_step1_drag", "파일을 여기로 드래그하거나\n클릭하여 업로드"),
                             height=100, corner_radius=12,
                             fg_color="transparent",
                             border_width=2, border_color="gray",
                             hover_color=("#d0d0ff", "#2a2d44"),
                             command=self._open_files)
        drop.grid(row=1, column=0, padx=15, pady=10, sticky="ew")

        self.file_listbox = ctk.CTkScrollableFrame(sidebar, fg_color="transparent")
        self.file_listbox.grid(row=2, column=0, padx=10, pady=(0, 10), sticky="nsew")

        # RIGHT workspace
        workspace = ctk.CTkFrame(self, fg_color="transparent")
        workspace.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)
        workspace.grid_rowconfigure(1, weight=1)
        workspace.grid_columnconfigure(0, weight=1)

        # Header bar
        hdr = ctk.CTkFrame(workspace, fg_color=("#e0e0e0", "#1e2028"), corner_radius=10)
        hdr.grid(row=0, column=0, sticky="ew", pady=(0, 10))

        info_frame = ctk.CTkFrame(hdr, fg_color="transparent")
        info_frame.pack(side="left", padx=15, pady=10)
        self.name_lbl = ctk.CTkLabel(info_frame, text=self.app.app.t("ai_step1_no_sel", "선택된 파일 없음"),
                                     font=ctk.CTkFont("Segoe UI", 18, "bold"))
        self.name_lbl.pack(anchor="w")
        self.meta_lbl = ctk.CTkLabel(info_frame, text="0 KB  |  0 × 0 px", text_color="gray")
        self.meta_lbl.pack(anchor="w")

        # Top-Right Output size label
        ctk.CTkLabel(hdr, text=self.app.app.t("ai_step1_action_size", "엑셀 출력 사이즈 (inch)"),
                     text_color="#3b82f6",
                     font=ctk.CTkFont(size=11, weight="bold")).pack(side="right", padx=(0, 15))

        size_frame = ctk.CTkFrame(hdr, fg_color="transparent")
        size_frame.pack(side="right", padx=5, pady=10)

        ctk.CTkLabel(size_frame, text="높이(inch)", text_color="gray",
                     font=ctk.CTkFont(size=11)).grid(row=0, column=0)
        self.out_h_var = tk.StringVar(value="1.5")
        ctk.CTkEntry(size_frame, textvariable=self.out_h_var, width=60, justify="center").grid(row=1, column=0, padx=5)

        ctk.CTkLabel(size_frame, text="너비(inch)", text_color="gray",
                     font=ctk.CTkFont(size=11)).grid(row=0, column=1)
        self.out_w_var = tk.StringVar(value="1.5")
        ctk.CTkEntry(size_frame, textvariable=self.out_w_var, width=60, justify="center").grid(row=1, column=1, padx=5)

        self._load_config()
        self.out_h_var.trace_add("write", lambda *_: self._save_config())
        self.out_w_var.trace_add("write", lambda *_: self._save_config())

        # Header right - Training Button
        self.train_btn = ctk.CTkButton(
            hdr, text=self.app.app.t("ai_step1_crop_learn", "🧠 크롭 영역 학습"), width=160, height=36,
            fg_color=("#6d28d9", "#7c3aed"), hover_color=("#5b21b6", "#6d28d9"),
            font=ctk.CTkFont(size=13, weight="bold"),
            command=self._open_training_dialog)
        self.train_btn.pack(side="right", padx=(5, 20), pady=10)

        # Canvas
        canvas_frame = ctk.CTkFrame(workspace, fg_color="#000000", corner_radius=12)
        canvas_frame.grid(row=1, column=0, sticky="nsew")
        canvas_frame.grid_rowconfigure(0, weight=1)
        canvas_frame.grid_columnconfigure(0, weight=1)

        self.canvas = tk.Canvas(canvas_frame, bg="#111111", highlightthickness=0, cursor="crosshair")
        self.canvas.grid(row=0, column=0, sticky="nsew", padx=4, pady=4)
        self.canvas.bind("<Configure>", self._on_canvas_resize)
        self.canvas.bind("<ButtonPress-1>", self._on_press)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)
        self.canvas.bind("<MouseWheel>", self._on_mouse_wheel)
        self.canvas.bind("<ButtonPress-3>", self._on_pan_start)
        self.canvas.bind("<B3-Motion>", self._on_pan_move)
        self.canvas.bind("<ButtonPress-2>", self._on_pan_start)
        self.canvas.bind("<B2-Motion>", self._on_pan_move)
        self.canvas.bind("<ButtonRelease-2>", self._on_pan_end)

        # Footer
        footer = ctk.CTkFrame(workspace, fg_color="transparent")
        footer.grid(row=2, column=0, sticky="ew", pady=(10, 0))

        left_btns = ctk.CTkFrame(footer, fg_color="transparent")
        left_btns.pack(side="left")
        ctk.CTkButton(left_btns, text=self.app.app.t("ai_step1_reselect", "🔄 다시 선택"), width=120,
                      fg_color=("#d0d0ff", "#2a2d44"), text_color=("black", "white"),
                      command=self._reset_crop).pack(side="left", padx=5)

        rot_frame = ctk.CTkFrame(footer, fg_color="transparent")
        rot_frame.pack(side="left", padx=20)
        ctk.CTkLabel(rot_frame, text=self.app.app.t("yolo_horiz_adj", "수평 보정:")).pack(side="left", padx=5)
        
        def step_rotate(delta):
            val = self.rot_slider.get() + delta
            val = max(-15.0, min(15.0, val))
            self.rot_slider.set(val)
            self._on_rotate(val)

        ctk.CTkButton(rot_frame, text="↻", width=28, height=24, fg_color="transparent", border_width=1,
                      command=lambda: step_rotate(-0.1)).pack(side="left", padx=2)

        self.rot_slider = ctk.CTkSlider(rot_frame, from_=-15, to=15, width=150, command=self._on_rotate)
        self.rot_slider.set(0)
        self.rot_slider.pack(side="left", padx=5)

        ctk.CTkButton(rot_frame, text="↺", width=28, height=24, fg_color="transparent", border_width=1,
                      command=lambda: step_rotate(0.1)).pack(side="left", padx=2)

        self.rot_lbl = ctk.CTkLabel(rot_frame, text="0.0°", width=35)
        self.rot_lbl.pack(side="left", padx=5)

        self.ai_btn = ctk.CTkButton(left_btns, text=self.app.app.t("ai_step1_auto_crop", "🤖 크롭 자동 지정"), width=180,
                                    fg_color="#3b82f6", hover_color="#2563eb",
                                    command=self._auto_align_all)
        self.ai_btn.pack(side="left", padx=5)


        # 학습 상태 표시 라벨
        self.train_status_lbl = ctk.CTkLabel(
            left_btns, text="", text_color="#10b981",
            font=ctk.CTkFont(size=11, weight="bold"))
        self.train_status_lbl.pack(side="left", padx=5)

        self.next_btn = ctk.CTkButton(footer, text=self.app.app.t("ai_step1_next", "다음 단계로 ▶"), width=160,
                                      fg_color="#4f46e5", hover_color="#6366f1",
                                      command=self._go_next)
        self.next_btn.pack(side="right", padx=5)

        sidebar.drop_target_register(DND_FILES)
        sidebar.dnd_bind('<<Drop>>', self._on_dnd_drop)

    def _delete_all_files(self):
        """Clear the entire file list."""
        if not self.app.files: return
        if messagebox.askyesno(self.app.app.t("ai_step1_del_all", "전체 삭제"), self.app.app.t("ai_step1_del_all_msg", "정말로 모든 사진을 삭제하시겠습니까?")):
            self.app.files.clear()
            self._selected_idx = -1
            self.name_lbl.configure(text="선택된 파일 없음")
            self.meta_lbl.configure(text="0 KB  |  0 × 0 px")
            self.canvas.delete("all")
            self._refresh_file_list()

    def _load_config(self):
        try:
            if os.path.exists("ai_photo_editor_settings.json"):
                with open("ai_photo_editor_settings.json", "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    if "out_w" in cfg: self.out_w_var.set(str(cfg["out_w"]))
                    if "out_h" in cfg: self.out_h_var.set(str(cfg["out_h"]))

                    # Load multiple saved models
                    for entry in cfg.get("model_paths", []):
                        p, n = entry.get("path", ""), entry.get("name", "")
                        if p and os.path.exists(p):
                            self.after(500, lambda p=p, n=n: self._load_model_silent(p, n))

                    # Backward compat: single last_model key
                    if not cfg.get("model_paths") and "last_model" in cfg:
                        p = cfg["last_model"]
                        if os.path.exists(p):
                            self.after(500, lambda p=p: self._load_model_silent(p))
        except Exception: pass

    def _load_model_silent(self, path, name=None):
        try:
            from ultralytics import YOLO
            model = YOLO(path)
            classes = list(model.names.values()) if hasattr(model, "names") else ["Unknown"]
            board_name = name or os.path.splitext(os.path.basename(path))[0].replace("yolo_model_", "")
            # Remove existing entry with same path if present
            self._trained_models = [m for m in self._trained_models if m.get("path") != path]
            self._trained_models.append({"yolo": model, "classes": classes, "name": board_name, "path": path})
            self.train_btn.configure(fg_color="#10b981", hover_color="#059669",
                                     text=self.app.app.t("ai_step1_yolo_active", "🧠 YOLO 모델 활성"))
            self._update_train_status_lbl()
        except: pass

    def _update_train_status_lbl(self):
        if not self._trained_models:
            self.train_status_lbl.configure(text="")
            return
        names = ", ".join(m["name"] for m in self._trained_models)
        self.train_status_lbl.configure(
            text=f"✅ 활성 모델: {names} ({len(self._trained_models)}개)")

    def _save_config(self):
        try:
            cfg = {
                "out_w": self.out_w_var.get(),
                "out_h": self.out_h_var.get(),
                "model_paths": [
                    {"path": m["path"], "name": m["name"]}
                    for m in self._trained_models if os.path.exists(m.get("path", ""))
                ]
            }
            with open("ai_photo_editor_settings.json", "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
        except Exception: pass

    def _open_files(self):
        paths = filedialog.askopenfilenames(title="이미지 파일 선택", filetypes=[("Image files", "*.png *.jpg *.jpeg *.bmp *.webp")])
        if paths: self._add_files(list(paths))

    def _on_dnd_drop(self, event):
        raw = event.data
        paths = re.findall(r'\{(.+?)\}', raw) or raw.split()
        valid_ext = ('.png', '.jpg', '.jpeg', '.bmp', '.webp')
        self._add_files([p.strip("{}") for p in paths if p.lower().endswith(valid_ext)])

    def _add_files(self, paths):
        if not paths: return
        
        # Loading Popup for Uploading
        progress = ctk.CTkToplevel(self)
        progress.title("사진 불러오기")
        progress.geometry("400x150")
        progress.grab_set()
        
        lbl = ctk.CTkLabel(progress, text=self.app.app.t("ai_step1_loading_imgs", "사진 {cnt}장을 불러오는 중입니다...").format(cnt=len(paths)), font=ctk.CTkFont(size=14))
        lbl.pack(pady=20)
        pbar = ctk.CTkProgressBar(progress, width=300)
        pbar.set(0); pbar.pack(pady=10)
        
        def run_upload():
            total = len(paths)
            for i, p in enumerate(paths):
                try:
                    img = ImageOps.exif_transpose(Image.open(p))
                    if img.mode not in ("RGB", "RGBA"): img = img.convert("RGB")
                    w, h = img.size
                    sz = os.path.getsize(p)
                    self.app.files.append({"path": p, "name": os.path.basename(p), "size": sz, "size_str": self._fmt_bytes(sz), "image": img, "w": w, "h": h, "angle": 0.0})
                except Exception as e:
                    print(f"Error loading {p}: {e}")
                
                if i % 5 == 0 or i == total - 1: # Update progress every 5 files
                    pbar.set((i+1)/total)
                    progress.update()
            
            progress.destroy()
            self._refresh_file_list()
            # Ensure the first file is selected if nothing is selected yet
            if len(self.app.files) > 0:
                # Use a small delay to ensure UI components are ready
                self.after(50, lambda: self._select_file(0))
            
        self.after(100, run_upload)

    def _refresh_file_list(self):
        """Build the list from scratch ONLY when files are added or deleted."""
        for w in self.file_listbox.winfo_children(): w.destroy()
        self._list_rows = []
        self.file_count_lbl.configure(text=f"{len(self.app.files)}개의 파일")
        
        # Performance: Define helper outside loop
        def bind_recursive(widget, idx_val, del_btn_ref):
            if widget != del_btn_ref:
                widget.bind("<Button-1>", lambda e: self._select_file(idx_val))
                for child in widget.winfo_children():
                    bind_recursive(child, idx_val, del_btn_ref)

        for i, f in enumerate(self.app.files):
            try:
                idx = i # Essential for lambda and indexing
                row = ctk.CTkFrame(self.file_listbox, fg_color=("#d0d0ff", "#2a2d44") if i == self._selected_idx else "transparent", corner_radius=8, cursor="hand2")
                row.pack(fill="x", pady=2, padx=2)
                self._list_rows.append(row)
                
                # Thumbnail
                thumb = f["image"].copy()
                thumb.thumbnail((36, 36))
                tk_thumb = ImageTk.PhotoImage(thumb)
                lbl_img = ctk.CTkLabel(row, text="", image=tk_thumb)
                lbl_img.image = tk_thumb
                lbl_img.pack(side="left", padx=8, pady=6)
                
                # File Info
                info = ctk.CTkFrame(row, fg_color="transparent")
                info.pack(side="left", fill="x", expand=True)
                ctk.CTkLabel(info, text=f["name"], font=ctk.CTkFont(size=12)).pack(anchor="w")
                ctk.CTkLabel(info, text=f["size_str"], text_color="gray", font=ctk.CTkFont(size=10)).pack(anchor="w")
                
                # DELETE BUTTON (X)
                del_btn = ctk.CTkButton(row, text="×", width=24, height=24, 
                                         fg_color="transparent", text_color="#ef4444",
                                         hover_color=("#ffebeb", "#3d2a2a"),
                                         font=ctk.CTkFont(size=16, weight="bold"),
                                         command=lambda ii=idx: self._delete_file(ii))
                del_btn.pack(side="right", padx=10)

                # Bind all parts of the row to select the file
                bind_recursive(row, idx, del_btn)
            except Exception as e:
                print(f"Error rendering list item {i}: {e}")

    def _delete_file(self, idx):
        """Remove a file from the list and update UI."""
        if 0 <= idx < len(self.app.files):
            self.app.files.pop(idx)
            if self._selected_idx == idx:
                if len(self.app.files) > 0:
                    new_idx = min(idx, len(self.app.files) - 1)
                    self._select_file(new_idx)
                else:
                    self._selected_idx = -1
                    self.name_lbl.configure(text="선택된 파일 없음")
                    self.meta_lbl.configure(text="0 KB  |  0 × 0 px")
                    self.canvas.delete("all")
            elif self._selected_idx > idx:
                self._selected_idx -= 1
            
            self._refresh_file_list()

    def _select_file(self, idx):
        """Optimized selection: Only update highlighs, no full redraw."""
        if idx < 0 or idx >= len(self.app.files): return
        
        # Update UI colors for previous and new selection
        if hasattr(self, "_list_rows") and len(self._list_rows) > 0:
            # Clear old highlight
            if 0 <= self._selected_idx < len(self._list_rows):
                self._list_rows[self._selected_idx].configure(fg_color="transparent")
            # Set new highlight
            if 0 <= idx < len(self._list_rows):
                self._list_rows[idx].configure(fg_color=("#d0d0ff", "#2a2d44"))

        self._selected_idx = idx
        f = self.app.files[idx]
        self.name_lbl.configure(text=f["name"])
        self.meta_lbl.configure(text=f"{f['size_str']}  |  {f['w']} × {f['h']} px")
        self.rot_slider.set(f.get("angle", 0))
        self.rot_lbl.configure(text=f"{f.get('angle', 0):.1f}°")
        
        self._draw_image()
        if f.get("crop_rect"):
            self.app.crop_rect = f["crop_rect"]
        else:
            default = min(f["w"], f["h"]) // 3
            cx, cy = (f["w"] - default) // 2, (f["h"] - default) // 2
            self.app.crop_rect = (cx, cy, default, default)
            f["crop_rect"] = self.app.crop_rect
        self._draw_crop()
        
        # Scroll the selected item to the very top of the scrollable frame
        try:
            n_imgs = len(self.app.files)
            if n_imgs > 0 and hasattr(self.file_listbox, "_parent_canvas"):
                fraction = idx / n_imgs
                self.file_listbox._parent_canvas.yview_moveto(fraction)
        except Exception as e:
            pass

    def _draw_image(self):
        if self._selected_idx < 0: return
        f = self.app.files[self._selected_idx]
        cw, ch = self.canvas.winfo_width(), self.canvas.winfo_height()
        if cw < 10: return
        img = f["image"]
        
        # Optimize rotation & resizing speed by using BILINEAR filter (much faster than BICUBIC/LANCZOS)
        angle = f.get("angle", 0)
        if angle != 0: 
            img = img.rotate(angle, resample=Image.BILINEAR, expand=True)
            
        dw, dh = img.size
        self._cur_draw_size = (dw, dh)
        self._display_scale = min(cw / dw, ch / dh) * self._zoom_level
        fw, fh = int(dw * self._display_scale), int(dh * self._display_scale)
        ox = (cw - fw) // 2 + self._pan_offset[0]
        oy = (ch - fh) // 2 + self._pan_offset[1]
        self._img_offset = (ox, oy)
        
        # Use BILINEAR for fast rendering during display
        disp = img.resize((fw, fh), Image.BILINEAR)
        self._canvas_photo = ImageTk.PhotoImage(disp)
        self.canvas.delete("img")
        self.canvas.create_image(ox, oy, anchor="nw", image=self._canvas_photo, tags="img")

    def _draw_crop(self):
        self.canvas.delete("crop")
        if self.app.crop_rect is None: return
        x, y, w, h = self.app.crop_rect
        s, (ox, oy) = self._display_scale, self._img_offset
        cx, cy, cw, ch = ox + x*s, oy + y*s, w*s, h*s
        can_w, can_h = self.canvas.winfo_width(), self.canvas.winfo_height()
        self.canvas.create_rectangle(0, 0, can_w, cy, fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(0, cy+ch, can_w, can_h, fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(0, cy, cx, cy+ch, fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(cx+cw, cy, can_w, cy+ch, fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(cx, cy, cx+cw, cy+ch, outline="#4f46e5", width=2, tags="crop")
        hs = 8
        for (hx, hy) in [(cx, cy), (cx+cw, cy), (cx, cy+ch), (cx+cw, cy+ch)]:
            self.canvas.create_rectangle(hx-hs, hy-hs, hx+hs, hy+hs, fill="#4f46e5", outline="white", tags="crop")
        self.canvas.create_line(cx+cw/2, cy, cx+cw/2, cy+ch, fill="#4f46e5", dash=(4,4), tags="crop")
        self.canvas.create_line(cx, cy+ch/2, cx+cw, cy+ch/2, fill="#4f46e5", dash=(4,4), tags="crop")
        self._update_relative_coords()

    def _update_relative_coords(self):
        if self._selected_idx < 0 or self.app.crop_rect is None: return
        f = self.app.files[self._selected_idx]
        dw, dh = self._cur_draw_size
        x, y, w, h = self.app.crop_rect
        f["crop_rect"] = (int(x), int(y), max(1, int(w)), max(1, int(h)))
        self.app.center_rel_rect = ((x+w/2 - dw/2)/dw, (y+h/2 - dh/2)/dh, w/dw, h/dh)
        try:
            img = f["image"]
            if f.get("angle", 0) != 0: img = img.rotate(f["angle"], resample=Image.BICUBIC, expand=True)
            self._ref_template = np.array(img.crop((x, y, x+w, y+h)).convert("L"))
        except Exception: pass

    def _open_training_dialog(self):
        """YOLO 딥러닝 학습 다이얼로그를 열어 커스텀 데이터셋을 구축/학습한다."""
        def on_complete(data):
            try:
                from ultralytics import YOLO
                board_name = data.get("name", os.path.splitext(os.path.basename(data["model_path"]))[0].replace("yolo_model_", ""))
                # Remove old entry for same board if re-trained
                self._trained_models = [m for m in self._trained_models if m.get("path") != data["model_path"]]
                self._trained_models.append({
                    "yolo": YOLO(data["model_path"]),
                    "classes": data["classes"],
                    "name": board_name,
                    "path": data["model_path"],
                    "avg_bbox": data.get("avg_bbox")  # fallback crop coordinates
                })
                self._save_config()
                self.train_btn.configure(fg_color="#10b981", hover_color="#059669",
                                         text="🧠 YOLO 모델 활성")
                self._update_train_status_lbl()
            except Exception as e:
                print(f"[ERROR] Failed to load trained model: {e}")
                messagebox.showerror("오류", f"학습된 모델을 로드하는 중 오류가 발생했습니다: {e}")

        YoloTrainDialog(self, self.app, on_complete)

    def _export_model(self):
        messagebox.showinfo("안내", "AI 엔진 교체로 인해 모델 내보내기 기능은 '학습 창' 내부의 [작업 내역 저장] 버튼을 이용해주세요.")

    def _import_model(self):
        path = filedialog.askopenfilename(title="YOLO 모델 선택 (.pt)", filetypes=[("YOLO Model", "*.pt")])
        if not path: return
        try:
            from ultralytics import YOLO
            model = YOLO(path)
            classes = list(model.names.values()) if hasattr(model, "names") else ["Unknown"]
            board_name = os.path.splitext(os.path.basename(path))[0].replace("yolo_model_", "")
            self._trained_models = [m for m in self._trained_models if m.get("path") != path]
            self._trained_models.append({"yolo": model, "classes": classes, "name": board_name, "path": path})
            self._save_config()
            self.train_btn.configure(fg_color="#10b981", hover_color="#059669",
                                     text="🧠 YOLO 모델 활성")
            self._update_train_status_lbl()
            messagebox.showinfo("성공", f"'{board_name}' 모델을 추가로 불러왔습니다.\n총 {len(self._trained_models)}개 모델 활성")
        except Exception as e:
            messagebox.showerror("오류", f"모델을 불러오는 중 오류가 발생했습니다: {e}")

    def _auto_align_all(self):
        """학습된 모델이 있으면 딥러닝 앙상블 매칭, 없으면 단일 템플릿 매칭을 사용한다."""
        if self._selected_idx < 0: return

        has_model = bool(self._trained_models)

        # 학습 모델이 없을 때 현재 선택 이미지의 크롭을 단일 참조로 사용
        if not has_model:
            try:
                f0 = self.app.files[self._selected_idx]
                img = f0["image"]
                if f0.get("angle", 0) != 0:
                    img = img.rotate(f0["angle"], resample=Image.BICUBIC, expand=True)
                x, y, w, h = self.app.crop_rect
                self._ref_template = np.array(img.crop((x, y, x+w, y+h)).convert("L"))
            except Exception:
                messagebox.showwarning("알림",
                    "먼저 기준 사진의 크롭 영역을 지정하거나 '🧠 크롭 영역 학습'을 먼저 실행하세요.")
                return

        # Progress popup
        progress = ctk.CTkToplevel(self)
        mode_text = ("YOLOv8 딥러닝 탐지 적용 중..."
                     if has_model else "기본 템플릿 매칭 적용 중...")
        progress.title("크롭 자동 지정 중")
        progress.geometry("420x160")
        progress.grab_set()
        ctk.CTkLabel(progress, text=mode_text,
                     font=ctk.CTkFont(size=13)).pack(pady=20)
        pbar = ctk.CTkProgressBar(progress, width=340)
        pbar.set(0); pbar.pack(pady=10)

        import threading

        def run_align():
            total = len(self.app.files)
            for i, f in enumerate(self.app.files):
                # Template matching mode: skip reference image (already has crop set)
                if not has_model and i == self._selected_idx:
                    self.after(0, lambda v=(i+1)/total: pbar.set(v))
                    continue
                if has_model:
                    new_pos = self._find_subject_deep(i)
                else:
                    new_pos = self._find_subject_live(i)
                f["crop_rect"] = new_pos if new_pos else self._get_fallback_crop(f)
                self.after(0, lambda v=(i+1)/total: pbar.set(v))

            def finish():
                progress.destroy()
                if self._selected_idx >= 0 and self._selected_idx < len(self.app.files):
                    self.app.crop_rect = self.app.files[self._selected_idx].get("crop_rect")
                messagebox.showinfo("완료", "모든 사진에 크롭 자동 지정이 완료되었습니다.")
                self._draw_image()
                self._draw_crop()

            self.after(0, finish)

        threading.Thread(target=run_align, daemon=True).start()

    def _get_fallback_crop(self, f):
        img = f["image"]
        if f.get("angle", 0) != 0: img = img.rotate(f["angle"], resample=Image.BICUBIC, expand=True)
        dw, dh = img.size
        rx, ry, rw, rh = self.app.center_rel_rect
        tx, ty = int(dw/2 + rx*dw - (rw*dw/2)), int(dh/2 + ry*dh - (rh*dw/2))
        return (max(0, tx), max(0, ty), int(rw*dw), int(rh*dh))

    def _find_subject_live(self, idx):
        """High-speed AI matching using downscaling."""
        try:
            f = self.app.files[idx]
            img_pil = f["image"]
            if f.get("angle", 0) != 0:
                img_pil = img_pil.rotate(f["angle"], resample=Image.BICUBIC, expand=True)
            
            # Speed optimization: Downscale for matching
            # Matching a 1/4 size image is roughly 16x faster
            scale = 0.25
            tw, th = self._ref_template.shape[1], self._ref_template.shape[0]
            
            # Resize template
            small_temp = cv2.resize(self._ref_template, (0,0), fx=scale, fy=scale)
            
            # Resize target image (convert to grayscale first)
            gray = np.array(img_pil.convert("L"))
            small_gray = cv2.resize(gray, (0,0), fx=scale, fy=scale)
            
            # Match template on smaller image
            res = cv2.matchTemplate(small_gray, small_temp, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(res)
            
            if max_val > 0.5:
                # Scale coordinates back to original size
                orig_x = int(max_loc[0] / scale)
                orig_y = int(max_loc[1] / scale)
                return (orig_x, orig_y, tw, th)
        except Exception as e:
            print(f"AI matching error: {e}")
        return None

    def _find_subject_deep(self, idx):
        """YOLOv8 모델을 사용하여 객체 탐지 및 크롭 영역 자동 지정."""
        if not self._trained_models:
            return self._find_subject_live(idx)

        try:
            f = self.app.files[idx]
            img_pil = f["image"]
            if f.get("angle", 0) != 0:
                img_pil = img_pil.rotate(f["angle"], resample=Image.BICUBIC, expand=True)

            best_result = None
            best_conf = 0.0
            best_model_entry = None

            for model_entry in self._trained_models:
                try:
                    model = model_entry["yolo"]
                    board_name = model_entry.get("name", "?")
                    results = model.predict(img_pil, conf=0.10, verbose=False)

                    if len(results) > 0 and len(results[0].boxes) > 0:
                        boxes = results[0].boxes
                        confs = boxes.conf.tolist()
                        max_conf = max(confs)
                        best_idx = confs.index(max_conf)
                        xyxy = boxes.xyxy[best_idx].tolist()
                        print(f"[YOLO] File {idx} / Model '{board_name}': conf={max_conf:.3f}, box={xyxy}")

                        if max_conf > best_conf:
                            best_conf = max_conf
                            x1, y1, x2, y2 = xyxy
                            best_result = (int(x1), int(y1), int(x2-x1), int(y2-y1))
                            best_model_entry = model_entry
                    else:
                        # Even below conf=0.10, check which model is most confident
                        results_low = model.predict(img_pil, conf=0.001, verbose=False)
                        if len(results_low) > 0 and len(results_low[0].boxes) > 0:
                            max_low = max(results_low[0].boxes.conf.tolist())
                            print(f"[YOLO] File {idx} / Model '{board_name}': best conf={max_low:.4f} (below threshold)")
                            if max_low > best_conf:
                                best_conf = max_low
                                best_model_entry = model_entry
                        else:
                            print(f"[YOLO] File {idx} / Model '{board_name}': No detections at all")
                except Exception as me:
                    print(f"[YOLO] Model '{model_entry.get('name')}' error: {me}")

            if best_result:
                print(f"[YOLO] File {idx}: YOLO detected, conf={best_conf:.3f} → {best_result}")
                return best_result

            # YOLO failed — use avg_bbox fallback from the most confident model
            if best_model_entry and best_model_entry.get("avg_bbox"):
                avg = best_model_entry["avg_bbox"]
                print(f"[YOLO] File {idx}: YOLO low conf ({best_conf:.4f}), using avg_bbox from '{best_model_entry['name']}': {avg}")
                return tuple(avg)

            print(f"[YOLO] File {idx}: No fallback available")
            return None

        except Exception as e:
            print(f"[AI YOLO] Error: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _on_mouse_wheel(self, event):
        if self._selected_idx < 0: return
        factor = 1.2 if event.delta > 0 else 0.8333
        new_zoom = self._zoom_level * factor
        if 0.05 <= new_zoom <= 40:
            mx, my = event.x, event.y
            cw, ch = self.canvas.winfo_width(), self.canvas.winfo_height()
            self._pan_offset[0] = factor * self._pan_offset[0] + (1 - factor) * (mx - cw/2)
            self._pan_offset[1] = factor * self._pan_offset[1] + (1 - factor) * (my - ch/2)
            self._zoom_level = new_zoom
            self._draw_image(); self._draw_crop()

    def _on_pan_start(self, event):
        self._last_mouse = (event.x, event.y)
        self.canvas.configure(cursor="fleur")

    def _on_pan_move(self, event):
        dx, dy = event.x - self._last_mouse[0], event.y - self._last_mouse[1]
        self._pan_offset[0] += dx; self._pan_offset[1] += dy
        self._last_mouse = (event.x, event.y)
        self._draw_image(); self._draw_crop()

    def _on_pan_end(self, event): self.canvas.configure(cursor="crosshair")
    def _canvas_to_img(self, ex, ey): return (ex - self._img_offset[0]) / self._display_scale, (ey - self._img_offset[1]) / self._display_scale

    def _on_press(self, event):
        if self._selected_idx < 0: return
        ix, iy = self._canvas_to_img(event.x, event.y)
        if self.app.crop_rect:
            x, y, w, h = self.app.crop_rect
            hs = 15 / self._display_scale
            corners = {"nw": (x, y), "ne": (x+w, y), "sw": (x, y+h), "se": (x+w, y+h)}
            for name, (cx, cy) in corners.items():
                if abs(ix-cx) < hs and abs(iy-cy) < hs:
                    self._resizing = name; self._drag_data = {"ox":x, "oy":y, "ow":w, "oh":h, "sx":ix, "sy":iy}
                    return
            if x <= ix <= x+w and y <= iy <= y+h:
                self._resizing = "move"; self._drag_data = {"ox":x, "oy":y, "ow":w, "oh":h, "sx":ix, "sy":iy}
                return
        self._resizing = "new"; self._drag_data = {"sx":ix, "sy":iy}
        self.app.crop_rect = (int(ix), int(iy), 1, 1); self._draw_crop()

    def _on_drag(self, event):
        if self._resizing is None: return
        ix, iy = self._canvas_to_img(event.x, event.y)
        f, d = self.app.files[self._selected_idx], self._drag_data
        dx, dy = ix - d["sx"], iy - d["sy"]
        if self._resizing == "move":
            self.app.crop_rect = (int(max(0, min(f["w"]-d["ow"], d["ox"]+dx))), int(max(0, min(f["h"]-d["oh"], d["oy"]+dy))), d["ow"], d["oh"])
        elif self._resizing == "new":
            nx, ny = max(0, min(d["sx"], ix)), max(0, min(d["sy"], iy))
            self.app.crop_rect = (int(nx), int(ny), int(max(1, min(f["w"]-nx, abs(ix-d["sx"])))), int(max(1, min(f["h"]-ny, abs(iy-d["sy"])))))
        else:
            x, y, w, h = d["ox"], d["oy"], d["ow"], d["oh"]
            if "n" in self._resizing: ny = max(0, int(y+dy)); nh = y+h-ny; (y, h) = (ny, nh) if nh > 0 else (y, h)
            if "s" in self._resizing: nh = max(1, int(h+dy)); h = nh if y+nh <= f["w"] else h
            if "w" in self._resizing: nx = max(0, int(x+dx)); nw = x+w-nx; (x, w) = (nx, nw) if nw > 0 else (x, w)
            if "e" in self._resizing: nw = max(1, int(w+dx)); w = nw if x+nw <= f["w"] else w
            self.app.crop_rect = (x, y, w, h)
        self._draw_crop()

    def _on_release(self, event): self._resizing = None
    def _on_canvas_resize(self, event=None):
        if self._selected_idx >= 0: self._draw_image(); self._draw_crop()
    def _on_rotate(self, val):
        if self._selected_idx >= 0:
            self.app.files[self._selected_idx]["angle"] = float(val); self.rot_lbl.configure(text=f"{float(val):.1f}°")
            self._draw_image(); self._draw_crop()
    def _reset_crop(self):
        if self._selected_idx >= 0:
            f = self.app.files[self._selected_idx]; d = min(f["w"], f["h"]) // 2
            self.app.crop_rect = ((f["w"]-d)//2, (f["h"]-d)//2, d, d); self._draw_crop()
    def _go_next(self):
        if self.app.files and (self.app.files[0].get("crop_rect") or self.app.crop_rect): self.app.show_step2()
        else: messagebox.showwarning("주의", "사진을 추가하고 첫 번째 사진의 크롭 영역을 지정해 주세요.")
    @staticmethod
    def _fmt_bytes(b):
        for u in ["B", "KB", "MB", "GB"]:
            if b < 1024: return f"{b:.1f} {u}"
            b /= 1024
        return f"{b:.1f} TB"

    def get_output_size(self):
        DPI = 96
        try: w = float(self.out_w_var.get())
        except: w = 1.5
        try: h = float(self.out_h_var.get())
        except: h = 1.5
        return (int(w*DPI), int(h*DPI))
