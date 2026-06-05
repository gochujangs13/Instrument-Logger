import customtkinter as ctk
from tkinter import Canvas
import statistics
from constants import *
from constants import _c

class BoxPlotChart(ctk.CTkFrame):
    def __init__(self, master, app, **kwargs):
        super().__init__(master, **kwargs)
        self.app = app

        top = ctk.CTkFrame(self, fg_color="transparent")
        top.pack(side="top", fill="x", padx=5, pady=(5, 0))

        self.auto_scale_var = ctk.BooleanVar(value=False)
        self.sw_y_axis = ctk.CTkSwitch(top, text=self.app.t("y_axis_expand"), variable=self.auto_scale_var, command=self.draw_chart, font=("Inter", self.app.sf(10)))
        self.sw_y_axis.pack(side="right")

        self.canvas = Canvas(self, highlightthickness=0)
        self.canvas.pack(side="top", fill="both", expand=True, padx=5, pady=5)
        self.bind("<Configure>", lambda e: self.after(50, self.draw_chart))

        self.target_stats = []
        self.current_stats = []
        self.labels = []
        self.is_animating = False
        self.animation_step = 0.15

    def update_multiple_data(self, datasets, labels):
        new_targets = []
        for row_data in datasets:
            clean = [float(v) for v in row_data if str(v).strip() and self._is_float(v)]
            if clean:
                clean.sort()
                new_targets.append([
                    float(min(clean)),
                    float(statistics.quantiles(clean, n=4)[0]) if len(clean) >= 2 else float(min(clean)),
                    float(statistics.median(clean)),
                    float(statistics.quantiles(clean, n=4)[2]) if len(clean) >= 2 else float(max(clean)),
                    float(max(clean)),
                ])
            else: new_targets.append(None)
        self.target_stats = new_targets; self.labels = labels
        if not self.current_stats or len(self.current_stats) != len(self.target_stats):
            self.current_stats = [list(t) if t else None for t in self.target_stats]; self.draw_chart()
        elif not self.is_animating:
            self.is_animating = True; self._animate_step()

    def _is_float(self, v):
        try: float(v); return True
        except: return False

    def _animate_step(self):
        moved = False
        for i, (t, c) in enumerate(zip(self.target_stats, self.current_stats)):
            if t and c:
                for j in range(5):
                    diff = t[j] - c[j]
                    if abs(diff) > 1e-9: c[j] += diff * self.animation_step; moved = True
                    else: c[j] = t[j]
            elif t and not c:
                self.current_stats[i] = list(t)
                moved = True
            elif not t and c:
                self.current_stats[i] = None
                moved = True
        self.draw_chart()
        if moved: self.after(20, self._animate_step)
        else: self.is_animating = False

    def draw_chart(self):
        self.canvas.delete("all")
        w, h = self.canvas.winfo_width(), self.canvas.winfo_height()
        if w <= 1 or h <= 1: return
        self.canvas.configure(bg=_c(PANEL_COLOR))
        mt, mb, ml, mr = 25, 25, 45, 15; pw, ph = w - ml - mr, h - mt - mb
        if pw <= 0 or ph <= 0: return
        if not any(self.current_stats):
            self.canvas.create_text(ml + pw/2, mt + ph/2, text="No Data", fill=_c(TEXT_MUTED))
            return
        
        data_max = max((s[4] for s in self.current_stats if s), default=0.0)
        # 기본: Y축 최대 1Ω 고정 / Y축 확장 ON: 측정값에 비례하여 자동 스케일링
        if self.auto_scale_var.get():
            y_axis_max = data_max * 1.2 if data_max > 0 else 1.0
        else:
            y_axis_max = 1.0
            
        for i in range(5):
            val = y_axis_max * (i / 4.0); y = mt + ph - (val/y_axis_max)*ph
            self.canvas.create_line(ml, y, w-mr, y, fill=_c(BORDER_SUBTLE), dash=(2, 4))
            fmt = f"{val:.1e}" if y_axis_max > 1000 else (f"{val:.3f}" if y_axis_max <= 1.0 else f"{val:.1f}")
            self.canvas.create_text(ml-8, y, text=fmt, anchor="e", font=("Consolas", 8), fill=_c(TEXT_MUTED))
        def to_y(v): return mt + ph - (max(0, min(v, y_axis_max))/y_axis_max)*ph
        n = len(self.current_stats); slot_w = pw / max(n, 3); start_slot = max(0, 3-n)
        for i, stats in enumerate(self.current_stats):
            if not stats: continue
            vmin, q1, med, q3, vmax = stats; cx = ml + (start_slot+i)*slot_w + slot_w/2; bw = min(30, slot_w*0.5)
            self.canvas.create_line(cx, to_y(vmax), cx, to_y(q3), fill=_c(ACCENT_COLOR), width=2)
            self.canvas.create_line(cx, to_y(vmin), cx, to_y(q1), fill=_c(ACCENT_COLOR), width=2)
            self.canvas.create_rectangle(cx-bw/2, to_y(q3), cx+bw/2, to_y(q1), outline=_c(ACCENT_COLOR), fill=_c(ENTRY_FOCUS), width=2)
            self.canvas.create_line(cx-bw/2, to_y(med), cx+bw/2, to_y(med), fill=_c(WARNING_COLOR), width=3)
