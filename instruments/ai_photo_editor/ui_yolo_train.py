import os
import sys
import shutil

class DummyStream:
    def write(self, x):
        pass
    def flush(self):
        pass

if sys.stdout is None or not hasattr(sys.stdout, "write"):
    sys.stdout = DummyStream()
if sys.stderr is None or not hasattr(sys.stderr, "write"):
    sys.stderr = DummyStream()
import json
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
import customtkinter as ctk
from PIL import Image, ImageTk, ImageOps

class YoloTrainDialog(ctk.CTkToplevel):
    def __init__(self, parent, app, on_train_complete):
        super().__init__(parent)
        self.app = app
        self.on_train_complete = on_train_complete
        
        self.title(self.app.app.t("yolo_train_title", "🧠 딥러닝 커스텀 모델 학습 (YOLO)"))
        self.geometry("1400x900")
        self.minsize(1200, 700)
        self.grab_set()

        # State
        self.classes = []         # List of class names (max 5)
        self.class_images = {}    # class_name -> List of image paths
        self.active_class = ""    # Currently selected class
        self.angles = {}          # path -> angle (float)
        self.annotations = {}     # path -> {"class": str, "bbox": (x, y, w, h)}
        self._sel_idx = -1
        
        # Project Persistence
        self.projects = {}        # name -> {classes, images, annotations, angles, trained_count, model_path}
        self.current_project_name = ""
        self.projects_file = os.path.join(os.getcwd(), "yolo_projects.json")

        # Drawing & View state
        self._display_scale = 1.0
        self._zoom_level = 1.0
        self._pan_offset = [0, 0]
        self._last_mouse = (0, 0)
        self._img_offset = (0, 0)
        self._canvas_photo = None
        self._resizing = None
        self._drag_data = {}
        self._crop_rect = None

        self._build_ui()
        self._load_projects_from_file()

    def _build_ui(self):
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # ── LEFT PANEL (Classes & Files) ──
        left = ctk.CTkFrame(self, width=320, corner_radius=0, fg_color=("#e8e8e8", "#1a1d24"))
        left.grid(row=0, column=0, sticky="nsew")
        left.grid_propagate(False)
        left.grid_rowconfigure(6, weight=1)  # file_listbox row expands

        # ── Unified Board List Section ──
        # Header
        hdr_frame = ctk.CTkFrame(left, fg_color="transparent")
        hdr_frame.grid(row=0, column=0, padx=15, pady=(15, 4), sticky="ew")
        ctk.CTkLabel(hdr_frame, text=self.app.app.t("yolo_saved_list", "📂 학습 보드 리스트"),
                     font=ctk.CTkFont(weight="bold")).pack(side="left")

        # Entry row: [입력창] [추가]
        add_frame = ctk.CTkFrame(left, fg_color="transparent")
        add_frame.grid(row=1, column=0, padx=15, pady=(0, 6), sticky="ew")
        self.class_entry = ctk.CTkEntry(add_frame,
                                        placeholder_text=self.app.app.t("yolo_placeholder_board", "예: 보드타입A"))
        self.class_entry.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkButton(add_frame, text=self.app.app.t("btn_add", "추가"),
                      width=52, command=self._add_class).pack(side="right")

        # Unified board list (projects + counts combined)
        self.project_listbox = ctk.CTkScrollableFrame(left, height=200,
                                                      fg_color=("#f0f0f0", "#14171c"))
        self.project_listbox.grid(row=2, column=0, padx=15, pady=(0, 8), sticky="ew")

        # Image add section - label on row=3, button on row=4
        ctk.CTkLabel(left, text=self.app.app.t("yolo_step2_add", "학습 이미지 추가"),
                     font=ctk.CTkFont(weight="bold")).grid(row=3, column=0, padx=15,
                                                           pady=(8, 2), sticky="w")

        drop_btn = ctk.CTkButton(left,
                                  text=self.app.app.t("yolo_file_select", "파일 선택 (또는 드래그 앤 드롭)"),
                                  height=34,
                                  fg_color="transparent", border_width=2, border_color="gray",
                                  hover_color=("#d0d0ff", "#2a2d44"), command=self._load_files)
        drop_btn.grid(row=4, column=0, padx=15, pady=(0, 6), sticky="ew")

        # TkinterDnD Drag and Drop
        try:
            from tkinterdnd2 import DND_FILES
            left.drop_target_register(DND_FILES)
            left.dnd_bind('<<Drop>>', self._on_dnd_drop)
            drop_btn.drop_target_register(DND_FILES)
            drop_btn.dnd_bind('<<Drop>>', self._on_dnd_drop)
        except Exception as e:
            print(f"[Drag&Drop Error] {e}")

        # Image list header with 선택 삭제 button
        list_hdr = ctk.CTkFrame(left, fg_color="transparent")
        list_hdr.grid(row=5, column=0, padx=15, pady=(4, 0), sticky="ew")
        ctk.CTkLabel(list_hdr, text=self.app.app.t("yolo_step3_list", "이미지 리스트"),
                     font=ctk.CTkFont(weight="bold")).pack(side="left")
        ctk.CTkButton(list_hdr, text="✂️ 선택 삭제", width=80, height=24,
                      fg_color="#ef4444", hover_color="#dc2626",
                      font=ctk.CTkFont(size=11),
                      command=self._del_selected_imgs).pack(side="right")

        self.file_listbox = ctk.CTkScrollableFrame(left)
        self.file_listbox.grid(row=6, column=0, padx=15, pady=5, sticky="nsew")

        self.progress_lbl = ctk.CTkLabel(left,
                                          text=self.app.app.t("yolo_progress_0", "진행률: 0 / 0 완료"))
        self.progress_lbl.grid(row=7, column=0, pady=6)

        # ── RIGHT PANEL (Workspace) ──
        right = ctk.CTkFrame(self, fg_color="transparent")
        right.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)
        right.grid_rowconfigure(1, weight=1)
        right.grid_columnconfigure(0, weight=1)

        hdr = ctk.CTkFrame(right, fg_color=("#e0e0e0", "#1e2028"), corner_radius=10)
        hdr.grid(row=0, column=0, sticky="ew", pady=(0, 10))

        self.current_file_lbl = ctk.CTkLabel(hdr, text=self.app.app.t("yolo_load_img", "이미지를 불러오세요"), font=ctk.CTkFont(size=16, weight="bold"))
        self.current_file_lbl.pack(side="left", padx=15, pady=10)
        
        self.train_btn = ctk.CTkButton(
            hdr, text=self.app.app.t("yolo_start_train", "🚀 딥러닝 학습 시작"), 
            width=180, height=36, corner_radius=8,
            fg_color="#10b981", hover_color="#059669", 
            font=ctk.CTkFont(size=14, weight="bold"), 
            command=self._start_training)
        self.train_btn.pack(side="right", padx=(5, 15), pady=10)

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
        self.canvas.bind("<MouseWheel>", self._on_mouse_wheel)
        self.canvas.bind("<ButtonPress-3>", self._on_pan_start)
        self.canvas.bind("<B3-Motion>", self._on_pan_move)
        self.canvas.bind("<ButtonPress-2>", self._on_pan_start)
        self.canvas.bind("<B2-Motion>", self._on_pan_move)
        self.canvas.bind("<ButtonRelease-2>", self._on_pan_end)

        # Nav footer
        nav = ctk.CTkFrame(right, fg_color="transparent")
        nav.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        
        ctk.CTkButton(nav, text=self.app.app.t("yolo_prev", "◀ 이전 (A)"), width=100, command=self._prev_img).pack(side="left", padx=5)
        
        rot_frame = ctk.CTkFrame(nav, fg_color="transparent")
        rot_frame.pack(side="left", padx=20)
        ctk.CTkLabel(rot_frame, text=self.app.app.t("yolo_horiz_adj", "수평 보정:")).pack(side="left", padx=5)
        
        ctk.CTkButton(rot_frame, text="↻", width=28, height=24, fg_color="transparent", border_width=1, command=lambda: self._step_rotate(-0.1)).pack(side="left", padx=2)
        
        self.rot_slider = ctk.CTkSlider(rot_frame, from_=-15, to=15, width=130, command=self._on_rotate)
        self.rot_slider.set(0)
        self.rot_slider.pack(side="left", padx=5)
        
        ctk.CTkButton(rot_frame, text="↺", width=28, height=24, fg_color="transparent", border_width=1, command=lambda: self._step_rotate(0.1)).pack(side="left", padx=2)
        
        self.rot_lbl = ctk.CTkLabel(rot_frame, text="0.0°", width=35)
        self.rot_lbl.pack(side="left", padx=5)

        ctk.CTkButton(nav, text=self.app.app.t("yolo_del_cur", "🗑️ 현재 사진 삭제"), width=120, fg_color="#ef4444", hover_color="#dc2626", command=self._del_current_img).pack(side="left", padx=20)
        
        ctk.CTkButton(nav, text=self.app.app.t("yolo_next", "다음 (D) ▶"), width=100, command=self._next_img).pack(side="right", padx=5)
        
        self.bind("<A>", lambda e: self._prev_img())
        self.bind("<a>", lambda e: self._prev_img())
        self.bind("<D>", lambda e: self._next_img())
        self.bind("<d>", lambda e: self._next_img())
        
        def on_enter(event):
            try:
                focused = self.focus_get()
                entry_widget = getattr(self.class_entry, "_entry", self.class_entry)
                if focused and focused == entry_widget:
                    self._add_class()
                else:
                    self._next_img()
            except Exception:
                self._next_img()
        self.bind("<Return>", on_enter)

    def _add_class(self):
        """Add or load a board project. Each board name = one project + one class."""
        name = self.class_entry.get().strip()
        if not name: return

        self.class_entry.delete(0, 'end')

        # If board already exists as a saved project → just load it
        if name in self.projects:
            self._load_project(name)
            return

        # Create brand-new project with this board name as both project and class
        self._save_current_annotation()
        self._update_current_project_data()

        self.current_project_name = name
        self.classes = [name]
        self.class_images = {name: []}
        self.annotations = {}
        self.angles = {}
        self.active_class = name
        self._sel_idx = -1
        self.canvas.delete("all")
        self.current_file_lbl.configure(text=f"[{name}] 이미지를 추가하세요")

        self._update_current_project_data()
        self._update_project_list_ui()
        self._update_file_list()

    def _update_class_ui(self):
        """No-op: class list is now embedded in the unified project list."""
        pass

    def _set_active_class(self, class_name):
        """Redirect: loading a board = loading its project."""
        if class_name in self.projects:
            self._load_project(class_name)
        else:
            self._save_current_annotation()
            self.active_class = class_name
            self._sel_idx = -1
            self._update_project_list_ui()
            self._update_file_list()
            if self.class_images.get(class_name):
                self._select_img(0)
            else:
                self.canvas.delete("all")
                self.current_file_lbl.configure(text=f"[{class_name}] 이미지를 추가해주세요")

    def _del_board(self, name):
        """Delete an entire board project from both state and saved file."""
        if not messagebox.askyesno("삭제 확인", f"'{name}' 보드를 삭제하시겠습니까?\n(저장된 이미지 목록 및 학습 정보가 모두 삭제됩니다.)"):
            return
        if name in self.projects:
            del self.projects[name]
        # If it was the active board, clear state
        if self.current_project_name == name:
            self.current_project_name = ""
            self.classes = []
            self.class_images = {}
            self.annotations = {}
            self.angles = {}
            self.active_class = ""
            self._sel_idx = -1
            self.canvas.delete("all")
            self.current_file_lbl.configure(text="보드를 선택하거나 새로 추가하세요")
        self._save_projects_to_file()
        self._update_project_list_ui()
        self._update_file_list()

    def _on_dnd_drop(self, event):
        import re
        raw = event.data
        paths = re.findall(r'\{(.+?)\}', raw) or raw.split()
        valid_ext = ('.png', '.jpg', '.jpeg', '.bmp', '.webp')
        valid_paths = [p.strip("{}") for p in paths if p.lower().endswith(valid_ext)]
        if valid_paths:
            self._add_images(valid_paths)

    def _load_files(self):
        paths = filedialog.askopenfilenames(title="학습 이미지 선택", filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp")])
        if paths: self._add_images(paths)

    def _add_images(self, paths):
        if not self.active_class:
            messagebox.showwarning("주의", "먼저 클래스를 선택하세요.")
            return

        # Ensure project name exists for folder creation
        if not self.current_project_name:
            self.current_project_name = "-".join(self.classes[:2]) + ( "..." if len(self.classes)>2 else "")
        
        # Create local images directory for the project
        project_dir = os.path.join(os.getcwd(), "projects_data", self.current_project_name.replace(" ", "_"))
        img_save_dir = os.path.join(project_dir, "images", self.active_class)
        os.makedirs(img_save_dir, exist_ok=True)

        for p in paths:
            try:
                # Copy image to local project folder
                fname = os.path.basename(p)
                local_p = os.path.join(img_save_dir, fname)
                
                if p != local_p: # Avoid error if copying to itself
                    shutil.copy2(p, local_p)
                
                # Store relative path for portability
                rel_p = os.path.relpath(local_p, os.getcwd())
                
                if rel_p not in self.class_images[self.active_class]:
                    self.class_images[self.active_class].append(rel_p)
            except Exception as e:
                print(f"[Image Copy Error] {p}: {e}")
                
        self._update_file_list()
        self._update_current_project_data()
        if self._sel_idx < 0 and self.class_images[self.active_class]:
            self._select_img(0)

    def _update_file_list(self):
        for w in self.file_listbox.winfo_children(): w.destroy()
        self._check_vars = []  # track checkbox variables
        if not self.active_class:
            self.progress_lbl.configure(text="클래스를 선택하세요")
            return

        imgs = self.class_images[self.active_class]
        completed = sum(1 for p in imgs if p in self.annotations)
        self.progress_lbl.configure(text=f"[{self.active_class}] 진행률: {completed} / {len(imgs)} 완료")

        for i, p in enumerate(imgs):
            name = os.path.basename(p)
            status = "✅" if p in self.annotations else "⏳"
            is_sel = (i == self._sel_idx)
            bg = ("#d0d0ff", "#2a2d44") if is_sel else "transparent"

            row = ctk.CTkFrame(self.file_listbox, fg_color=bg, corner_radius=4)
            row.pack(fill="x", pady=1, padx=2)

            # Checkbox for multi-select delete
            import tkinter as _tk
            var = _tk.BooleanVar(value=False)
            self._check_vars.append((var, i))
            chk = ctk.CTkCheckBox(row, variable=var, text="", width=20,
                                   checkbox_width=16, checkbox_height=16)
            chk.pack(side="left", padx=(4, 0))

            # Filename label – click to select image
            lbl = ctk.CTkLabel(row, text=f"{status} {name}", anchor="w", cursor="hand2")
            lbl.pack(side="left", padx=4, fill="x", expand=True)
            lbl.bind("<Button-1>", lambda e, idx=i: self._select_img(idx))
            row.bind("<Button-1>", lambda e, idx=i: self._select_img(idx))

    def _del_current_img(self):
        if not self.active_class: return
        imgs = self.class_images[self.active_class]
        if self._sel_idx < 0 or self._sel_idx >= len(imgs): return
        p = imgs[self._sel_idx]
        if messagebox.askyesno("삭제 확인", f"현재 사진({os.path.basename(p)})을 목록에서 삭제하시겠습니까?"):
            imgs.pop(self._sel_idx)
            if p in self.annotations: del self.annotations[p]
            if p in self.angles: del self.angles[p]

            if len(imgs) == 0:
                self._sel_idx = -1
                self.canvas.delete("all")
                self.current_file_lbl.configure(text=f"[{self.active_class}] 이미지를 추가해주세요")
                self._update_file_list()
            else:
                new_idx = min(self._sel_idx, len(imgs) - 1)
                self._sel_idx = -1
                self._select_img(new_idx)

    def _del_selected_imgs(self):
        """Delete all checked images from the file list."""
        if not self.active_class: return
        if not hasattr(self, '_check_vars') or not self._check_vars: return
        imgs = self.class_images[self.active_class]

        # Collect indices to delete (in reverse order to not shift indices)
        to_del = [i for var, i in self._check_vars if var.get()]
        if not to_del:
            messagebox.showinfo("알림", "삭제할 이미지를 체크해주세요.")
            return

        if not messagebox.askyesno("삭제 확인", f"선택한 {len(to_del)}개의 이미지를 목록에서 삭제하시겠습니까?"):
            return

        for i in sorted(to_del, reverse=True):
            if i < len(imgs):
                p = imgs[i]
                imgs.pop(i)
                if p in self.annotations: del self.annotations[p]
                if p in self.angles: del self.angles[p]

        # Adjust selected index
        if not imgs:
            self._sel_idx = -1
            self.canvas.delete("all")
            self.current_file_lbl.configure(text=f"[{self.active_class}] 이미지를 추가해주세요")
        else:
            self._sel_idx = min(self._sel_idx, len(imgs) - 1)
            if self._sel_idx < 0: self._sel_idx = 0

        self._update_file_list()
        self._update_current_project_data()
        if imgs and self._sel_idx >= 0:
            self._select_img(self._sel_idx)

    def _step_rotate(self, delta):
        if not self.active_class: return
        imgs = self.class_images[self.active_class]
        if self._sel_idx < 0 or self._sel_idx >= len(imgs): return
        p = imgs[self._sel_idx]
        current = self.angles.get(p, 0.0)
        new_val = max(-15.0, min(15.0, current + delta))
        self.rot_slider.set(new_val)
        self._on_rotate(new_val)

    def _on_rotate(self, val):
        if not self.active_class: return
        imgs = self.class_images[self.active_class]
        if self._sel_idx >= 0 and self._sel_idx < len(imgs):
            p = imgs[self._sel_idx]
            self.angles[p] = float(val)
            self.rot_lbl.configure(text=f"{float(val):.1f}°")
            self._reload_cur_pil()
            self._draw_image()
            self._draw_crop()

    def _reload_cur_pil(self):
        if not self.active_class: return
        imgs = self.class_images[self.active_class]
        if self._sel_idx < 0 or self._sel_idx >= len(imgs): return
        p = imgs[self._sel_idx]
        try:
            pil_img = ImageOps.exif_transpose(Image.open(p))
            if pil_img.mode not in ("RGB", "RGBA"): pil_img = pil_img.convert("RGB")
            ang = self.angles.get(p, 0)
            if ang != 0:
                pil_img = pil_img.rotate(ang, resample=Image.BICUBIC, expand=True)
            self._cur_pil = pil_img
        except Exception as e:
            print(f"Error loading {p}: {e}")

    def _select_img(self, idx):
        if not self.active_class: return
        imgs = self.class_images[self.active_class]
        if idx < 0 or idx >= len(imgs): return
        
        # Save current annotation before switching
        self._save_current_annotation()
        
        self._sel_idx = idx
        p = imgs[idx]
        self.current_file_lbl.configure(text=f"[{self.active_class}] [{idx+1}/{len(imgs)}] {os.path.basename(p)}")
        
        if p in self.annotations:
            self._crop_rect = self.annotations[p]["bbox"]
        else:
            self._crop_rect = None
            
        ang = self.angles.get(p, 0)
        self.rot_slider.set(ang)
        self.rot_lbl.configure(text=f"{ang:.1f}°")
        
        # Do not reset zoom and pan here to maintain them across images
            
        self._reload_cur_pil()
        if hasattr(self, '_cur_pil'):
            self._draw_image()
            self._draw_crop()
        self._update_file_list()
        
        # Scroll the selected item to the very top of the scrollable frame
        try:
            n_imgs = len(imgs)
            if n_imgs > 0 and hasattr(self.file_listbox, "_parent_canvas"):
                fraction = idx / n_imgs
                self.file_listbox._parent_canvas.yview_moveto(fraction)
        except Exception as e:
            pass

    def _save_current_annotation(self):
        if not self.active_class: return
        imgs = self.class_images[self.active_class]
        if self._sel_idx >= 0 and self._sel_idx < len(imgs) and self._crop_rect:
            p = imgs[self._sel_idx]
            self.annotations[p] = {
                "class": self.active_class,
                "bbox": self._crop_rect
            }

    def _prev_img(self): self._select_img(self._sel_idx - 1)
    def _next_img(self): self._select_img(self._sel_idx + 1)

    # ── Pan & Zoom ──
    def _on_mouse_wheel(self, event):
        if self._sel_idx < 0: return
        factor = 1.2 if event.delta > 0 else 0.8333
        new_zoom = self._zoom_level * factor
        if 0.05 <= new_zoom <= 40:
            mx, my = event.x, event.y
            cw, ch = self.canvas.winfo_width(), self.canvas.winfo_height()
            self._pan_offset[0] = factor * self._pan_offset[0] + (1 - factor) * (mx - cw/2)
            self._pan_offset[1] = factor * self._pan_offset[1] + (1 - factor) * (my - ch/2)
            self._zoom_level = new_zoom
            self._draw_image()
            self._draw_crop()

    def _on_pan_start(self, event):
        self._last_mouse = (event.x, event.y)
        self.canvas.configure(cursor="fleur")

    def _on_pan_move(self, event):
        dx, dy = event.x - self._last_mouse[0], event.y - self._last_mouse[1]
        self._pan_offset[0] += dx
        self._pan_offset[1] += dy
        self._last_mouse = (event.x, event.y)
        self._draw_image()
        self._draw_crop()

    def _on_pan_end(self, event):
        self.canvas.configure(cursor="crosshair")

    def _canvas_to_img(self, ex, ey):
        return (ex - self._img_offset[0]) / self._display_scale, (ey - self._img_offset[1]) / self._display_scale

    # ── Canvas Drawing (Similar to step1) ──
    def _draw_image(self):
        cw, ch = self.canvas.winfo_width(), self.canvas.winfo_height()
        if cw < 10 or not hasattr(self, '_cur_pil'): return
        dw, dh = self._cur_pil.size
        self._display_scale = min(cw / dw, ch / dh) * self._zoom_level
        fw, fh = int(dw * self._display_scale), int(dh * self._display_scale)
        ox = (cw - fw) // 2 + self._pan_offset[0]
        oy = (ch - fh) // 2 + self._pan_offset[1]
        self._img_offset = (ox, oy)
        disp = self._cur_pil.resize((fw, fh), Image.LANCZOS)
        self._canvas_photo = ImageTk.PhotoImage(disp)
        self.canvas.delete("img")
        self.canvas.create_image(ox, oy, anchor="nw", image=self._canvas_photo, tags="img")

    def _draw_crop(self):
        self.canvas.delete("crop")
        if not self._crop_rect: return
        x, y, w, h = self._crop_rect
        s, (ox, oy) = self._display_scale, self._img_offset
        cx, cy, cw, ch = ox + x*s, oy + y*s, w*s, h*s
        can_w, can_h = self.canvas.winfo_width(), self.canvas.winfo_height()
        
        self.canvas.create_rectangle(0, 0, can_w, cy, fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(0, cy+ch, can_w, can_h, fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(0, cy, cx, cy+ch, fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(cx+cw, cy, can_w, cy+ch, fill="black", stipple="gray50", outline="", tags="crop")
        self.canvas.create_rectangle(cx, cy, cx+cw, cy+ch, outline="#3b82f6", width=2, tags="crop")
        
        c_name = self.active_class
        if c_name:
            self.canvas.create_text(cx, cy-10, text=c_name, fill="#3b82f6", anchor="sw", font=("Segoe UI", 12, "bold"), tags="crop")

        hs = 8
        for (hx, hy) in [(cx, cy), (cx+cw, cy), (cx, cy+ch), (cx+cw, cy+ch)]:
            self.canvas.create_rectangle(hx-hs, hy-hs, hx+hs, hy+hs, fill="#3b82f6", outline="white", tags="crop")

    def _on_press(self, event):
        if self._sel_idx < 0: return
        ix, iy = self._canvas_to_img(event.x, event.y)
        
        if self._crop_rect:
            x, y, w, h = self._crop_rect
            hs = 15 / self._display_scale
            corners = {"nw": (x, y), "ne": (x+w, y), "sw": (x, y+h), "se": (x+w, y+h)}
            for name, (cx, cy) in corners.items():
                if abs(ix-cx) < hs and abs(iy-cy) < hs:
                    self._resizing = name; self._drag_data = {"ox":x, "oy":y, "ow":w, "oh":h, "sx":ix, "sy":iy}
                    return
            if x <= ix <= x+w and y <= iy <= y+h:
                self._resizing = "move"; self._drag_data = {"ox":x, "oy":y, "ow":w, "oh":h, "sx":ix, "sy":iy}
                return
                
        self._resizing = "new"
        self._drag_data = {"sx":ix, "sy":iy}
        self._crop_rect = (int(ix), int(iy), 1, 1)
        self._draw_crop()

    def _on_drag(self, event):
        if not self._resizing: return
        ix, iy = self._canvas_to_img(event.x, event.y)
        dw, dh = self._cur_pil.size
        d = self._drag_data
        dx, dy = ix - d["sx"], iy - d["sy"]
        
        if self._resizing == "move":
            self._crop_rect = (int(max(0, min(dw-d["ow"], d["ox"]+dx))), int(max(0, min(dh-d["oh"], d["oy"]+dy))), d["ow"], d["oh"])
        elif self._resizing == "new":
            nx, ny = max(0, min(d["sx"], ix)), max(0, min(d["sy"], iy))
            self._crop_rect = (int(nx), int(ny), int(max(1, min(dw-nx, abs(ix-d["sx"])))), int(max(1, min(dh-ny, abs(iy-d["sy"])))))
        else:
            x, y, w, h = d["ox"], d["oy"], d["ow"], d["oh"]
            if "n" in self._resizing: ny = max(0, int(y+dy)); nh = y+h-ny; (y, h) = (ny, nh) if nh > 0 else (y, h)
            if "s" in self._resizing: nh = max(1, int(h+dy)); h = nh if y+nh <= dh else h
            if "w" in self._resizing: nx = max(0, int(x+dx)); nw = x+w-nx; (x, w) = (nx, nw) if nw > 0 else (x, w)
            if "e" in self._resizing: nw = max(1, int(w+dx)); w = nw if x+nw <= dw else w
            self._crop_rect = (x, y, w, h)
        self._draw_crop()

    def _on_release(self, event):
        self._resizing = None
        self._save_current_annotation()
        self._update_file_list()
        self._update_current_project_data() # Update project in memory/file

    def _on_resize(self, event=None):
        if self._sel_idx >= 0: self._draw_image(); self._draw_crop()


    # ── Project Management Implementation ──
    def _load_projects_from_file(self):
        if os.path.exists(self.projects_file):
            try:
                import json
                with open(self.projects_file, "r", encoding="utf-8") as f:
                    self.projects = json.load(f)
            except Exception as e:
                print(f"[Project Load] Error: {e}")
        self._update_project_list_ui()

    def _update_project_list_ui(self):
        for w in self.project_listbox.winfo_children(): w.destroy()

        if not self.projects:
            ctk.CTkLabel(self.project_listbox, text="추가된 보드가 없습니다",
                         text_color="gray", font=ctk.CTkFont(size=12)).pack(pady=20)
            return

        for name, info in self.projects.items():
            is_active = (name == self.current_project_name)
            bg = ("#d0d0ff", "#2a2d44") if is_active else "transparent"

            row = ctk.CTkFrame(self.project_listbox, fg_color=bg, corner_radius=6, cursor="hand2")
            row.pack(fill="x", pady=2, padx=2)

            # Board icon + name
            lbl = ctk.CTkLabel(row, text=f"📁  {name}", anchor="w",
                               font=ctk.CTkFont(weight="bold" if is_active else "normal"))
            lbl.pack(side="left", padx=8, pady=4, fill="x", expand=True)

            # Training count badge on right
            trained_count = info.get("trained_count", 0)
            if trained_count > 0:
                badge = ctk.CTkLabel(row,
                                     text=f"✅ {trained_count}개",
                                     text_color="#10b981",
                                     font=ctk.CTkFont(size=11))
            else:
                badge = ctk.CTkLabel(row, text="미학습",
                                     text_color="gray",
                                     font=ctk.CTkFont(size=11))
            badge.pack(side="right", padx=(4, 4))

            # Delete button
            del_btn = ctk.CTkButton(row, text="×", width=22, height=22,
                                    fg_color="#ef4444", hover_color="#dc2626",
                                    command=lambda x=name: self._del_board(x))
            del_btn.pack(side="right", padx=(0, 4))

            # Click row → load project
            for w in (row, lbl, badge):
                w.bind("<Button-1>", lambda e, x=name: self._load_project(x))

    def _load_project(self, name):
        if name not in self.projects: return
        
        self._save_current_annotation()
        info = self.projects[name]
        
        self.current_project_name = name
        self.classes = info.get("classes", [])
        self.class_images = info.get("class_images", {})
        self.annotations = info.get("annotations", {})
        self.angles = info.get("angles", {})
        
        self.active_class = self.classes[0] if self.classes else ""
        self._sel_idx = -1
        self.canvas.delete("all")
        
        self._update_project_list_ui()
        self._update_class_ui()
        self._update_file_list()
        
        trained_count = info.get("trained_count", 0)
        msg = f"'{name}' 항목을 불러왔습니다."
        if trained_count > 0:
            msg += f"\n(현재 {trained_count}개의 이미지가 학습되어 있습니다.)"
        
        messagebox.showinfo("프로젝트 로드", msg)
        
        if self.active_class and self.class_images.get(self.active_class):
            self._select_img(0)

    def _delete_project(self, name):
        if messagebox.askyesno("삭제 확인", f"'{name}' 학습 항목을 삭제하시겠습니까?"):
            if name in self.projects:
                del self.projects[name]
                if self.current_project_name == name:
                    self.current_project_name = ""
                    self.classes = []
                    self.class_images = {}
                    self.annotations = {}
                    self.angles = {}
                    self.active_class = ""
                self._save_projects_to_file()
                self._update_project_list_ui()
                self._update_class_ui()
                self._update_file_list()

    def _save_projects_to_file(self):
        try:
            import json
            with open(self.projects_file, "w", encoding="utf-8") as f:
                json.dump(self.projects, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"[Project Save] Error: {e}")

    def _start_new_project(self):
        if self.current_project_name:
            ans = messagebox.askyesnocancel(
                "학습 선택",
                f"현재 '{self.current_project_name}' 항목이 선택되어 있습니다.\n\n"
                f"- [예]: 현재 항목을 닫고 '새로운 학습 항목'을 새로 만듭니다.\n"
                f"- [아니오]: 현재 선택된 항목 '{self.current_project_name}'의 '학습을 이어서 진행'합니다.\n"
                f"- [취소]: 창을 닫고 작업을 계속합니다."
            )
            if ans is None:
                return
            elif ans is False:
                messagebox.showinfo("학습 이어가기", f"'{self.current_project_name}'의 학습 정보를 이어서 작업합니다. 우측 화면에서 이미지를 편집하거나 학습을 시작해 주세요.")
                return

        if self.classes and messagebox.askyesno("확인", "현재 작업 중인 내용을 정리하고 새로운 학습 항목을 만드시겠습니까?"):
            self._save_current_annotation()
            self._update_current_project_data()
            
            self.current_project_name = ""
            self.classes = []
            self.class_images = {}
            self.annotations = {}
            self.angles = {}
            self.active_class = ""
            self._sel_idx = -1
            self.canvas.delete("all")
            self._update_class_ui()
            self._update_file_list()
            self._update_project_list_ui()
            self.current_file_lbl.configure(text="새로운 클래스를 추가하세요")

    def _update_current_project_data(self, trained_count=None):
        if not self.classes: return
        
        # Determine project name (e.g., from classes)
        if not self.current_project_name:
            self.current_project_name = "-".join(self.classes[:2]) + ( "..." if len(self.classes)>2 else "")
        
        name = self.current_project_name
        prev_trained = self.projects.get(name, {}).get("trained_count", 0)
        
        self.projects[name] = {
            "classes": self.classes,
            "class_images": self.class_images,
            "annotations": self.annotations,
            "angles": self.angles,
            "trained_count": trained_count if trained_count is not None else prev_trained,
            "model_path": self.projects.get(name, {}).get("model_path", "")
        }
        self._save_projects_to_file()
        self._update_project_list_ui()

    # ── YOLO TRAINING EXECUTION ──
    def _start_training(self):
        self._save_current_annotation()
        if not self.classes:
            messagebox.showwarning("오류", "최소 1개의 클래스를 정의하세요.")
            return
        if not self.annotations:
            messagebox.showwarning("오류", "박스가 그려진(학습할) 이미지가 없습니다.")
            return
            
        ans = messagebox.askyesno("학습 시작", f"총 {len(self.annotations)}개의 이미지로 딥러닝(YOLO) 학습을 시작합니다.\n컴퓨터 성능에 따라 수 분에서 수십 분이 소요될 수 있습니다.\n진행하시겠습니까?")
        if not ans: return

        prog = ctk.CTkToplevel(self)
        prog.title("YOLO 학습 중")
        prog.geometry("400x250")
        prog.grab_set()
        
        ctk.CTkLabel(prog, text="딥러닝 모델 학습 중...", font=ctk.CTkFont(size=16, weight="bold")).pack(pady=20)
        status_lbl = ctk.CTkLabel(prog, text="데이터셋 준비 중...")
        status_lbl.pack()
        
        pbar = ctk.CTkProgressBar(prog, width=320)
        pbar.set(0)
        pbar.pack(pady=10)
        
        epoch_lbl = ctk.CTkLabel(prog, text="진행률: 준비 중", text_color="#10b981", font=ctk.CTkFont(weight="bold"))
        epoch_lbl.pack()
        
        # Prepare YOLO dataset
        def train_thread():
            try:
                save_name = self.current_project_name.replace(" ", "_")
                base_dir = os.path.join(os.getcwd(), "yolo_dataset", save_name)  # per-project dir
                if os.path.exists(base_dir): shutil.rmtree(base_dir)

                img_dir = os.path.join(base_dir, "images", "train")
                lbl_dir = os.path.join(base_dir, "labels", "train")
                os.makedirs(img_dir, exist_ok=True)
                os.makedirs(lbl_dir, exist_ok=True)
                
                # Create data.yaml
                yaml_path = os.path.join(base_dir, "data.yaml")
                with open(yaml_path, "w", encoding="utf-8") as f:
                    f.write(f"train: {os.path.abspath(img_dir)}\n")
                    f.write(f"val: {os.path.abspath(img_dir)}\n") # Use train as val for small datasets
                    f.write(f"nc: {len(self.classes)}\n")
                    f.write(f"names: {self.classes}\n")
                
                # Copy images and create labels
                self.after(0, lambda: status_lbl.configure(text="데이터셋 변환 및 학습 준비 중..."))
                
                from ultralytics import YOLO
                import torch
                
                total_anns = len(self.annotations)
                for i, (p, ann) in enumerate(self.annotations.items()):
                    c_name = ann["class"]
                    class_id = self.classes.index(c_name)
                    x, y, w, h = ann["bbox"]
                    
                    # Original image size
                    ang = self.angles.get(p, 0)
                    with Image.open(p) as tmp_img:
                        tmp_img = ImageOps.exif_transpose(tmp_img)
                        if ang != 0:
                            tmp_img = tmp_img.rotate(ang, resample=Image.BICUBIC, expand=True)
                        img_w, img_h = tmp_img.size
                        
                        # Save image to train dir
                        target_img_path = os.path.join(img_dir, f"img_{i}.jpg")
                        tmp_img.convert("RGB").save(target_img_path)
                    
                    # Convert to YOLO format (normalized cx, cy, w, h)
                    cx = (x + w/2) / img_w
                    cy = (y + h/2) / img_h
                    norm_w = w / img_w
                    norm_h = h / img_h
                    
                    label_path = os.path.join(lbl_dir, f"img_{i}.txt")
                    with open(label_path, "w") as f:
                        f.write(f"{class_id} {cx} {cy} {norm_w} {norm_h}\n")
                
                # Start YOLO training
                self.after(0, lambda: status_lbl.configure(text="YOLOv8 모델 학습 시작..."))
                
                # Check for existing model to resume or use as base
                model_base = "yolov8n.pt"
                project_info = self.projects.get(self.current_project_name, {})
                last_model = project_info.get("model_path", "")
                
                if last_model and os.path.exists(last_model):
                    model_base = last_model
                    self.after(0, lambda: status_lbl.configure(text=f"기존 학습 모델({os.path.basename(last_model)}) 기반으로 이어서 학습 중..."))
                
                model = YOLO(model_base)
                
                # Custom callback to update progress (simplified)
                def on_train_epoch_end(trainer):
                    epoch = trainer.epoch
                    total_epochs = trainer.args.epochs
                    pct = int((epoch + 1) / total_epochs * 100)
                    self.after(0, lambda p=pct, e=epoch+1, t=total_epochs: pbar.set(p / 100.0))
                    self.after(0, lambda p=pct, e=epoch+1, t=total_epochs: epoch_lbl.configure(text=f"에포크: {e} / {t} ({p}%)"))

                model.add_callback("on_train_epoch_end", on_train_epoch_end)
                
                results = model.train(
                    data=yaml_path,
                    epochs=50,       # more epochs for small dataset
                    imgsz=640,
                    batch=4,
                    workers=0,
                    device="cpu",
                    exist_ok=True,
                    close_mosaic=0,  # disable mosaic for small datasets
                    project=os.path.join(base_dir, "runs"),
                    name=save_name
                )
                
                # Final model path
                final_model_path = os.path.join(base_dir, "runs", save_name, "weights", "best.pt")
                if not os.path.exists(final_model_path):
                    final_model_path = os.path.join(base_dir, "runs", save_name, "weights", "last.pt")
                
                # Copy best model to a specific name for this project
                target_model_path = os.path.join(os.getcwd(), f"yolo_model_{save_name}.pt")
                if os.path.exists(final_model_path):
                    shutil.copy(final_model_path, target_model_path)
                
                # Update project info
                self.projects[self.current_project_name]["trained_count"] = len(self.annotations)
                self.projects[self.current_project_name]["model_path"] = target_model_path
                self._save_projects_to_file()

                # Compute average bbox from annotations (fallback if YOLO fails)
                ann_bboxes = [v["bbox"] for v in self.annotations.values()]
                if ann_bboxes:
                    avg_bbox = [
                        int(sum(b[i] for b in ann_bboxes) / len(ann_bboxes))
                        for i in range(4)
                    ]
                else:
                    avg_bbox = None

                # Return data
                trained_data = {
                    "model_path": target_model_path,
                    "classes": self.classes,
                    "avg_bbox": avg_bbox        # fallback crop for when YOLO confidence is low
                }
                
                # Schedule GUI update
                self.after(0, lambda: self._finish_training(prog, trained_data))
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                def show_err(err):
                    messagebox.showerror("오류", f"학습 중 오류 발생:\n{err}")
                    prog.destroy()
                self.after(0, lambda e=e: show_err(str(e)))

        t = threading.Thread(target=train_thread, daemon=True)
        t.start()

    def _finish_training(self, prog, data):
        self._update_current_project_data() # Ensure state is saved to project
        
        ans = messagebox.askyesno("학습 완료", "YOLO 모델 학습이 완료되었습니다!\n\n현재 학습 창을 닫고 메인 화면으로 돌아가시겠습니까?\n('아니오'를 누르면 학습 창에 남아 추가 작업을 할 수 있습니다.)", parent=prog)
        
        prog.destroy()
        self.on_train_complete(data)
        if ans:
            self.destroy()
        else:
            self.train_btn.configure(text="✅ 학습 완료 (다시 학습 가능)", fg_color="#10b981")
