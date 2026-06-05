import customtkinter as ctk
import datetime
from tkinter import messagebox
from base_instrument import BaseInstrumentView
from constants import *
from instruments.common.editable_grid import EditableGrid
from instruments.common.box_plot_chart import BoxPlotChart

class GridInstrumentView(BaseInstrumentView):
    # Shared Data Storage across all grid instruments
    test_modes = {
        "ETM-7":  {"cols": ["1", "2", "3"], "group": 0, "set": 3},
        "ETM-6":  {"cols": [str((i % 4) + 1) for i in range(8)], "group": 4, "set": 8},
        "ETM-3":  {"cols": [str((i % 4) + 1) for i in range(12)], "group": 4, "set": 12},
        "ETM-18": {"cols": ["1", "2", "3"], "group": 0, "set": 3}
    }
    master_data = {mode: [] for mode in test_modes}

    def __init__(self, master, app, **kwargs):
        super().__init__(master, app, **kwargs)
        self._panel_grids = []   # [(frame, EditableGrid)]
        self._num_panels  = 1
        # Initialize mode_var so load_memory works before UI is fully built if needed
        self.mode_var = ctk.StringVar(value=list(self.test_modes.keys())[0])
        self.current_focus = (0, 0) # (row, col)
        self.active_panel_idx = 0

        self._setup_layout()
        self.load_memory()

    # ─────────────────────────────────────────────────────────────────────────
    # Layout
    # ─────────────────────────────────────────────────────────────────────────
    def _setup_layout(self):
        # ══ Left Sidebar (fixed 300 px) ══════════════════════════════════════
        self.sidebar = ctk.CTkFrame(self, width=300, fg_color=PANEL_COLOR, corner_radius=10)
        self.sidebar.pack(side="left", fill="y", padx=5, pady=5)
        self.sidebar.pack_propagate(False)

        # Port selection row
        conn_row = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        conn_row.pack(fill="x", padx=12, pady=(12, 3))
        self.port_var  = ctk.StringVar()
        self.port_menu = ctk.CTkComboBox(conn_row, values=self._get_ports(), variable=self.port_var)
        self.port_menu.pack(side="left", fill="x", expand=True, padx=(0, 5))
        ctk.CTkButton(conn_row, text="↻", width=32, fg_color=COLOR_GRAY_BTN,
                      command=self._refresh_ports).pack(side="right")

        # Connection Status Label (DAQ-6510 Style)
        self.lbl_status = ctk.CTkLabel(
            self.sidebar, text=self.app.t("smart_logger_status_disconnected"),
            font=("Inter", 12, "bold"), text_color=TEXT_MUTED
        )
        self.lbl_status.pack(pady=(2, 0), padx=12, anchor="w")

        # Connect button
        self.btn_connect = ctk.CTkButton(
            self.sidebar, text=self.app.t("conn_btn", "디바이스 연결"),
            font=("Inter", 14, "bold"), fg_color=COLOR_GRAY_BTN,
            text_color=COLOR_WHITE, height=44, command=self._toggle_connection
        )
        self.btn_connect.pack(fill="x", padx=12, pady=(4, 3))

        # Test Method Manager button
        ctk.CTkButton(
            self.sidebar,
            text=self.app.t("test_manage", "테스트 방법 관리"),
            font=("Inter", 12, "bold"), fg_color="#1e3a5f",
            text_color=COLOR_WHITE, height=36,
            command=self.open_test_manager
        ).pack(fill="x", padx=12, pady=(0, 6))

        # Screen split toggle — 3 equal buttons (Always visible)
        s1 = f"1 {self.app.t('screens', '화면')}"
        s2 = f"2 {self.app.t('screens', '화면')}"
        s3 = f"3 {self.app.t('screens', '화면')}"
        self.split_var = self._make_toggle_row(
            self.sidebar,
            label_text=self.app.t("split_view", "출력 분할 화면:"),
            options=[s1, s2, s3],
            default=s1,
            on_select=self._on_split_changed
        )

        # Divider
        ctk.CTkFrame(self.sidebar, height=1, fg_color=BORDER_SUBTLE).pack(fill="x", padx=8, pady=2)

        # Scrollable settings area
        self.settings_container = ctk.CTkScrollableFrame(
            self.sidebar, fg_color="transparent"
        )
        self.settings_container.pack(fill="both", expand=True, padx=5, pady=5)

        # Auto-log wait time
        ctk.CTkLabel(
            self.settings_container,
            text=self.app.t("auto_log_wait", "자동 기록 대기 (초)"),
            font=("Inter", 11, "bold"), text_color=TEXT_MUTED
        ).pack(anchor="w", padx=5, pady=(10, 2))
        self.wait_time_var = ctk.StringVar(value="2.0")

        def _on_wait(*_):
            try:
                v = float(self.wait_time_var.get())
                if self.app.controller and hasattr(self.app.controller, "wait_time"):
                    self.app.controller.wait_time = v
            except ValueError:
                pass

        self.wait_time_var.trace_add("write", _on_wait)
        ctk.CTkEntry(self.settings_container, textvariable=self.wait_time_var
                     ).pack(fill="x", padx=5, pady=(0, 5))

        # Subclass-specific settings
        self._add_custom_tools()

        # System Log (bottom, fixed height)
        log_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent", height=140)
        log_frame.pack(side="bottom", fill="x", padx=5, pady=5)
        log_frame.pack_propagate(False)
        ctk.CTkLabel(log_frame, text="SYSTEM LOG",
                     font=("Inter", 10, "bold"), text_color=TEXT_MUTED
                     ).pack(anchor="w", padx=5)
        self.log_box = ctk.CTkTextbox(
            log_frame, font=("Consolas", 10),
            fg_color=BG_COLOR, text_color=SUCCESS_COLOR,
            border_color=BORDER_SUBTLE, border_width=1, state="disabled"
        )
        self.log_box.pack(fill="both", expand=True, padx=5, pady=3)

        # Force scroll to top at the end of setup to prevent "cut off" sidebar
        self.after(100, lambda: self.settings_container._parent_canvas.yview_moveto(0))

        # ══ Right Main Area ═══════════════════════════════════════════════════
        self.main_container = ctk.CTkFrame(self, fg_color="transparent")
        self.main_container.pack(side="right", fill="both", expand=True, padx=5, pady=5)

        # ── 1. Live Display Bar (LCD Look) ────────────────────────────────────────────────
        self.display_bar = ctk.CTkFrame(
            self.main_container,
            height=int(120 * self.app.scale),
            fg_color=PANEL_COLOR, corner_radius=15,
            border_width=2, border_color=BORDER_SUBTLE
        )
        self.display_bar.pack(side="top", fill="x", pady=(0, 10))
        self.display_bar.pack_propagate(False)

        self.lbl_live_value = ctk.CTkLabel(
            self.display_bar,
            text="— — —",
            font=("Consolas", int(64 * self.app.scale), "bold"),
            text_color=DISPLAY_VAL
        )
        self.lbl_live_value.pack(side="left", padx=40)

        self.lbl_live_unit = ctk.CTkLabel(
            self.display_bar, text="",
            font=("Inter", int(24 * self.app.scale), "bold"),
            text_color=TEXT_MUTED
        )
        self.lbl_live_unit.pack(side="left", pady=(30, 0))

        # Status & Count container (Right side)
        status_side = ctk.CTkFrame(self.display_bar, fg_color="transparent")
        status_side.pack(side="right", padx=40)

        self.lbl_live_status = ctk.CTkLabel(
            status_side, text="READY",
            font=("Inter", int(20 * self.app.scale), "bold"),
            text_color=SUCCESS_COLOR
        )
        self.lbl_live_status.pack()

        self.lbl_meas_count = ctk.CTkLabel(
            status_side, text="Count: 0",
            font=("Inter", int(14 * self.app.scale)),
            text_color=TEXT_MUTED
        )
        self.lbl_meas_count.pack()

        # ── 2. Top Toolbar ────────────────────────────────────────────────────
        self.tools = ctk.CTkFrame(
            self.main_container, height=int(45 * self.app.scale), fg_color=BG_COLOR
        )
        self.tools.pack(side="top", fill="x", pady=(0, 8))

        ctk.CTkButton(self.tools, text="Clear Data", width=90, fg_color=DANGER_COLOR, text_color=COLOR_WHITE, command=self.clear_data).pack(side="right", padx=5)
        ctk.CTkButton(self.tools, text="Export CSV", width=100, fg_color=SUCCESS_COLOR, text_color=COLOR_WHITE, command=self.export_csv).pack(side="right", padx=5)
        ctk.CTkButton(self.tools, text="COPY", width=80, fg_color=COLOR_GRAY_BTN, text_color=COLOR_WHITE, command=self.copy_data).pack(side="right", padx=5)

        # ── 3. Grid Container ─────────────────────────────────────────────────
        self.grid_container = ctk.CTkFrame(self.main_container, fg_color="transparent")
        self.grid_container.pack(fill="both", expand=True)
        self.grid_container.columnconfigure(0, weight=1)

        self._rebuild_grids(1)

    # ─────────────────────────────────────────────────────────────────────────
    # Live display helpers
    # ─────────────────────────────────────────────────────────────────────────
    def _on_value_received(self, is_valid, val_float, formatted_str):
        if is_valid:
            # 컨트롤러에서 온 원본 포맷(단위 포함)을 그대로 표시하여 소수점 정밀도 유지
            parts = formatted_str.split()
            self.lbl_live_value.configure(text=parts[0] if parts else formatted_str)
            self.lbl_live_unit.configure(text=parts[1] if len(parts) > 1 else "")
        else:
            # 유효하지 않은 값(오버플로, 에러 등)도 디스플레이에 표시
            self.lbl_live_value.configure(text=formatted_str)
            self.lbl_live_unit.configure(text="")

    def _on_state_change(self, new_state: str):
        """컨트롤러 상태가 변경될 때 상태 표시 레이블을 업데이트합니다."""
        state_colors = {
            "WAIT_FOR_CONTACT": (TEXT_MUTED,    "READY"),
            "STABILIZING":      (WARNING_COLOR,  "STABILIZING"),
            "WAIT_FOR_OPEN":    (WARNING_COLOR,  "WAIT..."),
            "LOGGED":           (SUCCESS_COLOR,  "LOGGED"),
            "MEASURING":        (WARNING_COLOR,  "MEASURING"),
            "READY":            (SUCCESS_COLOR,  "READY"),
        }
        color, label = state_colors.get(new_state, (TEXT_MUTED, new_state))
        self.lbl_live_status.configure(text=label, text_color=color)
        
        if new_state == "LOGGED":
            self.log_print("Data recorded automatically.")

    def on_row_updated(self, row_index, panel_id=None):
        """그리드 데이터가 변경되었을 때 차트를 업데이트합니다."""
        # panel_id가 제공되면 해당 패널만, 아니면 전체 패널 업데이트 (또는 현재 활성 패널)
        target_idx = panel_id - 1 if panel_id is not None else self.active_panel_idx
        
        if 0 <= target_idx < len(self._panel_grids):
            frame, grid = self._panel_grids[target_idx]
            chart = getattr(grid, "chart", None)
            if chart:
                start = max(0, row_index - 2)
                datasets, labels = [], []
                for r in range(start, row_index + 1):
                    if r < len(grid.entries):
                        row_vals = [e.get() for e in grid.entries[r]]
                        datasets.append(row_vals)
                        labels.append(str(r + 1))
                chart.update_multiple_data(datasets, labels)

    def _on_log_triggered(self, val_float, formatted_str):
        """자동 기록이 트리거됐을 때 현재 포커스된 셀에 값을 입력합니다."""
        # 트리거된 시점의 값을 직접 사용하여 캡처
        if formatted_str and not ("Error" in formatted_str or "Wait" in formatted_str):
            self.capture_value(formatted_str)
        else:
            self.on_enter_pressed()

    def _on_cell_focus(self, row, col, panel_idx):
        """셀에 포커스가 갔을 때 현재 위치를 저장합니다."""
        self.current_focus = (row, col)
        self.active_panel_idx = panel_idx

    def on_enter_pressed(self):
        """현재 활성화된 컨트롤러의 값을 캡처하여 셀에 입력합니다."""
        if self.app.controller and self.app.controller.is_connected:
            # 컨트롤러에 저장된 최신 포맷 문자열 가져오기
            val = getattr(self.app.controller, "current_formatted", "0.000")
            if not ("Error" in val or "Wait" in val or "Flow" in val):
                self.capture_value(val)
                return
        
        # 값이 유효하지 않거나 연결 안 된 경우 그냥 다음 칸으로 이동 (수동 입력 지원)
        self._move_focus_next()

    def capture_value(self, value_str: str):
        """지정된 값을 현재 포커스된 셀에 입력하고 다음 칸으로 이동합니다."""
        if self.active_panel_idx < len(self._panel_grids):
            _, grid = self._panel_grids[self.active_panel_idx]
            r, c = self.current_focus
            
            # 숫자만 추출 (단위 제거)
            clean_val = value_str.split()[0] if ' ' in value_str else value_str
            grid.set_cell_value(r, c, clean_val)
            self._move_focus_next()
            self.increment_count()

    def _move_focus_next(self):
        """현재 패널 내에서 다음 칸(오른쪽 또는 다음 행)으로 포커스를 이동합니다."""
        if self.active_panel_idx < len(self._panel_grids):
            _, grid = self._panel_grids[self.active_panel_idx]
            r, c = self.current_focus
            grid.move_focus_next(r, c)

    def update_display(self, value_str: str, unit: str = "", status: str = ""):
        """Update the top live measurement display bar."""
        self.lbl_live_value.configure(text=value_str)
        if unit:
            self.lbl_live_unit.configure(text=unit)
        if status:
            self.lbl_live_status.configure(text=status)

    def increment_count(self):
        try:
            cur_text = self.lbl_meas_count.cget("text")
            if ":" in cur_text:
                cur = int(cur_text.split(":")[1].strip())
                self.lbl_meas_count.configure(text=f"Count: {cur + 1}")
        except Exception:
            pass

    # ─────────────────────────────────────────────────────────────────────────
    # Split-screen management
    # ─────────────────────────────────────────────────────────────────────────
    def _on_split_changed(self, val: str):
        self.save_memory()
        self._rebuild_grids(int(val[0]))

    def _rebuild_grids(self, num: int):
        self._num_panels = num
        for w, _ in self._panel_grids:
            w.destroy()
        self._panel_grids.clear()

        # Configure rows for equal distribution
        for r in range(3):
            if r < num:
                self.grid_container.rowconfigure(r, weight=1, uniform="panels")
            else:
                self.grid_container.rowconfigure(r, weight=0, uniform="")

        for i in range(num):
            frame = ctk.CTkFrame(self.grid_container, fg_color="transparent")
            frame.grid(row=i, column=0, sticky="nsew", pady=(0, 8))

            # Each panel has its own Test Method selector
            mode_keys = list(self.test_modes.keys())
            panel_mode_var = ctk.StringVar(value=mode_keys[i % len(mode_keys)])
            
            hdr = ctk.CTkFrame(frame, fg_color=BG_COLOR, height=30)
            hdr.pack(fill="x")
            hdr.pack_propagate(False)
            
            ctk.CTkLabel(hdr, text=self.app.t("panel_prefix", "패널") + f" {i+1}",
                            font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(side="left")
            
            ctk.CTkOptionMenu(
                hdr, values=mode_keys, variable=panel_mode_var, width=140,
                command=lambda m, pv=panel_mode_var, pi=i: self._on_panel_mode_change(m, pv, pi)
            ).pack(side="left", padx=5)

            grid = EditableGrid(frame, app=self.app, panel=self, panel_id=i + 1)
            grid.pack(side="left", fill="both", expand=True)
            
            # Add Chart to each panel
            chart = BoxPlotChart(frame, app=self.app, width=int(250 * self.app.scale), fg_color=PANEL_COLOR)
            chart.pack(side="right", fill="y", padx=(5, 0))
            chart.pack_propagate(False)
            
            # Store reference in grid for easy access during updates
            grid.chart = chart
            
            self._panel_grids.append((frame, grid))
            
            # If it's the first panel, sync it with self.mode_var
            if i == 0:
                self.mode_var = panel_mode_var

        self.load_memory()

    def _on_panel_mode_change(self, mode, mode_var, panel_idx):
        if panel_idx == 0:
            self.save_memory() # Save old mode data before switching
            self.mode_var = mode_var
            
        _, grid = self._panel_grids[panel_idx]
        cfg  = self.test_modes.get(mode, {})
        data = self.master_data.get(mode, [])
        grid.rebuild(mode, data, columns=cfg.get("cols", []),
                     group_size=cfg.get("group", 0), set_size=cfg.get("set", 0))

    # ─────────────────────────────────────────────────────────────────────────
    # Inline toggle-button helper
    # ─────────────────────────────────────────────────────────────────────────
    def _make_toggle_row(self, parent, label_text, options, default, on_select):
        """Render options as inline equal-width toggle buttons."""
        ctk.CTkLabel(parent, text=label_text, font=("Inter", 11, "bold"),
                     text_color=TEXT_MUTED).pack(anchor="w", padx=5, pady=(10, 2))
        
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", padx=5, pady=(0, 5))

        var      = ctk.StringVar(value=default)
        btn_refs = {}

        def _select(val):
            var.set(val)
            for v, b in btn_refs.items():
                if v == val:
                    b.configure(fg_color=ACCENT_COLOR, text_color=COLOR_WHITE, border_width=0)
                else:
                    b.configure(fg_color=PANEL_COLOR, text_color=TEXT_COLOR,
                                border_width=1, border_color=BORDER_SUBTLE)
            on_select(val)

        for opt in options:
            active = (opt == default)
            btn = ctk.CTkButton(
                row, text=opt,
                fg_color=ACCENT_COLOR if active else PANEL_COLOR,
                text_color=COLOR_WHITE if active else TEXT_COLOR,
                border_width=0 if active else 1, border_color=BORDER_SUBTLE,
                height=32, corner_radius=8,
                width=1, # 너비를 최소화하여 shrink 가능하게 설정
                font=("Inter", 11),
                command=lambda v=opt: _select(v)
            )
            # pack with expand=True and fill="both" ensures equal distribution
            btn.pack(side="left", expand=True, fill="both", padx=1)
            btn_refs[opt] = btn

        return var

    # ─────────────────────────────────────────────────────────────────────────
    # Connection helpers
    # ─────────────────────────────────────────────────────────────────────────
    def _get_ports(self):
        import serial.tools.list_ports
        ports = [p.device for p in serial.tools.list_ports.comports()]
        return ports if ports else ["None"]

    def _refresh_ports(self):
        ports = self._get_ports()
        self.port_menu.configure(values=ports)
        if ports: self.port_var.set(ports[0])

    def _on_info_received(self, msg):
        """컨트롤러에서 보낸 일반 정보/디버그 메시지를 로그 박스에 출력합니다."""
        self.log_print(msg)

    def _toggle_connection(self):
        if self.app.controller.is_connected:
            self.app.controller.disconnect()
            self.btn_connect.configure(text=self.app.t("conn_btn", "디바이스 연결"), fg_color=COLOR_GRAY_BTN)
            self.lbl_status.configure(text=self.app.t("smart_logger_status_disconnected"), text_color=TEXT_MUTED)
            self.update_display("— — —", "", "READY")
            self.log_print("Disconnected.")
        else:
            port = self.port_var.get()
            if port and port != "None":
                # 컨트롤러에 선택된 포트를 먼저 설정
                self.app.controller.port = port
                
                # ── 콜백 미리 연결 (연결 과정 중의 로그 획득을 위함) ───────────
                self.app.controller.on_value_received = self._on_value_received
                self.app.controller.on_state_change   = self._on_state_change
                self.app.controller.on_log_triggered  = self._on_log_triggered
                self.app.controller.on_error          = lambda msg: self.log_print(f"[ERR] {msg}")
                # 새로운 정보 로그 콜백 연결
                if hasattr(self.app.controller, "on_info"):
                    self.app.controller.on_info = self._on_info_received

                # 연결 시도
                success = self.app.controller.connect()
                if success:
                    # ── 대기 시간 초기 동기화 ───────────────────────────
                    try:
                        self.app.controller.wait_time = float(self.wait_time_var.get())
                    except: pass

                    # ── 폴링 시작 ──────────────────────────────────────────
                    self.app.controller.start_polling()
                    
                    self.btn_connect.configure(text=self.app.t("disconn_btn", "연결 해제"), fg_color=DANGER_COLOR)
                    self.lbl_status.configure(text=self.app.t("smart_logger_status_connected"), text_color="#10B981")
                    self.log_print(f"Connected to {port}.")
                else:
                    self.lbl_status.configure(text=self.app.t("smart_logger_status_failed"), text_color=DANGER_COLOR)
                    messagebox.showerror(self.app.t("error_title"), f"Failed to connect to {port}")
            else:
                messagebox.showwarning(self.app.t("error_title"), "No port selected.")

    # ─────────────────────────────────────────────────────────────────────────
    # Logging
    # ─────────────────────────────────────────────────────────────────────────
    def log_print(self, msg):
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"[{ts}] {msg}\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    # ─────────────────────────────────────────────────────────────────────────
    # Test Method Manager popup
    # ─────────────────────────────────────────────────────────────────────────
    def open_test_manager(self):
        target_modes  = self.test_modes
        target_data   = self.master_data
        DEFAULT_MODES = {"ETM-7", "ETM-3", "ETM-6", "ETM-18"}

        win = ctk.CTkToplevel(self)
        win.title(self.app.t("test_manage", "평가 방법 관리"))
        win.geometry("440x520")
        win.transient(self.winfo_toplevel())
        win.grab_set()

        ctk.CTkLabel(win, text=self.app.t("test_add_new", "새 평가 방법 추가"),
                     font=("Inter", 14, "bold")).pack(pady=(15, 5))
        frame_add = ctk.CTkFrame(win)
        frame_add.pack(padx=20, fill="x")

        fields_list = [
            ("name",  self.app.t("test_name_label", "테스트명:")),
            ("total", self.app.t("test_total_cells", "총 칸 수:")),
            ("group", self.app.t("test_group_cells", "구분 칸 수:")),
            ("set",   self.app.t("test_set_group", "셋트 (No. 그룹):")),
        ]
        fields = {}
        for ri, (key, label) in enumerate(fields_list):
            ctk.CTkLabel(frame_add, text=label).grid(row=ri, column=0, padx=5, pady=5, sticky="e")
            e = ctk.CTkEntry(frame_add, width=150)
            e.grid(row=ri, column=1, padx=5, pady=5, sticky="w")
            fields[key] = e

        def on_add():
            name = fields["name"].get().strip()
            if not name:
                return messagebox.showwarning("입력 오류", "테스트명을 입력하세요.", parent=win)
            if name in target_modes:
                return messagebox.showwarning("중복 오류", "이미 존재하는 테스트명입니다.", parent=win)
            try:
                total   = int(fields["total"].get().strip())
                group   = int(fields["group"].get().strip() or 0)
                set_val = int(fields["set"].get().strip() or 0)
                if total < 1: raise ValueError
            except ValueError:
                return messagebox.showwarning("입력 오류", "숫자 칸은 유효한 숫자여야 합니다.", parent=win)
            cols = [str((i % group) + 1) if group > 0 else str(i + 1) for i in range(total)]
            target_modes[name] = {"cols": cols, "group": group, "set": set_val}
            target_data[name]  = []
            if hasattr(self.app, "_save_config"): self.app._save_config()
            self._refresh_mode_menus()
            combo_del.configure(values=list(target_modes.keys()))
            combo_del.set(name)
            messagebox.showinfo("추가 성공", f"'{name}' 추가되었습니다.", parent=win)
            for e in fields.values(): e.delete(0, "end")

        ctk.CTkButton(frame_add, text=self.app.t("btn_add", "추가"), command=on_add).grid(
            row=len(fields_list), column=0, columnspan=2, pady=10)

        ctk.CTkFrame(win, height=2, fg_color=BORDER_SUBTLE).pack(fill="x", padx=20, pady=15)
        ctk.CTkLabel(win, text=self.app.t("test_delete_method", "기존 평가 방법 삭제"),
                     font=("Inter", 14, "bold")).pack(pady=(5, 5))
        frame_del = ctk.CTkFrame(win)
        frame_del.pack(padx=20, fill="x")

        combo_del = ctk.CTkComboBox(frame_del, values=list(target_modes.keys()))
        combo_del.pack(side="left", padx=5, pady=10, expand=True, fill="x")

        def on_delete():
            name = combo_del.get()
            if name in DEFAULT_MODES:
                return messagebox.showwarning("삭제 불가", "기본 제공 테스트 방법은 삭제할 수 없습니다.", parent=win)
            if name not in target_modes: return
            if not messagebox.askyesno("삭제 확인", f"'{name}'을 삭제하시겠습니까?", parent=win): return
            del target_modes[name]
            target_data.pop(name, None)
            if hasattr(self.app, "_save_config"): self.app._save_config()
            self._refresh_mode_menus()
            remaining = list(target_modes.keys())
            combo_del.configure(values=remaining)
            if remaining: combo_del.set(remaining[0])
            messagebox.showinfo("삭제 완료", f"'{name}' 삭제되었습니다.", parent=win)

        ctk.CTkButton(frame_del, text=self.app.t("btn_delete", "삭제"), fg_color=DANGER_COLOR,
                      command=on_delete, width=60).pack(side="left", padx=5, pady=10)

    def _refresh_mode_menus(self):
        modes = list(self.test_modes.keys())
        # We need to find all OptionMenus in the headers
        for frame, grid in self._panel_grids:
            for child in frame.winfo_children():
                if isinstance(child, ctk.CTkFrame): # header
                    for gc in child.winfo_children():
                        if isinstance(gc, ctk.CTkOptionMenu):
                            gc.configure(values=modes)
                            if gc.get() not in modes:
                                gc.set(modes[0])

    # ─────────────────────────────────────────────────────────────────────────
    # Data management
    # ─────────────────────────────────────────────────────────────────────────
    def load_memory(self):
        for i, (frame, grid) in enumerate(self._panel_grids):
            # Find the mode for this panel
            mode = "ETM-7" # fallback
            for child in frame.winfo_children():
                if isinstance(child, ctk.CTkFrame): # header
                    for gc in child.winfo_children():
                        if isinstance(gc, ctk.CTkOptionMenu):
                            mode = gc.get()
            
            cfg  = self.test_modes.get(mode, {})
            data = self.master_data.get(mode, [])
            grid.rebuild(mode, data,
                      columns=cfg.get("cols", []),
                      group_size=cfg.get("group", 0),
                      set_size=cfg.get("set", 0))

    def _on_mode_change(self, new_mode):
        # This was used by the top selector. Since we removed it, 
        # panel-specific changes are handled in _on_panel_mode_change.
        pass

    def save_memory(self):
        # Save data from all panels (though they might share the same mode)
        for frame, grid in self._panel_grids:
            mode = "ETM-7"
            for child in frame.winfo_children():
                if isinstance(child, ctk.CTkFrame):
                    for gc in child.winfo_children():
                        if isinstance(gc, ctk.CTkOptionMenu):
                            mode = gc.get()
            self.master_data[mode] = grid.get_data_matrix()


    def copy_data(self): pass
    def clear_data(self):
        if messagebox.askyesno("Confirm", "Clear all?"):
            self.save_memory()
            # Clear current mode
            mode = self.mode_var.get()
            self.master_data[mode] = []
            self.load_memory()

    def export_csv(self):
        import csv
        from tkinter import filedialog
        fp = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV", "*.csv")])
        if not fp: return
        if not fp.lower().endswith('.csv'):
            fp += '.csv'
        try:
            with open(fp, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f)
                for i, (frame, grid) in enumerate(self._panel_grids):
                    if len(self._panel_grids) > 1:
                        w.writerow([f"--- Panel {i+1} ---"])
                    for row in grid.get_data_matrix():
                        w.writerow(row)
                    if len(self._panel_grids) > 1:
                        w.writerow([])
            messagebox.showinfo("Export", f"Exported to CSV successfully:\n{fp}")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to export CSV: {e}")

    def on_enter_pressed(self): pass

    # Hook for subclasses
    def _add_custom_tools(self): pass
