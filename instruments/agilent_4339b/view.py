import customtkinter as ctk
import os
import csv
import re
import math
from datetime import datetime
from PIL import Image
from tkinter import Canvas, messagebox, filedialog
from base_instrument import BaseInstrumentView
from constants import *
from constants import _c
from translations import TRANSLATIONS
from instruments.agilent_4339b.controller import Agilent4339BController

class AgilentView(BaseInstrumentView):
    def __init__(self, master, app, **kwargs):
        super().__init__(master, app, **kwargs)
        
        # --- Agilent 전용 상태 변수 ---
        self.agi_mode_var = ctk.StringVar(value="Volume")
        self.agi_elec_var = ctk.StringVar(value="50mm")
        self.agi_thick_var = ctk.StringVar(value="1.0")
        self.agi_volt_var = ctk.StringVar(value="500")
        self.agi_auto_v_var = ctk.BooleanVar(value=True)
        self.agi_ilim_var = ctk.StringVar(value="500uA")
        self.agi_chg_var = ctk.StringVar(value="60")
        self.agi_dischg_var = ctk.StringVar(value="5")
        self.agi_addr_var = ctk.StringVar(value="17")
        self.agi_master_data = []
        
        self.rows = []
        self.sample_vars = []
        self.thickness_vars = []

        # 자동 전압 추적 트레이스
        self.agi_thick_var.trace_add("write", self._calculate_auto_voltage)
        
        self._setup_layout()
        self.load_data()
        self.after(500, self._draw_graph)

    def _setup_layout(self):
        # ── SIDEBAR (Left) ──
        self.sidebar_frame = ctk.CTkFrame(self, width=int(300 * self.app.scale), fg_color=SIDEBAR_BLUE)
        self.sidebar_frame.pack(side="left", fill="y", padx=(0, 2))
        self.sidebar_frame.pack_propagate(False)

        # ── MAIN AREA ──
        self.main_area = ctk.CTkFrame(self, fg_color="transparent")
        self.main_area.pack(side="right", fill="both", expand=True)

        # 1. TOP LIVE BAR
        self.top_bar = ctk.CTkFrame(self.main_area, height=int(120 * self.app.scale), fg_color=PANEL_COLOR, corner_radius=0)
        self.top_bar.pack(side="top", fill="x")
        self.top_bar.pack_propagate(False)

        self.lbl_live_value = ctk.CTkLabel(self.top_bar, text="0.0000E+00", font=("Consolas", int(56 * self.app.scale), "bold"), text_color=DISPLAY_VAL)
        self.lbl_live_value.pack(side="left", padx=40)
        
        self.lbl_live_unit = ctk.CTkLabel(self.top_bar, text="Ω", font=("Inter", int(24 * self.app.scale), "bold"), text_color=TEXT_MUTED)
        self.lbl_live_unit.pack(side="left", pady=(15, 0))

        self.lbl_count = ctk.CTkLabel(self.top_bar, text="Measurements: 0", font=("Inter", self.app.sf(14)), text_color=TEXT_MUTED)
        self.lbl_count.pack(side="right", padx=self.app.sf(15))

        self.lbl_live_status = ctk.CTkLabel(self.top_bar, text="READY", font=("Inter", self.app.sf(18), "bold"), text_color=SUCCESS_COLOR)
        self.lbl_live_status.pack(side="right", padx=self.app.sf(45))

        # 2. CENTER CONTENT (Table + Graph)
        self.center_split = ctk.CTkFrame(self.main_area, fg_color="transparent")
        self.center_split.pack(side="top", fill="both", expand=True, padx=10, pady=10)

        # 2a. Table Side
        self.table_side = ctk.CTkFrame(self.center_split, fg_color=PANEL_COLOR, corner_radius=10)
        self.table_side.pack(side="left", fill="both", expand=True, padx=(0, 5))
        self._build_table_ui()

        # 2b. Graph Side
        self.graph_side = ctk.CTkFrame(self.center_split, fg_color=PANEL_COLOR, corner_radius=10, width=int(320 * self.app.scale))
        self.graph_side.pack(side="right", fill="y", padx=(5, 0))
        self.graph_side.pack_propagate(False)
        self._build_graph_ui()



        # SIDEBAR CONTROLS
        self._build_sidebar_ui()


    def _build_sidebar_ui(self):
        s = self.sidebar_frame
        
        # Connection Settings (Standardized Look)
        conn = ctk.CTkFrame(s, fg_color="transparent")
        conn.pack(fill="x", padx=15, pady=10)
        
        addr_row = ctk.CTkFrame(conn, fg_color="transparent")
        addr_row.pack(fill="x", pady=5)
        ctk.CTkLabel(addr_row, text="GPIB Address:", font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(side="left")
        self.addr_entry = ctk.CTkEntry(addr_row, width=60, justify="center", textvariable=self.agi_addr_var)
        self.addr_entry.pack(side="right")

        # Connection Status Label
        self.lbl_status = ctk.CTkLabel(
            conn, text=self.app.t("smart_logger_status_disconnected"),
            font=("Inter", 12, "bold"), text_color=TEXT_MUTED
        )
        self.lbl_status.pack(pady=(5, 0), anchor="w")
        
        self.btn_agi_conn = ctk.CTkButton(
            conn, text=self.app.t("conn_btn"), 
            font=("Inter", 14, "bold"), height=45,
            fg_color=COLOR_GRAY_BTN, text_color=COLOR_WHITE, 
            command=self._toggle_connect
        )
        self.btn_agi_conn.pack(fill="x", pady=5)

        # Settings
        scroll = ctk.CTkScrollableFrame(s, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=5, pady=5)
        
        # Mode Buttons
        ctk.CTkLabel(scroll, text=self.app.t("agilent_mode"), font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        mode_btn_frame = ctk.CTkFrame(scroll, fg_color="transparent")
        mode_btn_frame.pack(fill="x", pady=5)
        self.btn_surf = ctk.CTkButton(mode_btn_frame, text="Surface", width=self.app.sf(135), height=40, command=lambda: self._set_mode("Surface"))
        self.btn_surf.pack(side="left", padx=(0, 10))
        self.btn_vol = ctk.CTkButton(mode_btn_frame, text="Volume", width=self.app.sf(135), height=40, command=lambda: self._set_mode("Volume"))
        self.btn_vol.pack(side="left")
        self._update_mode_buttons()
        
        # Electrode
        ctk.CTkLabel(scroll, text=self.app.t("agilent_elec"), font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        self.elec_menu = ctk.CTkOptionMenu(scroll, values=["50mm"], variable=self.agi_elec_var, state="disabled")
        self.elec_menu.pack(fill="x", pady=5)
        
        # Thickness
        ctk.CTkLabel(scroll, text=self.app.t("agilent_thick"), font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        ctk.CTkEntry(scroll, textvariable=self.agi_thick_var).pack(fill="x", pady=5)
        
        # Voltage
        ctk.CTkLabel(scroll, text=self.app.t("agilent_volt"), font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        v_row = ctk.CTkFrame(scroll, fg_color="transparent")
        v_row.pack(fill="x")
        self.volt_menu = ctk.CTkOptionMenu(v_row, values=["10", "25", "50", "100", "250", "500", "1000"], variable=self.agi_volt_var, width=100)
        self.volt_menu.pack(side="left")
        self.chk_auto_v = ctk.CTkCheckBox(v_row, text=self.app.t("agilent_auto_v"), variable=self.agi_auto_v_var, font=("Inter", 10), command=self._on_auto_v_toggle)
        self.chk_auto_v.pack(side="right")
        self._on_auto_v_toggle()

        # ILim, Chg, Dischg
        ctk.CTkLabel(scroll, text=self.app.t("agilent_ilim"), font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        ctk.CTkOptionMenu(scroll, values=["500uA", "1mA", "2mA", "5mA", "10mA"], variable=self.agi_ilim_var).pack(fill="x", pady=5)
        
        ctk.CTkLabel(scroll, text=self.app.t("agilent_chg"), font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        ctk.CTkOptionMenu(scroll, values=["10", "30", "60 (Recommended)", "120"], variable=self.agi_chg_var).pack(fill="x", pady=5)

        ctk.CTkLabel(scroll, text=self.app.t("agilent_dischg"), font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        ctk.CTkOptionMenu(scroll, values=["0", "2", "5", "10"], variable=self.agi_dischg_var).pack(fill="x", pady=5)

        # SOP Button
        ctk.CTkButton(s, text=self.app.t("agilent_sop"), fg_color="#0369a1", text_color=COLOR_WHITE, command=self._show_sop_guide).pack(fill="x", padx=15, pady=5)

        # Start/Stop Buttons
        self.btn_agi_start = ctk.CTkButton(s, text=self.app.t("agilent_start"), height=50, font=("Inter", 14, "bold"), fg_color=COLOR_GREEN_BTN, text_color=COLOR_WHITE, command=self._start_measurement, state="disabled")
        self.btn_agi_start.pack(fill="x", padx=15, pady=5)
        self.btn_agi_stop = ctk.CTkButton(s, text=self.app.t("agilent_stop"), height=40, font=("Inter", 12, "bold"), fg_color=DANGER_COLOR, text_color=COLOR_WHITE, command=self._stop_measurement, state="disabled")
        self.btn_agi_stop.pack(fill="x", padx=15, pady=(0, 10))

        # System Log
        log_frame = ctk.CTkFrame(s, fg_color="transparent", height=150)
        log_frame.pack(side="bottom", fill="x", padx=10, pady=10)
        log_frame.pack_propagate(False)
        ctk.CTkLabel(log_frame, text=self.app.t("sys_log", "System Log"), font=("Inter", 12, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        
        self.log_box = ctk.CTkTextbox(
            log_frame,
            font=("Consolas", 11),
            fg_color=BG_COLOR, text_color=SUCCESS_COLOR,
            border_color=BORDER_SUBTLE, border_width=1,
            state="disabled"
        )
        self.log_box.pack(fill="both", expand=True, padx=5, pady=5)

    def _build_table_ui(self):
        hdr = ctk.CTkFrame(self.table_side, fg_color="transparent")
        hdr.pack(fill="x", padx=15, pady=10)
        ctk.CTkLabel(hdr, text="📊 DATA LOG", font=("Inter", 14, "bold")).pack(side="left")
        
        ctk.CTkButton(hdr, text="Clear Data", width=90, fg_color=DANGER_COLOR, text_color=COLOR_WHITE, command=self.clear_data).pack(side="right", padx=5)
        ctk.CTkButton(hdr, text="DELETE SEL", width=100, fg_color=DANGER_COLOR, text_color=COLOR_WHITE, command=self.delete_selected).pack(side="right", padx=5)
        ctk.CTkButton(hdr, text="Export CSV", width=100, fg_color=SUCCESS_COLOR, text_color=COLOR_WHITE, command=self.export_csv).pack(side="right", padx=5)
        ctk.CTkButton(hdr, text="COPY", width=80, fg_color=COLOR_GRAY_BTN, text_color=COLOR_WHITE, command=self.copy_data).pack(side="right", padx=5)
        ctk.CTkButton(hdr, text="PASTE", width=80, fg_color=COLOR_GRAY_BTN, text_color=COLOR_WHITE, command=self._paste_data).pack(side="right", padx=5)

        self.grid_header = ctk.CTkFrame(self.table_side, fg_color=GRID_HDR_BG, height=35)
        self.grid_header.pack(fill="x", padx=5)
        # 체크박스 열 "Sel" 추가 (너비 30)
        h_info = [("Sel", 30), ("No", 40), ("Sample", 150), ("Mode", 80), ("Volt", 60), ("I-Lim", 70), ("Chg", 50), ("Thick", 60), ("Raw(Ω)", 110), ("Resistivity", 110), ("Unit", 60)]
        for text, w in h_info:
            ctk.CTkLabel(self.grid_header, text=text, width=w, font=("Inter", 11, "bold")).pack(side="left", padx=2)

        scroll_container = ctk.CTkFrame(self.table_side, fg_color="transparent")
        scroll_container.pack(fill="both", expand=True, padx=5, pady=5)
        self.canvas = Canvas(scroll_container, bg=_c(PANEL_COLOR), highlightthickness=0)
        self.scrollbar = ctk.CTkScrollbar(scroll_container, orientation="vertical", command=self.canvas.yview)
        self.scrollable_frame = ctk.CTkFrame(self.canvas, fg_color="transparent")
        self.scrollable_frame.bind("<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas_window = self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        self.scrollbar.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)

    def _build_graph_ui(self):
        ctk.CTkLabel(self.graph_side, text="📈 TREND GRAPH", font=("Inter", 14, "bold")).pack(pady=10)
        ctrl = ctk.CTkFrame(self.graph_side, fg_color="transparent")
        ctrl.pack(fill="x", padx=10)
        self.graph_range_var = ctk.StringVar(value="")
        ctk.CTkEntry(ctrl, textvariable=self.graph_range_var, placeholder_text="e.g. 1-5").pack(side="left", fill="x", expand=True)
        ctk.CTkButton(ctrl, text="DRAW", width=60, fg_color=ACCENT_COLOR, text_color=COLOR_WHITE, command=self._draw_graph).pack(side="right", padx=5)
        self.graph_type_var = ctk.StringVar(value="Bar")
        ctk.CTkSegmentedButton(self.graph_side, values=["Bar", "Box"], variable=self.graph_type_var, command=lambda v: self._draw_graph()).pack(fill="x", padx=10, pady=5)
        self.chart_canvas = Canvas(self.graph_side, bg=_c(PANEL_COLOR), highlightthickness=0)
        self.chart_canvas.pack(fill="both", expand=True, padx=10, pady=10)
        self.chart_canvas.bind("<Configure>", lambda e: self._draw_graph())

    def log_print(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_box.insert("end", f"[{ts}] {msg}\n")
        self.log_box.see("end")

    def _toggle_connect(self):
        if not self.app.controller.is_connected:
            try:
                addr = int(self.agi_addr_var.get())
                self.lbl_status.configure(text=self.app.t("smart_logger_status_connecting"), text_color=TEXT_MUTED)
                self.update()
                
                self.app.controller.gpib_address = addr
                if self.app.controller.connect():
                    self.app.controller.on_measurement_complete = self._on_measurement_complete
                    self.app.controller.on_log_triggered = self.log_print
                    self.btn_agi_conn.configure(text=self.app.t("disconn_btn"), fg_color=DANGER_COLOR)
                    self.btn_agi_start.configure(state="normal")
                    self.btn_agi_stop.configure(state="normal")
                    self.lbl_status.configure(text=self.app.t("smart_logger_status_connected"), text_color="#10B981")
                    self.log_print(f"Connected to GPIB::{addr}")
                else:
                    self.lbl_status.configure(text=self.app.t("smart_logger_status_failed"), text_color=DANGER_COLOR)
                    messagebox.showerror(self.app.t("error_title"), f"Failed to connect to GPIB::{addr}")
            except: 
                self.lbl_status.configure(text=self.app.t("smart_logger_status_failed"), text_color=DANGER_COLOR)
                messagebox.showwarning(self.app.t("error_title"), "Invalid GPIB Address")
        else:
            self.app.controller.disconnect()
            self.btn_agi_conn.configure(text=self.app.t("conn_btn"), fg_color=COLOR_GRAY_BTN)
            self.lbl_status.configure(text=self.app.t("smart_logger_status_disconnected"), text_color=TEXT_MUTED)
            self.btn_agi_start.configure(state="disabled")
            self.btn_agi_stop.configure(state="disabled")
            self.log_print("Disconnected.")

    def _start_measurement(self):
        params = {
            "mode": self.agi_mode_var.get(),
            "voltage": self.agi_volt_var.get(),
            "ilimit": self.agi_ilim_var.get(),
            "charge": self.agi_chg_var.get(),
            "discharge": self.agi_dischg_var.get(),
            "thick": self.agi_thick_var.get(),
            "elec": self.agi_elec_var.get()
        }
        self.app.controller.start_measurement(params)

    def _stop_measurement(self):
        self.app.controller.stop_measurement()

    def log_print(self, msg):
        # [TIMER] 메시지 처리: 메인 디스플레이에 카운트다운 표시
        if msg.startswith("[TIMER]"):
            try:
                seconds = int(msg.split(" ")[1])
                if seconds > 0:
                    self.lbl_live_value.configure(text=f"00:{seconds:02d}")
                    self.lbl_live_status.configure(text="CHARGING...", text_color=WARNING_COLOR)
                    self.lbl_live_unit.configure(text="")
                else:
                    self.lbl_live_value.configure(text="00:00")
                    self.lbl_live_status.configure(text="MEASURING...", text_color=ACCENT_COLOR)
                return # 시스템 로그에는 기록하지 않음
            except: pass

        import datetime
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"[{ts}] {msg}\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _set_mode(self, mode):
        self.agi_mode_var.set(mode)
        self._update_mode_buttons()
        self._show_guide_popup(mode)

    def _update_mode_buttons(self):
        m = self.agi_mode_var.get()
        if m == "Surface":
            self.btn_surf.configure(fg_color=ACCENT_COLOR, text_color=COLOR_WHITE, border_width=0)
            self.btn_vol.configure(fg_color=PANEL_COLOR, border_width=1, border_color=ACCENT_COLOR, text_color=TEXT_COLOR)
        else:
            self.btn_vol.configure(fg_color=ACCENT_COLOR, text_color=COLOR_WHITE, border_width=0)
            self.btn_surf.configure(fg_color=PANEL_COLOR, border_width=1, border_color=ACCENT_COLOR, text_color=TEXT_COLOR)

    def _on_auto_v_toggle(self):
        state = "disabled" if self.agi_auto_v_var.get() else "normal"
        self.volt_menu.configure(state=state)
        if self.agi_auto_v_var.get(): self._calculate_auto_voltage()

    def _calculate_auto_voltage(self, *args):
        if not self.agi_auto_v_var.get(): return
        try:
            t = float(self.agi_thick_var.get())
            if t <= 0.1:
                self.agi_volt_var.set("100")
            else:
                self.agi_volt_var.set("500")
        except: pass

    def _on_measurement_complete(self, result):
        self.app.after(0, lambda: self._process_measurement_result(result))

    def _process_measurement_result(self, result):
        status = result.get("status", "error")
        self.btn_agi_start.configure(state="normal", text="▶ 측정 시작")
        
        if status == "ok":
            val = result.get("value", 0.0)
            self.lbl_live_value.configure(text=f"{val:.4E}")
            self.lbl_live_status.configure(text="COMPLETE", text_color=SUCCESS_COLOR)
            self.lbl_live_unit.configure(text="Ω")
            
            mode = self.agi_mode_var.get()
            voltage = self.agi_volt_var.get()
            thickness = float(self.agi_thick_var.get()) if mode == "Volume" else 1.0
            electrode = self.agi_elec_var.get()
            
            # 현재 입력된 샘플 이름 가져오기
            sample_name = ""
            if len(self.agi_master_data) < len(self.sample_vars):
                sample_name = self.sample_vars[len(self.agi_master_data)].get()

            res_val = 0.0
            unit = ""
            if mode == "Volume":
                res_val = self.app.controller.calc_volume_resistivity(val, electrode, thickness)
                unit = "Ω·cm"
            else:
                res_val = self.app.controller.calc_surface_resistivity(val, electrode)
                unit = "Ω/□"
                
            new_row = {
                "sample": sample_name,
                "mode": mode, "voltage": voltage, "ilimit": self.agi_ilim_var.get(),
                "charge": self.agi_chg_var.get(), "thickness": thickness if mode == "Volume" else "-",
                "raw_ohm": f"{val:.4E}", "value": f"{res_val:.4E}", "unit": unit,
                "raw_ohm_val": val, "electrode": electrode
            }
            self.agi_master_data.append(new_row)
            self.load_data(); self._draw_graph()
        elif status == "stopped":
            self.lbl_live_status.configure(text="STOPPED", text_color=DANGER)
        else:
            self.lbl_live_status.configure(text="ERROR", text_color=DANGER)

    def load_data(self):
        for w in self.scrollable_frame.winfo_children(): w.destroy()
        self.rows = []; self.sample_vars = []; self.thickness_vars = []; self.check_vars = []
        for i, r in enumerate(self.agi_master_data): self._add_row(i + 1, r)
        if not self.rows: self._add_row(1)
        self.lbl_count.configure(text=f"Measurements: {len(self.agi_master_data)}")

    def _add_row(self, no, data=None):
        row_frame = ctk.CTkFrame(self.scrollable_frame, fg_color="transparent")
        row_frame.pack(fill="x", pady=1)
        
        # 1. 체크박스 추가 (선택용)
        cv = ctk.BooleanVar(value=False)
        self.check_vars.append(cv)
        ctk.CTkCheckBox(row_frame, text="", variable=cv, width=30).pack(side="left", padx=2)

        # 2. 번호 및 입력 필드
        ctk.CTkLabel(row_frame, text=str(no), width=40).pack(side="left", padx=2)
        sv = ctk.StringVar(value=data.get("sample", "") if data else "")
        self.sample_vars.append(sv)
        ctk.CTkEntry(row_frame, textvariable=sv, width=150, font=("Consolas", 12)).pack(side="left", padx=2)
        for field, w in zip(["mode", "voltage", "ilimit", "charge"], [80, 60, 70, 50]):
            val = data.get(field, "—") if data else "—"
            ctk.CTkLabel(row_frame, text=str(val), width=w, font=("Consolas", 11)).pack(side="left", padx=2)
        tv = ctk.StringVar(value=str(data.get("thickness", "-")) if data else "-")
        self.thickness_vars.append(tv)
        te = ctk.CTkEntry(row_frame, textvariable=tv, width=60, font=("Consolas", 11), justify="center")
        te.pack(side="left", padx=2)
        if data and data.get("mode") == "Surface": te.configure(state="disabled")
        
        fmt = lambda v: f"{float(v):.4E}" if isinstance(v, (int, float)) else str(v)
        ctk.CTkLabel(row_frame, text=fmt(data.get("raw_ohm", "—") if data else "—"), width=110, font=("Consolas", 11), text_color=ACCENT_COLOR).pack(side="left", padx=2)
        lbl_res = ctk.CTkLabel(row_frame, text=fmt(data.get("value", "—") if data else "—"), width=110, font=("Consolas", 11), text_color=ACCENT_COLOR)
        lbl_res.pack(side="left", padx=2)
        ctk.CTkLabel(row_frame, text=str(data.get("unit", "—") if data else "—"), width=60, font=("Consolas", 11), text_color=ACCENT_COLOR).pack(side="left", padx=2)
        
        idx = len(self.rows)
        te.bind("<KeyRelease>", lambda e, i=idx, lr=lbl_res: self._on_thickness_change(i, lr))
        self.rows.append(row_frame)

    def _on_thickness_change(self, idx, lbl_res):
        try:
            row = self.agi_master_data[idx]
            if row["mode"] == "Surface": return
            t = float(self.thickness_vars[idx].get())
            if t <= 0: return
            raw_v = row.get("raw_ohm_val")
            if raw_v is None: return
            res = Agilent4339BController.calc_volume_resistivity(raw_v, row.get("electrode", "50mm"), t)
            row["thickness"] = str(t); row["value"] = res
            lbl_res.configure(text=f"{res:.4E}")
            self._draw_graph()
        except: pass

    def _draw_graph(self, event=None):
        if not hasattr(self, 'chart_canvas') or not self.chart_canvas.winfo_exists(): return
        self.chart_canvas.delete("all")
        w, h = self.chart_canvas.winfo_width(), self.chart_canvas.winfo_height()
        if w < 50 or h < 50: return

        # 1. 데이터 수집 및 필터링
        full_data = []
        for i, r in enumerate(self.agi_master_data):
            try:
                v = float(r["value"])
                if v > 0: full_data.append((i+1, v, self.sample_vars[i].get()))
            except: pass
        if not full_data: return

        raw_range = self.graph_range_var.get().strip()
        if raw_range and ("-" in raw_range or "," in raw_range):
            allowed = set()
            for part in raw_range.replace(" ", "").split(","):
                if "-" in part:
                    try:
                        s, e = map(int, part.split("-"))
                        allowed.update(range(s, e+1))
                    except: pass
                elif part.isdigit(): allowed.add(int(part))
            plot_data = [d for d in full_data if d[0] in allowed]
        else:
            plot_data = full_data

        if not plot_data: return
        
        gtype = self.graph_type_var.get()
        is_box_mode = gtype == "Box"
        
        if not is_box_mode and len(plot_data) > 8:
            plot_data = plot_data[-8:]

        # 2. 스케일 계산 (Log10)
        logs = [math.log10(v) for _, v, _ in plot_data]
        min_log, max_log = min(logs)-1, max(logs)+1
        
        pad_l, pad_r, pad_t, pad_b = 65, 20, 40, 40
        pw, ph = w - pad_l - pad_r, h - pad_t - pad_b

        def to_y(v):
            lv = math.log10(v) if v > 0 else min_log
            return h - pad_b - ((lv - min_log) / (max_log - min_log)) * ph

        # 3. 축 및 가이드라인
        self.chart_canvas.create_line(pad_l, pad_t, pad_l, h-pad_b, fill=_c(BORDER_SUBTLE))
        self.chart_canvas.create_line(pad_l, h-pad_b, w-pad_r, h-pad_b, fill=_c(BORDER_SUBTLE))

        for y_tick in range(int(min_log), int(max_log) + 1):
            y_pos = h - pad_b - ((y_tick - min_log) / (max_log - min_log)) * ph
            self.chart_canvas.create_text(pad_l - 8, y_pos, text=f"1E{y_tick}", anchor="e", 
                                          fill=_c(TEXT_COLOR), font=("Consolas", 10))
            self.chart_canvas.create_line(pad_l, y_pos, w-pad_r, y_pos, fill=_c(BORDER_SUBTLE), dash=(2, 4))

        # 4. 타입별 그리기
        if is_box_mode:
            # --- BOX PLOT 로직 ---
            groups = []
            if not raw_range:
                groups.append(("Total", [v for _, v, _ in plot_data]))
            else:
                # 간단한 그룹화 (숫자 하나면 그 개수만큼 묶음)
                if raw_range.isdigit():
                    size = int(raw_range)
                    for i in range(0, len(plot_data), size):
                        chunk = plot_data[i:i+size]
                        groups.append((f"#{chunk[0][0]}-{chunk[-1][0]}", [v for _, v, _ in chunk]))
                else:
                    groups.append(("Selection", [v for _, v, _ in plot_data]))

            n_grp = len(groups)
            spacing = pw / (n_grp + 1)
            bw = min(60, spacing * 0.6)
            colors = ["#4472C4", "#ED7D31", "#70AD47", "#FFC000"]

            for i, (label, vals) in enumerate(groups):
                if not vals: continue
                vals.sort()
                nv = len(vals)
                v_med = vals[nv//2] if nv%2!=0 else (vals[nv//2-1]+vals[nv//2])/2
                v_q1, v_q3 = vals[nv//4], vals[3*nv//4]
                v_min, v_max = vals[0], vals[-1]
                v_avg = sum(vals)/nv

                cx = pad_l + spacing * (i + 1)
                y_min, y_max, y_med, y_q1, y_q3, y_avg = to_y(v_min), to_y(v_max), to_y(v_med), to_y(v_q1), to_y(v_q3), to_y(v_avg)
                color = colors[i % len(colors)]

                # Whiskers
                self.chart_canvas.create_line(cx, y_min, cx, y_q1, fill=color)
                self.chart_canvas.create_line(cx, y_max, cx, y_q3, fill=color)
                # Box
                self.chart_canvas.create_rectangle(cx - bw/2, y_q3, cx + bw/2, y_q1, fill=color, outline=color)
                # Median Line
                self.chart_canvas.create_line(cx - bw/2, y_med, cx + bw/2, y_med, fill="black", width=2)
                # Average Marker
                self.chart_canvas.create_text(cx, y_avg, text="×", fill="black", font=("Arial", 12, "bold"))
                
                # Label
                self.chart_canvas.create_text(cx, h - pad_b + 15, text=label, fill=_c(TEXT_COLOR), font=("Inter", 10))
                self.chart_canvas.create_text(cx, y_max - 15, text=f"{v_med:.2E}", fill=_c(TEXT_COLOR), font=("Consolas", 10, "bold"), angle=45, anchor="sw")
        else:
            # --- BAR CHART 로직 ---
            n = len(plot_data)
            spacing = pw / (n + 1)
            bw = min(35, spacing * 0.6)
            for i, (idx, val, sname) in enumerate(plot_data):
                x = pad_l + spacing * (i + 1)
                y = to_y(val)
                self.chart_canvas.create_rectangle(x - bw/2, y, x + bw/2, h - pad_b, fill=_c(ACCENT_COLOR), outline="")
                # Label
                self.chart_canvas.create_text(x, y - 10, text=f"{val:.2E}", fill=_c(TEXT_COLOR), font=("Consolas", 10), angle=45, anchor="sw")
                self.chart_canvas.create_text(x, h - pad_b + 15, text=f"#{idx}", fill=_c(TEXT_COLOR), font=("Inter", 10))

    def _show_sop_guide(self):
        """SOP 시료 거치방법 가이드를 슬라이드 형태로 보여주는 팝업"""
        pop = ctk.CTkToplevel(self)
        pop.title("SOP 시료 거치방법 가이드")
        pop.geometry("600x750")
        pop.attributes("-topmost", True)

        current_step = ctk.IntVar(value=1)
        
        img_label = ctk.CTkLabel(pop, text="")
        img_label.pack(pady=20, padx=20, expand=True, fill="both")
        
        desc_label = ctk.CTkLabel(pop, text="", font=("Inter", 13))
        desc_label.pack(pady=10)

        steps = [
            ("Step 1: 시료 준비", os.path.join(ASSETS_DIR, "sop_step1.png")),
            ("Step 2: 전극 거치", os.path.join(ASSETS_DIR, "sop_step2.png")),
            ("Step 3: 고정 및 체결", os.path.join(ASSETS_DIR, "sop_step3.png")),
            ("Step 4: 측정 준비 완료", os.path.join(ASSETS_DIR, "sop_step4.png")),
        ]

        def update_step():
            step_idx = current_step.get() - 1
            title, path = steps[step_idx]
            pop.title(f"SOP 가이드 - {title}")
            desc_label.configure(text=title)
            
            if os.path.exists(path):
                try:
                    pil_img = Image.open(path)
                    orig_w, orig_h = pil_img.size
                    target_w = 520
                    target_h = int(orig_h * (target_w / orig_w))
                    img = ctk.CTkImage(light_image=pil_img, size=(target_w, target_h))
                    img_label.configure(image=img)
                except:
                    img_label.configure(text="이미지 로드 실패")
            else:
                img_label.configure(image=None, text="이미지를 찾을 수 없습니다.")

        btn_frame = ctk.CTkFrame(pop, fg_color="transparent")
        btn_frame.pack(side="bottom", pady=20)

        def next_step():
            if current_step.get() < 4:
                current_step.set(current_step.get() + 1)
                update_step()

        def prev_step():
            if current_step.get() > 1:
                current_step.set(current_step.get() - 1)
                update_step()

        ctk.CTkButton(btn_frame, text="이전", width=100, command=prev_step).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="다음", width=100, command=next_step).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="닫기", width=100, fg_color=DANGER_COLOR, command=pop.destroy).pack(side="left", padx=10)

        update_step()

    def _show_guide_popup(self, mode):
        """표면/체적 저항 측정 결선 가이드 팝업"""
        pop = ctk.CTkToplevel(self)
        pop.title(f"Agilent 4339B - {mode} Mode Guide")
        pop.geometry("550x650")
        pop.attributes("-topmost", True)

        img_path = os.path.join(ASSETS_DIR, "surface_guide.png") if mode == "Surface" else os.path.join(ASSETS_DIR, "volume_guide.png")
        
        ctk.CTkLabel(pop, text=f"[{mode} Resistance] Connection Guide", font=("Inter", 16, "bold")).pack(pady=15)
        
        if os.path.exists(img_path):
            try:
                pil_img = Image.open(img_path)
                orig_w, orig_h = pil_img.size
                target_w = 500
                target_h = int(orig_h * (target_w / orig_w))
                img = ctk.CTkImage(light_image=pil_img, size=(target_w, target_h))
                ctk.CTkLabel(pop, image=img, text="").pack(pady=10, padx=20)
            except:
                ctk.CTkLabel(pop, text="이미지 로드 실패").pack(pady=20)
        else:
            ctk.CTkLabel(pop, text="가이드 이미지를 찾을 수 없습니다.\n(assets 폴더를 확인해주세요)").pack(pady=50)

        ctk.CTkButton(pop, text="확인 (Close)", width=150, command=pop.destroy).pack(pady=20)

    def export_csv(self):
        if not self.agi_master_data: return
        fp = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV", "*.csv")])
        if not fp: return
        if not fp.lower().endswith('.csv'):
            fp += '.csv'
        with open(fp, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["No", "Sample", "Mode", "Voltage", "I-Lim", "Charge(s)", "Thickness", "Raw(Ohm)", "Resistivity", "Unit"])
            for i, r in enumerate(self.agi_master_data):
                s = self.sample_vars[i].get() if i < len(self.sample_vars) else ""
                w.writerow([i+1, s, r["mode"], r["voltage"], r["ilimit"], r["charge"], r["thickness"], r["raw_ohm"], r["value"], r["unit"]])

    def copy_data(self):
        if not self.agi_master_data: return
        lines = ["No\tSample\tMode\tVoltage\tI-Lim\tCharge\tThickness\tRaw(Ohm)\tResult\tUnit"]
        for i, r in enumerate(self.agi_master_data):
            s = self.sample_vars[i].get() if i < len(self.sample_vars) else ""
            lines.append(f"{i+1}\t{s}\t{r['mode']}\t{r['voltage']}\t{r['ilimit']}\t{r['charge']}\t{r['thickness']}\t{r['raw_ohm']}\t{r['value']}\t{r['unit']}")
        self.app.clipboard_clear(); self.app.clipboard_append("\n".join(lines))

    def _paste_data(self):
        try:
            text = self.app.clipboard_get()
            if not text: return
            
            lines = text.strip().split("\n")
            pasted_rows = []
            
            for line in lines:
                cols = [c.strip() for c in line.split("\t")]
                if len(cols) < 2:
                    cols = [c.strip() for c in line.split()]
                if len(cols) < 2: continue
                
                # 헤더 스킵
                if any(x in cols[0] for x in ["No", "번호"]): continue
                
                try:
                    # 10열 또는 8열 형식 지원
                    if len(cols) >= 10:
                        sample, mode, volt, ilim, chg, thick, raw_r, res_s, unit = cols[1:10]
                    elif len(cols) >= 8:
                        sample, mode, volt, ilim, chg, res_s, unit = cols[1:8]
                        thick, raw_r = "-", "-"
                    else:
                        # 과학적 표기법 데이터 자동 검색
                        res_s = None
                        for c in cols:
                            if "E" in c.upper() or "." in c:
                                res_s = c; break
                        if not res_s: continue
                        sample = cols[1] if len(cols) > 1 else "Pasted"
                        mode = volt = ilim = chg = thick = raw_r = "-"
                        unit = "Ω"

                    # 수치 클리닝 및 변환
                    clean_res = res_s.replace(",", "").replace("Ω", "").replace("·cm", "").replace("/sq", "").strip()
                    val = float(clean_res.split()[0])
                    
                    pasted_rows.append({
                        "sample": sample, "mode": mode, "voltage": volt, "ilimit": ilim,
                        "charge": chg, "thickness": thick, "raw_ohm": raw_r,
                        "value": val, "unit": unit, "raw_ohm_val": val # 임시
                    })
                except: continue

            if pasted_rows:
                self.agi_master_data.extend(pasted_rows)
                self.load_data()
                self._draw_graph()
                self.log_print(f"[SUCCESS] {len(pasted_rows)}개의 데이터를 붙여넣었습니다.")
        except Exception as e:
            self.log_print(f"[ERROR] 붙여넣기 실패: {e}")
    def delete_selected(self):
        if not self.agi_master_data: return
        
        # 삭제할 인덱스들 찾기 (뒤에서부터 삭제해야 인덱스 꼬임 방지)
        indices_to_delete = [i for i, v in enumerate(self.check_vars) if v.get() and i < len(self.agi_master_data)]
        
        if not indices_to_delete:
            messagebox.showwarning("Warning", "삭제할 항목을 선택해주세요.")
            return
            
        if messagebox.askyesno("Confirm", f"선택한 {len(indices_to_delete)}개의 데이터를 삭제하시겠습니까?"):
            for i in sorted(indices_to_delete, reverse=True):
                self.agi_master_data.pop(i)
            
            self.load_data()
            self._draw_graph()
            self.log_print(f"[CLEANUP] 선택된 {len(indices_to_delete)}개 항목이 삭제되었습니다.")

    def clear_data(self):
        if messagebox.askyesno("Confirm", "모든 Agilent 측정 데이터를 초기화하시겠습니까?"):
            self.agi_master_data = []; self.load_data(); self._draw_graph()
