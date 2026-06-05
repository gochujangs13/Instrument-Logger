import customtkinter as ctk
import csv
import os
from tkinter import Canvas, messagebox, filedialog, END
from base_instrument import BaseInstrumentView
from constants import *
from constants import _c
from translations import TRANSLATIONS

class VL50View(BaseInstrumentView):
    # Shared Data Storage across VL50 instruments
    vl50_test_modes = {"MSL-2": {"cols": ["Left", "Right"], "group": 0, "set": 6}}
    vl50_master_data = {mode: [] for mode in vl50_test_modes}

    def __init__(self, master, app, **kwargs):
        super().__init__(master, app, **kwargs)
        
        # --- 투명화 버그 방지 ---
        self.app.bind("<Configure>", self._prevent_transparency, add="+")
        self.current_mode = "MSL-2" if "MSL-2" in self.vl50_test_modes else list(self.vl50_test_modes.keys())[0]

        self._setup_layout()
        self.load_memory()
        self.after(100, self._set_focus_initial)

    def _prevent_transparency(self, event=None):
        """다중 모니터 환경에서 창이 투명해지는 현상 방지"""
        if hasattr(self.app, "attributes"):
            try:
                if self.app.attributes("-alpha") < 1.0:
                    self.app.attributes("-alpha", 1.0)
            except: pass

    def _setup_layout(self):
        import serial.tools.list_ports
        
        # --- Left Sidebar ---
        self.sidebar = ctk.CTkFrame(self, width=280, fg_color=PANEL_COLOR, corner_radius=10)
        self.sidebar.pack(side="left", fill="y", padx=5, pady=5)
        self.sidebar.pack_propagate(False)
        
        # 1. Port Selection & Refresh (Image Style)
        conn_row = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        conn_row.pack(fill="x", padx=15, pady=(15, 5))
        
        self.port_var = ctk.StringVar()
        self.port_menu = ctk.CTkComboBox(conn_row, values=self._get_ports(), variable=self.port_var)
        self.port_menu.pack(side="left", fill="x", expand=True, padx=(0, 5))
        
        btn_refresh = ctk.CTkButton(conn_row, text="↻", width=35, fg_color=COLOR_GRAY_BTN, command=self._refresh_ports)
        btn_refresh.pack(side="right")

        # 2. Connection Status Label (Image Style)
        self.lbl_status = ctk.CTkLabel(
            self.sidebar, text=self.app.t("smart_logger_status_disconnected", "Disconnected"),
            font=("Inter", 12, "bold"), text_color=TEXT_MUTED
        )
        self.lbl_status.pack(pady=(2, 0), padx=15, anchor="w")

        # 3. Connection Button (Image Style)
        self.btn_connect = ctk.CTkButton(
            self.sidebar, text=self.app.t("conn_btn", "CONNECT"), 
            font=("Inter", 14, "bold"), fg_color=COLOR_GRAY_BTN, 
            text_color=COLOR_WHITE, height=45, command=self._toggle_connection
        )
        self.btn_connect.pack(fill="x", padx=15, pady=(8, 3))

        # 4. Test Manager Button (Image Style)
        ctk.CTkButton(
            self.sidebar,
            text=self.app.t("test_manage", "테스트 방법 관리"),
            font=("Inter", 12, "bold"), fg_color="#1e3a5f",
            text_color=COLOR_WHITE, height=40,
            command=self.open_test_manager
        ).pack(fill="x", padx=15, pady=(0, 10))

        # 5. Settings Label
        self.settings_container = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        self.settings_container.pack(fill="both", expand=True, padx=5, pady=5)

        ctk.CTkLabel(self.settings_container, text="Manual Mode Active", font=("Inter", 12, "bold"), text_color=ACCENT_COLOR).pack(pady=5)
        ctk.CTkLabel(self.settings_container, text="Press Enter or Click\nCAPTURE button to record.", font=("Inter", 11), text_color=TEXT_MUTED).pack()

        # 3. System Log
        log_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent", height=150)
        log_frame.pack(side="bottom", fill="x", padx=5, pady=5)
        log_frame.pack_propagate(False)
        ctk.CTkLabel(log_frame, text="SYSTEM LOG", font=("Inter", 10, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5)
        
        self.log_box = ctk.CTkTextbox(
            log_frame, font=("Consolas", 10),
            fg_color=BG_COLOR, text_color=SUCCESS_COLOR,
            border_color=BORDER_SUBTLE, border_width=1, state="disabled"
        )
        self.log_box.pack(fill="both", expand=True, padx=5, pady=5)

        # --- Right Main Area ---
        self.main_container = ctk.CTkFrame(self, fg_color="transparent")
        self.main_container.pack(side="right", fill="both", expand=True, padx=10, pady=5)

        # 1. Live Display Bar (LCD Look)
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
            text="0.00000",
            font=("Consolas", int(64 * self.app.scale), "bold"),
            text_color=DISPLAY_VAL
        )
        self.lbl_live_value.pack(side="left", padx=40)

        self.lbl_live_unit = ctk.CTkLabel(
            self.display_bar, text="mm",
            font=("Inter", int(24 * self.app.scale), "bold"),
            text_color=TEXT_MUTED
        )
        self.lbl_live_unit.pack(side="left", pady=(30, 0))

        status_container = ctk.CTkFrame(self.display_bar, fg_color="transparent")
        status_container.pack(side="right", padx=40)

        self.lbl_live_status = ctk.CTkLabel(
            status_container, text="READY",
            font=("Inter", int(20 * self.app.scale), "bold"),
            text_color=SUCCESS_COLOR
        )
        self.lbl_live_status.pack()

        # 2. Capture Button & Mode Selector Row
        tool_row = ctk.CTkFrame(self.main_container, fg_color="transparent")
        tool_row.pack(fill="x", pady=(0, 10))

        self.btn_capture = ctk.CTkButton(
            tool_row, text="CAPTURE DATA (Enter)",
            font=("Inter", 18, "bold"), height=50,
            fg_color=ACCENT_COLOR, text_color=COLOR_WHITE,
            command=self._manual_capture
        )
        self.btn_capture.pack(side="left", fill="x", expand=True, padx=(0, 10))

        # Set Size Entry
        ctk.CTkLabel(tool_row, text=self.app.t("vl50_set_size", "셋트 크기:"), font=("Inter", 14, "bold")).pack(side="left", padx=5)
        self.set_size_var = ctk.StringVar(value="3")
        self.entry_set_size = ctk.CTkEntry(tool_row, textvariable=self.set_size_var, width=50, font=("Inter", 14), justify="center")
        self.entry_set_size.pack(side="left", padx=(0, 10))
        self.entry_set_size.bind("<KeyRelease>", self._update_all_labels)

        self.mode_var = ctk.StringVar(value=self.current_mode)
        self.mode_menu = ctk.CTkOptionMenu(
            tool_row, values=list(self.vl50_test_modes.keys()),
            variable=self.mode_var, command=self._on_mode_change,
            width=160, height=50, font=("Inter", 14, "bold")
        )
        self.mode_menu.pack(side="right")

        # 3. Data Sheet Area
        sheet_container = ctk.CTkFrame(self.main_container, fg_color=PANEL_COLOR, corner_radius=15)
        sheet_container.pack(fill="both", expand=True)

        hdr_info = ctk.CTkFrame(sheet_container, fg_color="transparent", height=40)
        hdr_info.pack(fill="x", padx=20, pady=10)
        
        ctk.CTkLabel(hdr_info, text="MEASUREMENT DATA SHEET",
                     font=("Inter", 14, "bold"), text_color=ACCENT_COLOR).pack(side="left")
        
        ctk.CTkButton(hdr_info, text="Clear Data", width=90, fg_color=DANGER_COLOR, text_color=COLOR_WHITE, command=self.clear_data).pack(side="right", padx=5)
        ctk.CTkButton(hdr_info, text="Export CSV", width=100, fg_color=SUCCESS_COLOR, text_color=COLOR_WHITE, command=self.export_csv).pack(side="right", padx=5)
        ctk.CTkButton(hdr_info, text="COPY", width=80, fg_color=COLOR_GRAY_BTN, text_color=COLOR_WHITE, command=self.copy_data).pack(side="right", padx=5)

        # Grid Header
        self.grid_header = ctk.CTkFrame(sheet_container, fg_color=GRID_HDR_BG, height=40, corner_radius=0)
        self.grid_header.pack(fill="x", padx=1, pady=(5, 0))

        # Scroll Area
        scroll_container = ctk.CTkFrame(sheet_container, fg_color="transparent")
        scroll_container.pack(fill="both", expand=True, padx=5, pady=5)

        self.canvas = Canvas(scroll_container, bg=_c(PANEL_COLOR), highlightthickness=0, bd=0)
        self.scrollbar = ctk.CTkScrollbar(scroll_container, orientation="vertical", command=self.canvas.yview)
        self.scrollable_frame = ctk.CTkFrame(self.canvas, fg_color="transparent")

        self.scrollable_frame.bind("<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        self.scrollbar.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)



        self.rows = []
        self.current_focus = (0, 0)
        
        def _on_mousewheel(event):
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        self.canvas.bind("<MouseWheel>", _on_mousewheel)
        self.scrollable_frame.bind("<MouseWheel>", _on_mousewheel)

    def _on_mode_change(self, new_mode):
        self.save_memory()
        self.current_mode = new_mode
        self.load_memory()

    def _get_set_size(self):
        try:
            sz = int(self.set_size_var.get())
            return sz if sz > 0 else 1
        except:
            return 1

    def _get_row_label(self, num):
        sz = self._get_set_size()
        set_idx = ((num - 1) // sz) + 1
        sub_idx = ((num - 1) % sz) + 1
        return f"{set_idx}-{sub_idx}"

    def _update_all_labels(self, event=None):
        for i, row in enumerate(self.rows):
            row["lbl_num"].configure(text=self._get_row_label(i + 1))

    def save_memory(self):
        matrix = [[e.get() for e in row["entries"]] for row in self.rows if any(e.get().strip() for e in row["entries"])]
        self.vl50_master_data[self.current_mode] = matrix

    def load_memory(self):
        for w in self.scrollable_frame.winfo_children(): w.destroy()
        for w in self.grid_header.winfo_children(): w.destroy()
        self.rows = []
        cols = self.vl50_test_modes[self.current_mode]["cols"]
        cell_w = 120 if len(cols) <= 3 else 80
        ctk.CTkLabel(self.grid_header, text="Set-No", width=60, font=("Inter", 12, "bold")).pack(side="left", padx=10)
        for cname in cols: ctk.CTkLabel(self.grid_header, text=f"{cname} (mm)", width=cell_w, font=("Inter", 12, "bold")).pack(side="left", padx=5)
        ctk.CTkLabel(self.grid_header, text="Average (mm)", width=100, font=("Inter", 12, "bold")).pack(side="left", padx=10)
        
        data = self.vl50_master_data.get(self.current_mode, [])
        for i, row_data in enumerate(data): 
            self.add_row(i + 1, row_data)
            
        while len(self.rows) < 6: 
            self.add_row(len(self.rows) + 1)
            
        self.set_focus(0, 0)

    def add_row(self, num, initial_data=None):
        mode_cfg = self.vl50_test_modes[self.current_mode]
        cols = mode_cfg["cols"]
        cell_w = 120 if len(cols) <= 3 else 80
        
        row_frame = ctk.CTkFrame(self.scrollable_frame, fg_color="transparent")
        row_frame.pack(fill="x", pady=2, side="top")
            
        lbl_text = self._get_row_label(num)
        lbl_num = ctk.CTkLabel(row_frame, text=lbl_text, width=60, font=("Inter", 12))
        lbl_num.pack(side="left", padx=10)
        
        entries = []
        idx = len(self.rows)
        for c_idx, cname in enumerate(cols):
            ent = ctk.CTkEntry(row_frame, width=cell_w, font=("Consolas", 13), justify="center")
            ent.pack(side="left", padx=5)
            if initial_data and c_idx < len(initial_data): 
                ent.insert(0, initial_data[c_idx])
            
            # 역순 정렬이므로 시각적 위/아래 이동은 인덱스가 반대로 작동해야 함
            ent.bind("<Up>",    lambda e, r=idx, c=c_idx: self._move_focus(r - 1, c))
            ent.bind("<Down>",  lambda e, r=idx, c=c_idx: self._move_focus(r + 1, c))
            ent.bind("<Left>",  lambda e, r=idx, c=c_idx: self._move_focus(r, c - 1))
            ent.bind("<Right>", lambda e, r=idx, c=c_idx: self._move_focus(r, c + 1))
            ent.bind("<Return>", lambda e: self.on_enter_pressed()) 
            ent.bind("<FocusIn>", lambda e, r=idx, c=c_idx: self._on_cell_focus(r, c))
            ent.bind("<KeyRelease>", lambda e: self._update_average(idx))
            entries.append(ent)
            
        lbl_avg = ctk.CTkLabel(row_frame, text="—", width=100, font=("Consolas", 13, "bold"), text_color=ACCENT_COLOR)
        lbl_avg.pack(side="left", padx=10)
        
        self.rows.append({"entries": entries, "lbl_avg": lbl_avg, "lbl_num": lbl_num, "frame": row_frame})
        self._update_average(idx)

    def _on_cell_focus(self, r, c):
        self.current_focus = (r, c)
        # Scroll to bottom automatically so newest entries are visible
        self.canvas.yview_moveto(1.0)

    def _update_average(self, row_idx):
        if row_idx >= len(self.rows): return
        vals = []
        for e in self.rows[row_idx]["entries"]:
            try: vals.append(float(e.get().strip()))
            except: pass
        self.rows[row_idx]["lbl_avg"].configure(text=f"{sum(vals)/len(vals):.5f}" if vals else "—")

    def _move_focus(self, r, c):
        cols_count = len(self.vl50_test_modes[self.current_mode]["cols"])
        
        # 열 범위를 벗어나면 다음/이전 행으로 이동
        if c >= cols_count:
            c = 0
            r += 1
        elif c < 0:
            c = cols_count - 1
            r -= 1

        if r < 0: r = 0
        if r >= len(self.rows): self.add_row(len(self.rows) + 1)
        self.set_focus(r, c)

    def set_focus(self, r, c):
        self.current_focus = (r, c)
        if r < len(self.rows) and c < len(self.rows[r]["entries"]):
            ent = self.rows[r]["entries"][c]
            ent.focus_set()
            ent.icursor(END)

    def on_enter_pressed(self):
        if self.app.controller and self.app.controller.is_connected:
            val = self.app.controller.current_formatted
            if not ("Error" in val or "Wait" in val):
                self.capture_value(val)
                return
        
        r, c = self.current_focus
        self._move_focus(r, c + 1)

    def capture_value(self, value_str):
        r, c = self.current_focus
        if r >= len(self.rows): self.add_row(len(self.rows) + 1)
        ent = self.rows[r]["entries"][c]
        ent.delete(0, END); ent.insert(0, value_str.replace("mm","").strip())
        self._update_average(r); self._move_focus(r, c + 1)

    def _manual_capture(self): 
        self.on_enter_pressed()

    def copy_data(self):
        matrix = [[self._get_row_label(i+1)] + [e.get() for e in row["entries"]] for i, row in enumerate(self.rows)]
        tsv = "\n".join("\t".join(row) for row in matrix)
        self.clipboard_clear()
        self.clipboard_append(tsv)
        messagebox.showinfo("Copied", "Data copied to clipboard.")

    def export_csv(self):
        """Export current data to CSV"""
        if not self.rows:
            return messagebox.showwarning("Empty", "No data to export.")
            
        filepath = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")],
            title="Export CSV"
        )
        if not filepath: return
        if not filepath.lower().endswith('.csv'):
            filepath += '.csv'
        
        try:
            with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f)
                cols = self.vl50_test_modes[self.current_mode]["cols"]
                writer.writerow(["Set-No"] + [f"{c} (mm)" for c in cols] + ["Average (mm)"])
                
                for i, row in enumerate(self.rows):
                    vals = [e.get().strip() for e in row["entries"]]
                    if not any(vals): continue
                    
                    avg_text = row["lbl_avg"].cget("text")
                    writer.writerow([self._get_row_label(i+1)] + vals + [avg_text])
                    
            messagebox.showinfo("Export Successful", f"Data saved to:\n{filepath}")
        except Exception as e:
            messagebox.showerror("Export Error", f"Failed to save CSV:\n{e}")

    def clear_data(self):
        if messagebox.askyesno("Confirm", "Clear all data?"):
            self.vl50_master_data[self.current_mode] = []
            self.load_memory()

    def _get_ports(self):
        import serial.tools.list_ports
        ports = [p.device for p in serial.tools.list_ports.comports()]
        if not ports: ports = ["None"]
        return ports

    def open_test_manager(self):
        target_modes  = self.vl50_test_modes
        target_data   = self.vl50_master_data
        DEFAULT_MODES = {"MSL-2"}

        win = ctk.CTkToplevel(self)
        win.title(self.app.t("test_manage", "평가 방법 관리"))
        win.geometry("440x520")
        win.transient(self.winfo_toplevel())
        win.grab_set()

        ctk.CTkLabel(win, text=self.app.t("test_add_new", "새 평가 방법 추가"), font=("Inter", 14, "bold")).pack(pady=(15, 5))
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
            e = ctk.CTkEntry(frame_add, width=150); e.grid(row=ri, column=1, padx=5, pady=5, sticky="w")
            fields[key] = e

        def on_add():
            name = fields["name"].get().strip()
            if not name or name in target_modes: return messagebox.showwarning("오류", "이름 중복 또는 누락", parent=win)
            try:
                total   = int(fields["total"].get().strip())
                group   = int(fields["group"].get().strip() or 0)
                set_val = int(fields["set"].get().strip() or 0)
                if total < 1: raise ValueError
            except: return messagebox.showwarning("오류", "숫자 칸은 유효한 숫자여야 합니다.", parent=win)
            
            # 컬럼 생성 로직 (히오키 방식 동기화)
            if total == 2 and group == 0:
                cols = ["Left", "Right"]
            else:
                cols = [str((i % group) + 1) if group > 0 else str(i + 1) for i in range(total)]
            
            target_modes[name] = {"cols": cols, "group": group, "set": set_val}
            target_data[name] = []
            self.mode_menu.configure(values=list(target_modes.keys()))
            messagebox.showinfo("성공", f"'{name}' 추가됨", parent=win)

        ctk.CTkButton(frame_add, text=self.app.t("btn_add", "추가"), command=on_add).grid(row=len(fields_list), column=0, columnspan=2, pady=10)

        ctk.CTkFrame(win, height=2, fg_color=BORDER_SUBTLE).pack(fill="x", padx=20, pady=15)
        ctk.CTkLabel(win, text=self.app.t("test_delete_method", "평가 방법 삭제"), font=("Inter", 14, "bold")).pack(pady=(5, 5))
        frame_del = ctk.CTkFrame(win); frame_del.pack(padx=20, fill="x")
        combo_del = ctk.CTkComboBox(frame_del, values=list(target_modes.keys()))
        combo_del.pack(side="left", padx=5, pady=10, expand=True, fill="x")

        def on_delete():
            name = combo_del.get()
            if name in DEFAULT_MODES: return messagebox.showwarning("불가", "기본 모드는 삭제 불가", parent=win)
            del target_modes[name]; target_data.pop(name, None)
            self.mode_menu.configure(values=list(target_modes.keys()))
            combo_del.configure(values=list(target_modes.keys()))
            messagebox.showinfo("삭제", "완료", parent=win)

        ctk.CTkButton(frame_del, text=self.app.t("btn_delete", "삭제"), fg_color=DANGER_COLOR, command=on_delete, width=60).pack(side="left", padx=5, pady=10)

    def _refresh_ports(self):
        ports = self._get_ports()
        self.port_menu.configure(values=ports)
        if ports: self.port_var.set(ports[0])

    def _on_value_received(self, is_valid, val_float, formatted_str):
        self.lbl_live_value.configure(text=formatted_str.replace("mm","").strip())
    
    def _on_state_change(self, new_state):
        color = SUCCESS_COLOR if new_state == "READY" else WARNING_COLOR
        self.lbl_live_status.configure(text=new_state, text_color=color)

    def _toggle_connection(self):
        if self.app.controller.is_connected:
            self.app.controller.disconnect()
            self.btn_connect.configure(text=self.app.t("conn_btn", "CONNECT"), fg_color=COLOR_GRAY_BTN)
            self.lbl_live_value.configure(text="0.00000", text_color=TEXT_MUTED)
            self.lbl_status.configure(text=self.app.t("smart_logger_status_disconnected", "Disconnected"), text_color=TEXT_MUTED)
            self.lbl_live_status.configure(text="OFFLINE", text_color=TEXT_MUTED)
            self.log_print("Disconnected.")
        else:
            port = self.port_var.get()
            if port and port != "None":
                self.lbl_status.configure(text=self.app.t("smart_logger_status_connecting", "Connecting..."), text_color=TEXT_MUTED)
                self.update()
 
                self.app.controller.on_value_received = self._on_value_received
                self.app.controller.on_state_change = self._on_state_change
                self.app.controller.on_error = lambda msg: self.log_print(f"[ERR] {msg}")
                
                self.app.controller.port = port
                success = self.app.controller.connect()
                if success:
                    self.btn_connect.configure(text=self.app.t("disconn_btn", "DISCONNECT"), fg_color=DANGER_COLOR)
                    self.lbl_live_value.configure(text_color=DISPLAY_VAL)
                    self.lbl_status.configure(text=self.app.t("smart_logger_status_connected", "Connected"), text_color="#10B981")
                    self.app.controller.start_polling()
                    self.log_print(f"Connected to {port}.")
                else:
                    self.lbl_status.configure(text=self.app.t("smart_logger_status_failed", "Failed"), text_color=DANGER_COLOR)
                    messagebox.showerror(self.app.t("error_title", "Error"), f"Failed to connect to {port}")
            else:
                messagebox.showwarning(self.app.t("error_title", "Error"), "No port selected.")

    def log_print(self, msg):
        import datetime
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"[{ts}] {msg}\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _set_focus_initial(self): self.set_focus(0, 0)
