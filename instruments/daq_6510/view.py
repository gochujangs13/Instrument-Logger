import customtkinter as ctk
import queue
import time
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.pyplot as plt
import platform

# 한글 폰트 설정 및 마이너스 깨짐 방지
if platform.system() == "Windows":
    plt.rcParams["font.family"] = "Malgun Gothic"
    plt.rcParams["axes.unicode_minus"] = False

from base_instrument import BaseInstrumentView
from constants import *
from constants import _c
import tkinter.ttk as ttk
import pyvisa
from tkinter import messagebox

class SmartLoggerView(BaseInstrumentView):
    def __init__(self, master, app, **kwargs):
        super().__init__(master, app, **kwargs)
        self.is_running = False
        self.ch_vars = {}
        self.var_all_s1 = ctk.BooleanVar(value=True)
        self.var_all_s2 = ctk.BooleanVar(value=True)
        self.ch_entries = {}
        self.ch_frames = {}
        self.plot_data = {}
        self.plot_lines = {}
        self.plot_texts = {}
        self.plot_time = []
        self.current_scan = 0
        
        # Load controller (DAQ6510Controller)
        self.controller = app.controller
        self.controller.on_data = self._on_data_received
        self.controller.on_live_ch = self._on_live_ch_received
        self.controller.on_error = self._on_error
        self.controller.on_stop = self._on_stop

        self._setup_ui()
        self.bind("<Map>", self._on_map)


    def _setup_ui(self):
        # 1. Left Sidebar for Settings
        self.sidebar = ctk.CTkFrame(self, width=300, fg_color=PANEL_COLOR, corner_radius=10)
        self.sidebar.pack(side="left", fill="y", padx=(5, 5), pady=5)
        self.sidebar.pack_propagate(False)


        # Visa
        ctk.CTkLabel(self.sidebar, text=self.app.t("smart_logger_visa"), font=("Inter", 12)).pack(anchor="w", padx=20)
        preset_smart_visas = [
            "USB0::0x05E6::0x6510::04632710::INSTR (1, 2번 오븐)",
            "USB0::0x05E6::0x6510::04544808::INSTR (3, 4번 오븐)"
        ]
        self.smart_visa_var = ctk.StringVar(value=preset_smart_visas[0])
        self.smart_visa_menu = ctk.CTkComboBox(self.sidebar, values=preset_smart_visas, variable=self.smart_visa_var)
        self.smart_visa_menu.pack(pady=5, padx=20, fill="x")

        # Connection Status Label
        self.lbl_status = ctk.CTkLabel(self.sidebar, text=self.app.t("smart_logger_status_disconnected"), font=("Inter", 12, "bold"), text_color=TEXT_MUTED)
        self.lbl_status.pack(pady=2, padx=20, anchor="w")

        self.btn_smart_check = ctk.CTkButton(self.sidebar, text=self.app.t("smart_logger_check"), fg_color=COLOR_GRAY_BTN, height=35, command=self._check_hardware)
        self.btn_smart_check.pack(pady=5, padx=20, fill="x")

        # Configs
        f_grid = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        f_grid.pack(fill="x", padx=20, pady=5)
        
        def _add_setting(parent, row, key, var, default_val):
            ctk.CTkLabel(parent, text=self.app.t(key), font=("Inter", 12)).grid(row=row, column=0, sticky="w", pady=2)
            ent = ctk.CTkEntry(parent, textvariable=var, width=120)
            ent.grid(row=row, column=1, sticky="e", pady=2)
            var.set(default_val)
            return ent

        self.smart_file_var = ctk.StringVar()
        _add_setting(f_grid, 0, "smart_logger_file", self.smart_file_var, "DAQ_Data.csv")

        self.smart_time_var = ctk.StringVar()
        _add_setting(f_grid, 1, "smart_logger_time", self.smart_time_var, "90h")

        self.smart_delay_var = ctk.StringVar()
        _add_setting(f_grid, 2, "smart_logger_delay", self.smart_delay_var, "2")

        self.smart_s1_var = ctk.StringVar()
        _add_setting(f_grid, 3, "smart_logger_s1", self.smart_s1_var, "1-10")

        self.smart_s2_var = ctk.StringVar()
        _add_setting(f_grid, 4, "smart_logger_s2", self.smart_s2_var, "")

        ctk.CTkLabel(self.sidebar, text=self.app.t("smart_logger_graph"), font=("Inter", 12)).pack(anchor="w", padx=20)
        self.smart_graph_mode_var = ctk.StringVar(value=self.app.t("smart_logger_graph_realtime"))
        self.smart_graph_menu = ctk.CTkOptionMenu(self.sidebar, 
                                                 values=[self.app.t("smart_logger_graph_realtime"), self.app.t("smart_logger_graph_full")],
                                                 variable=self.smart_graph_mode_var,
                                                 command=self._on_graph_mode_changed)
        self.smart_graph_menu.pack(pady=5, padx=20, fill="x")

        ctk.CTkLabel(self.sidebar, text=self.app.t("meas_wire"), font=("Inter", 12)).pack(anchor="w", padx=20)
        self.smart_mode_var = ctk.StringVar(value="4-Wire")
        ctk.CTkSegmentedButton(self.sidebar, values=["2-Wire", "4-Wire"], variable=self.smart_mode_var).pack(pady=5, padx=20, fill="x")

        # Trace changes to update graph channel visibility
        def _on_settings_change(*args):
            self.update_channel_visibility(
                self.smart_s1_var.get(),
                self.smart_s2_var.get(),
                self.smart_mode_var.get()
            )
        self.smart_s1_var.trace_add("write", _on_settings_change)
        self.smart_s2_var.trace_add("write", _on_settings_change)
        self.smart_mode_var.trace_add("write", _on_settings_change)
        
        # Initial call to show channels
        self.after(500, _on_settings_change)

        # Naming Tip
        ctk.CTkLabel(
            self.sidebar, 
            text=self.app.t("daq_graph_hint", "💡 채널 이름(범례)은 상단의\n'그래프' 탭에서 설정할 수 있습니다."),
            font=("Inter", 11), text_color=TEXT_MUTED, justify="left"
        ).pack(anchor="w", padx=20, pady=(10, 0))

        self.btn_start = ctk.CTkButton(self.sidebar, text=self.app.t("smart_logger_start"), font=("Inter", 14, "bold"), fg_color=ACCENT_COLOR, text_color=COLOR_WHITE, height=36, command=self._start)
        self.btn_start.pack(pady=(10, 4), padx=20, fill="x")

        self.btn_stop = ctk.CTkButton(self.sidebar, text=self.app.t("smart_logger_stop"), fg_color=DANGER_COLOR, text_color=COLOR_WHITE, height=30, command=self._stop)
        self.btn_stop.pack(pady=4, padx=20, fill="x")

        # System Log
        log_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent", height=105)
        log_frame.pack(side="bottom", fill="x", padx=10, pady=(5, 5))
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

        # 2. Right Content (Tabs)
        self.content_side = ctk.CTkFrame(self, fg_color="transparent")
        self.content_side.pack(side="left", fill="both", expand=True, padx=10, pady=10)

        # --- 2.1 Live Display Bar (LCD Look) ---
        self.display_bar = ctk.CTkFrame(self.content_side, fg_color=BG_COLOR, height=120, corner_radius=10,
                                        border_color=BORDER_SUBTLE, border_width=1)
        self.display_bar.pack(fill="x", pady=(0, 10))
        self.display_bar.pack_propagate(False)

        # A. Channel Info Section
        self.f_ch_info = ctk.CTkFrame(self.display_bar, fg_color="transparent")
        self.f_ch_info.pack(side="left", padx=20)
        
        self.lbl_display_slot_ch = ctk.CTkLabel(self.f_ch_info, text="SLOT --- | CH ---", 
                                                font=("Inter", 16, "bold"), text_color=TEXT_MUTED)
        self.lbl_display_slot_ch.pack(anchor="w")
        
        self.lbl_display_name = ctk.CTkLabel(self.f_ch_info, text=self.app.t("smart_logger_ready_scan"), 
                                             font=("Inter", 20, "bold"), text_color=ACCENT_COLOR)
        self.lbl_display_name.pack(anchor="w")

        # B. Main Value Section (Center)
        self.lbl_display_val = ctk.CTkLabel(self.display_bar, text="0.00000", 
                                            font=("Consolas", 56, "bold"), text_color=ACCENT_COLOR)
        self.lbl_display_val.place(relx=0.5, rely=0.5, anchor="center")

        self.lbl_display_unit = ctk.CTkLabel(self.display_bar, text="Ω", 
                                             font=("Inter", 24, "bold"), text_color=TEXT_MUTED)
        self.lbl_display_unit.place(relx=0.68, rely=0.6, anchor="center")

        # C. Status Section (Right)
        self.f_status = ctk.CTkFrame(self.display_bar, fg_color="transparent")
        self.f_status.pack(side="right", padx=20)

        self.lbl_display_status = ctk.CTkLabel(self.f_status, text=self.app.t("smart_logger_status_ready"), 
                                               font=("Inter", 14, "bold"), text_color=SUCCESS_COLOR)
        self.lbl_display_status.pack(side="right")
        
        self.lbl_status_badge = ctk.CTkFrame(self.f_status, fg_color=SUCCESS_COLOR, width=12, height=12, corner_radius=6)
        self.lbl_status_badge.pack(side="right", padx=10)

        # 3. Tab View
        self.tab_view = ctk.CTkTabview(self.content_side)
        self.tab_view.pack(fill="both", expand=True)
        self.tab_table = self.tab_view.add(self.app.t("smart_logger_tab_table"))
        self.tab_graph1 = self.tab_view.add(self.app.t("smart_logger_tab_graph1"))
        self.tab_graph2 = self.tab_view.add(self.app.t("smart_logger_tab_graph2"))

        # --- Tab 1 (Slot 1 Graph) UI ---
        self._setup_graph_tab(self.tab_graph1, 1)
        # --- Tab 2 (Slot 2 Graph) UI ---
        self._setup_graph_tab(self.tab_graph2, 2)
        
        self.apply_graph_theme()

        # --- Table Setup ---
        self.apply_table_style()

        self.tree = ttk.Treeview(self.tab_table, columns=[], show="headings")
        self.tree.pack(side="left", fill="both", expand=True)
        
        self.tree_scroll = ctk.CTkScrollbar(self.tab_table, orientation="vertical", command=self.tree.yview)
        self.tree_scroll.pack(side="right", fill="y")
        self.tree.configure(yscrollcommand=self.tree_scroll.set)

    def apply_table_style(self):
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", background=_c(PANEL_COLOR), foreground=_c(TEXT_COLOR), fieldbackground=_c(PANEL_COLOR), borderwidth=0)
        style.map("Treeview", background=[('selected', _c(ACCENT_COLOR))])

    def _on_map(self, event):
        if event.widget == self:
            self.apply_table_style()


    def _setup_graph_tab(self, parent_tab, slot_num):
        frame = ctk.CTkFrame(parent_tab, fg_color="transparent")
        frame.pack(fill="both", expand=True)
        
        sidebar = ctk.CTkFrame(frame, width=220, fg_color=PANEL_COLOR, corner_radius=10)
        sidebar.pack(side="left", fill="y", padx=(5, 5), pady=5)
        sidebar.pack_propagate(False)
        
        lbl_name = ctk.CTkLabel(sidebar, text=f"Slot {slot_num} 채널 이름", font=("Inter", 13, "bold"), text_color=ACCENT_COLOR)
        lbl_name.pack(pady=10)
        
        # Build Channel List
        scroll = ctk.CTkScrollableFrame(sidebar, fg_color="transparent")
        scroll.pack(fill="both", expand=True)
        
        var_all = self.var_all_s1 if slot_num == 1 else self.var_all_s2
        cb_all = ctk.CTkCheckBox(scroll, text=self.app.t("smart_logger_select_all"), variable=var_all, font=("Inter", 12, "bold"), 
                                 command=lambda s=slot_num: self.toggle_all_channels(s))
        cb_all.pack(anchor="w", padx=10, pady=5)

        for i in range(1, 21):
            ch = f"{slot_num}{i:02d}"
            self.ch_vars[ch] = ctk.BooleanVar(value=True)
            f = ctk.CTkFrame(scroll, fg_color="transparent")
            self.ch_frames[ch] = f
            
            cb = ctk.CTkCheckBox(f, text="", variable=self.ch_vars[ch], width=20, 
                                 command=lambda s=slot_num: self.sync_select_all_state(s))
            cb.pack(side="left", padx=(5, 2))
            
            lbl = ctk.CTkLabel(f, text=f"CH {ch}:", font=("Inter", 11, "bold"), width=45, anchor="w")
            lbl.pack(side="left")
            
            ent = ctk.CTkEntry(f, font=("Inter", 11), height=24, placeholder_text="제품명 입력...")
            ent.pack(side="left", fill="x", expand=True, padx=(2, 5))
            self.ch_entries[ch] = ent
            
            f.pack(fill="x", pady=1)
            # Initial state is hidden
            f.pack_forget()

        fig, ax = plt.subplots(figsize=(6, 4), dpi=100)
        fig.patch.set_facecolor('none')
        canvas = FigureCanvasTkAgg(fig, master=frame)
        
        canvas_widget = canvas.get_tk_widget()
        canvas_widget.configure(width=1, height=1) # Prevents the canvas from requesting a large size that clips layout
        canvas_widget.pack(side="right", fill="both", expand=True, padx=5, pady=5)

        # Automatically call tight_layout when the canvas is resized
        canvas.mpl_connect('resize_event', lambda event, f=fig: f.tight_layout())
        
        if slot_num == 1:
            self.fig1, self.ax1, self.canvas1 = fig, ax, canvas
        else:
            self.fig2, self.ax2, self.canvas2 = fig, ax, canvas

    def update_channel_visibility(self, s1_input, s2_input, mode):
        def parse(inp):
            if not inp.strip(): return []
            try:
                res = []
                for p in inp.split(','):
                    if '-' in p:
                        s, e = map(int, p.split('-'))
                        res.extend(range(s, e+1))
                    else: res.append(int(p))
                return res
            except: return []

        s1_nums = parse(s1_input)
        s2_nums = parse(s2_input)
        max_ch = 20 if mode == "2-Wire" else 10

        for ch, frame in self.ch_frames.items():
            slot, num = int(ch[0]), int(ch[1:])
            show = False
            if slot == 1 and num in s1_nums and num <= max_ch: show = True
            if slot == 2 and num in s2_nums and num <= max_ch: show = True
            if show: frame.pack(fill="x", pady=1)
            else: frame.pack_forget()

    def toggle_all_channels(self, slot_num):
        val = self.var_all_s1.get() if slot_num == 1 else self.var_all_s2.get()
        prefix = str(slot_num)
        for ch, var in self.ch_vars.items():
            if ch.startswith(prefix): var.set(val)
        self.update_graph_visibility()

    def sync_select_all_state(self, slot_num):
        prefix = str(slot_num)
        active_vars = [v.get() for ch, v in self.ch_vars.items() if ch.startswith(prefix)]
        all_checked = all(active_vars) if active_vars else False
        if slot_num == 1: self.var_all_s1.set(all_checked)
        else: self.var_all_s2.set(all_checked)
        self.update_graph_visibility()

    def update_graph_visibility(self):
        for ch, line in self.plot_lines.items():
            v = self.ch_vars[ch].get()
            line.set_visible(v)
            if ch in self.plot_texts: self.plot_texts[ch].set_visible(v)
        self.canvas1.draw_idle()
        self.canvas2.draw_idle()

    def apply_graph_theme(self):
        is_dark = (ctk.get_appearance_mode() == "Dark")
        axes_bg = "#151821" if is_dark else "#FFFFFF"
        text_color = "white" if is_dark else "black"
        grid_color = "#334155" if is_dark else "#E5E5EA"

        for fig, ax, canv in [(self.fig1, self.ax1, self.canvas1), (self.fig2, self.ax2, self.canvas2)]:
            if not ax: continue
            fig.patch.set_facecolor(axes_bg)
            ax.set_facecolor(axes_bg)
            ax.tick_params(colors=text_color, labelsize=9)
            # 초기 라벨 설정 (측정 전에도 보이도록) - 번역 키 적용
            is_realtime = ("실시간" in self.smart_graph_mode_var.get())
            x_label = self.app.t("smart_logger_graph_x_index") if is_realtime else self.app.t("smart_logger_graph_x_time")
            ax.set_xlabel(x_label, color=text_color, fontsize=10)
            ax.set_ylabel(self.app.t("smart_logger_graph_y_res"), color=text_color, fontsize=10)
            
            for spine in ax.spines.values():
                spine.set_color(grid_color)
            ax.grid(True, color=grid_color, linestyle='--', alpha=0.7)
            fig.tight_layout() # 라벨이 잘리지 않도록 여백 조정
            if canv: canv.get_tk_widget().configure(bg=axes_bg)

    def get_ch_name(self, ch):
        name = self.ch_entries[ch].get().strip()
        return name if name else f"CH {ch}"

    def _check_hardware(self):
        addr = self.smart_visa_var.get().split()[0]
        try:
            self.lbl_status.configure(text=self.app.t("smart_logger_status_connecting"), text_color=TEXT_MUTED)
            self.update()
            
            rm = pyvisa.ResourceManager()
            daq = rm.open_resource(addr)
            idn = daq.query("*IDN?")
            daq.close()
            
            # Update status label instead of popup
            self.lbl_status.configure(text=self.app.t("smart_logger_status_connected"), text_color="#10B981") # success green
            self.log_print(f"DAQ-6510 connected: {idn}")
        except Exception as e:
            self.lbl_status.configure(text=self.app.t("smart_logger_status_failed"), text_color=DANGER_COLOR)
            messagebox.showerror(self.app.t("error_title"), f"Failed to connect:\n{e}")
            self.log_print(f"DAQ-6510 connection failed: {e}")

    def _parse_time(self, s):
        try:
            if s.endswith('h') or s.endswith('H'): return float(s[:-1]) * 3600
            if s.endswith('m') or s.endswith('M'): return float(s[:-1]) * 60
            if s.endswith('s') or s.endswith('S'): return float(s[:-1])
            return float(s) * 3600
        except: return 0

    def _start(self):
        addr = self.smart_visa_var.get().split()[0]
        self.controller.connect(addr)
        target_sec = self._parse_time(self.smart_time_var.get())
        if target_sec <= 0: return

        def parse(inp):
            if not inp.strip(): return []
            try:
                res = []
                for p in inp.split(','):
                    if '-' in p:
                        s, e = map(int, p.split('-'))
                        res.extend(range(s, e+1))
                    else: res.append(int(p))
                return res
            except: return []

        s1_channels = [f"1{n:02d}" for n in parse(self.smart_s1_var.get()) if 1 <= n <= 20]
        s2_channels = [f"2{n:02d}" for n in parse(self.smart_s2_var.get()) if 1 <= n <= 20]
        selected_channels = s1_channels + s2_channels
        
        if not selected_channels: return

        self.tree.delete(*self.tree.get_children())
        self.tree["columns"] = ["Time"] + [f"CH_{ch}" for ch in selected_channels]
        self.tree.heading("Time", text="Time")
        self.tree.column("Time", width=100, anchor="center")
        for ch in selected_channels:
            cid = f"CH_{ch}"
            self.tree.heading(cid, text=self.get_ch_name(ch))
            self.tree.column(cid, width=80, anchor="center")

        self.ax1.clear(); self.ax2.clear()
        self.plot_data = {ch: [] for ch in selected_channels}
        self.plot_time = []; self.plot_lines = {}; self.plot_texts = {}
        self.current_scan = 0
        
        for ch in selected_channels:
            name = self.get_ch_name(ch)
            ax = self.ax1 if ch.startswith('1') else self.ax2
            line, = ax.plot([], [], label=name, marker='.')
            self.plot_lines[ch] = line
            self.plot_texts[ch] = ax.text(0, 0, f" {name}", color=line.get_color(), fontsize=9, fontweight='bold')
            
        self.apply_graph_theme()
        delay = float(self.smart_delay_var.get())

        success = self.controller.start_measurement(
            filename=self.smart_file_var.get(),
            target_sec=target_sec,
            mode=self.smart_mode_var.get(),
            ch_delay=delay,
            selected_channels=selected_channels,
            get_ch_name_cb=self.get_ch_name
        )
        if success:
            self.is_running = True
            self.btn_start.configure(state="disabled")
            self.log_print("[DAQ-6510] Measurement started.")

    def _stop(self):
        if self.controller:
            self.controller.stop_measurement()
            self.log_print("[DAQ-6510] Stop requested.")

    def _on_graph_mode_changed(self, event):
        # 모드가 바뀌면 그래프 데이터 초기화 (데이터 꼬임 방지)
        self.plot_time = []
        for ch in self.plot_data: self.plot_data[ch] = []
        self.ax1.clear()
        self.ax2.clear()
        self.apply_graph_theme()
        self.canvas1.draw_idle()
        self.canvas2.draw_idle()

    def format_reading(self, v):
        if v is None:
            return ""
        try:
            val = float(v)
            import math
            if math.isnan(val):
                return ""
            if not math.isfinite(val) or abs(val) >= 1.0e30:
                return "OL"
            return f"{val:.4E}"
        except:
            return str(v)

    def _on_live_ch_received(self, ch, val):
        self.after(0, lambda: self._update_display_only(ch, val))

    def _update_display_only(self, ch, val):
        # 1. 윗줄: 슬롯 및 채널 정보 (Header style)
        slot = ch[0]
        self.lbl_display_slot_ch.configure(text=f"Slot {slot} / CH {ch}", font=("Inter", 14, "bold"))
        
        # 2. 아랫줄: 샘플명 또는 채널명 (Title style)
        alias = self.ch_entries[ch].get().strip()
        display_name = alias if alias else f"Channel {ch}"
        self.lbl_display_name.configure(text=display_name, font=("Inter", 24, "bold"))
        
        self.lbl_display_val.configure(text=self.format_reading(val))
        self.lbl_display_status.configure(text=self.app.t("smart_logger_status_scanning"), text_color=ACCENT_COLOR)
        self.lbl_status_badge.configure(fg_color=ACCENT_COLOR)

    def _on_data_received(self, now_str, readings, elapsed_h):
        self.after(0, lambda: self._update_ui_data(now_str, readings, elapsed_h))

    def _on_error(self, msg):
        self.after(0, lambda: messagebox.showerror("DAQ Error", msg))

    def _on_stop(self):
        self.after(0, self._handle_stop)

    def _handle_stop(self):
        self.is_running = False
        self.btn_start.configure(state="normal")
        self.log_print("[DAQ-6510] Measurement stopped.")

    def log_print(self, msg):
        import datetime
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"[{ts}] {msg}\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _update_ui_data(self, now_str, readings, elapsed_h):
        # Update Top Display Bar (Last reading)
        if readings:
            last_val = readings[-1]
            self.lbl_display_val.configure(text=self.format_reading(last_val))
            self.lbl_display_status.configure(text=self.app.t("smart_logger_status_scanning"), text_color=ACCENT_COLOR)
            self.lbl_status_badge.configure(fg_color=ACCENT_COLOR)

        # Table
        row_vals = [now_str] + [self.format_reading(v) for v in readings]
        self.tree.insert("", "end", values=row_vals)
        if len(self.tree.get_children()) > 1000: self.tree.delete(self.tree.get_children()[0])
        self.tree.yview_moveto(1.0)
        
        graph_mode_text = self.smart_graph_mode_var.get()
        is_realtime = ("실시간" in graph_mode_text)

        # 모드에 따른 X축 값 설정
        self.current_scan += 1
        x_val = self.current_scan if is_realtime else elapsed_h
        self.plot_time.append(x_val)
        if is_realtime and len(self.plot_time) > 1000: self.plot_time.pop(0)

        # 모드에 따른 축 라벨 업데이트 (번역 연동)
        x_label = self.app.t("smart_logger_graph_x_index") if is_realtime else self.app.t("smart_logger_graph_x_time")
        y_label = self.app.t("smart_logger_graph_y_res")
        self.ax1.set_xlabel(x_label, color="white" if ctk.get_appearance_mode()=="Dark" else "black")
        self.ax1.set_ylabel(y_label, color="white" if ctk.get_appearance_mode()=="Dark" else "black")
        self.ax2.set_xlabel(x_label, color="white" if ctk.get_appearance_mode()=="Dark" else "black")
        self.ax2.set_ylabel(y_label, color="white" if ctk.get_appearance_mode()=="Dark" else "black")
        
        update_s1, update_s2 = False, False
        active_channels = self.controller.active_channels
        for i, ch in enumerate(active_channels):
            if i >= len(readings): break
            val = readings[i]
            self.plot_data[ch].append(val if abs(val) < 1.0e30 else (self.plot_data[ch][-1] if self.plot_data[ch] else 0))
            if is_realtime and len(self.plot_data[ch]) > 1000: self.plot_data[ch].pop(0)
            
            line = self.plot_lines.get(ch)
            if line:
                visible = self.ch_vars[ch].get()
                line.set_data(self.plot_time, self.plot_data[ch])
                if ch in self.plot_texts:
                    self.plot_texts[ch].set_position((self.plot_time[-1], self.plot_data[ch][-1]))
                if visible:
                    if ch.startswith('1'): update_s1 = True
                    else: update_s2 = True
        
        if update_s1:
            self.ax1.relim(); self.ax1.autoscale_view()
            if is_realtime:
                self.ax1.set_xlim(left=max(1, self.current_scan-1000), right=self.current_scan+10)
            self.fig1.tight_layout()
            self.canvas1.draw_idle()
        if update_s2:
            self.ax2.relim(); self.ax2.autoscale_view()
            if is_realtime:
                self.ax2.set_xlim(left=max(1, self.current_scan-1000), right=self.current_scan+10)
            self.fig2.tight_layout()
            self.canvas2.draw_idle()
