import sys
import os

# Add the directory containing logger_main.py to sys.path so it can find its sibling files
logger_dir = os.path.dirname(os.path.abspath(__file__))
if logger_dir not in sys.path:
    sys.path.insert(0, logger_dir)

import ctypes
try:
    # 2 = PROCESS_PER_MONITOR_DPI_AWARE, 1 = PROCESS_SYSTEM_DPI_AWARE
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

import tkinter as tk
from tkinter import ttk, messagebox
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from mpl_toolkits.mplot3d import Axes3D
import numpy as np
import time, datetime, json, serial, serial.tools.list_ports, threading

import editable_grid
from sp2100_controller import SP2100Controller
import animation_3d

class SP2100App:
    master_results = []
    master_run_no = 0

    def __init__(self, root):
        self.root = root
        self.is_toplevel = hasattr(self.root, 'title')
        
        if self.is_toplevel:
            self.root.title("MASS Slip/Peel Logger v6.0 (SP-2100 & TL-2200)")
            try:
                self.root.state('zoomed')
            except:
                pass


        # Get theme from main app if available
        theme = "Dark"
        if not self.is_toplevel and hasattr(self.root, 'app') and hasattr(self.root.app, 'theme_var'):
            theme = self.root.app.theme_var.get()

        # 현대적인 UI 테마 컬러 정의 (Slate & Emerald Theme)
        if theme == "Light":
            self.c_bg = "#f8fafc"      # slate-50 (메인 백그라운드)
            self.c_card = "#ffffff"    # white (카드 프레임 백그라운드)
            self.c_input = "#e2e8f0"   # slate-200 (입력 필드 및 Combobox)
            self.c_border = "#cbd5e1"  # slate-300 (테두리 및 라인)
            self.c_text = "#0f172a"    # slate-900 (메인 어두운 텍스트)
            self.c_subtext = "#475569" # slate-600 (설명/보조 텍스트)
            self.c_accent = "#059669"  # emerald-600 (성공, 연결됨, 실시간 로드값)
            self.c_blue = "#2563eb"    # blue-600 (기본 버튼 동작)
            self.c_red = "#dc2626"     # red-600 (에러, 정지)
            self.c_yellow = "#d97706"  # amber-600 (오토 스캔 등 대기/주의)
            self.c_log_bg = "#f1f5f9"  # slate-100 (로그창 배경)
            self.c_log_fg = "#0f172a"  # slate-900 (로그창 텍스트)
        else:
            self.c_bg = "#0f172a"      # slate-900 (메인 백그라운드)
            self.c_card = "#1e293b"    # slate-800 (카드 프레임 백그라운드)
            self.c_input = "#334155"   # slate-700 (입력 필드 및 Combobox)
            self.c_border = "#475569"  # slate-600 (테두리 및 라인)
            self.c_text = "#f8fafc"    # slate-50 (메인 밝은 텍스트)
            self.c_subtext = "#94a3b8" # slate-400 (설명/보조 텍스트)
            self.c_accent = "#10b981"  # emerald-500 (성공, 연결됨, 실시간 로드값)
            self.c_blue = "#3b82f6"    # blue-500 (기본 버튼 동작)
            self.c_red = "#ef4444"     # red-500 (에러, 정지)
            self.c_yellow = "#f59e0b"  # amber-500 (오토 스캔 등 대기/주의)
            self.c_log_bg = "#0b0f19"  # dark (로그창 배경)
            self.c_log_fg = "#e2e8f0"  # light (로그창 텍스트)
        
        if self.is_toplevel:
            self.root.configure(bg=self.c_bg)
        else:
            try: self.root.configure(fg_color=self.c_bg)
            except:
                try: self.root.configure(bg=self.c_bg)
                except: pass
        # TTK 스타일 구성
        self.apply_style()

        self.ctrl = SP2100Controller()
        self.ctrl.on_value_received = self._on_data
        self.ctrl.on_raw_received = self._on_raw_byte 
        self.ctrl.on_error = self._on_error

        self.load_cells_sp2100 = {"MBP-0.5 (0.5 lbf)":0.5,"MBP-2 (2 lbf)":2.0,"MBP-5 (5 lbf)":5.0,"MBP-10 (10 lbf)":10.0,"MBP-25 (25 lbf)":25.0}
        self.load_cells_tl2200 = {"100g":100, "500g":500, "1kg (1000g)":1000, "2kg (2000g)":2000, "5kg (5000g)":5000, "10kg (10000g)":10000}
        self.last_load_sp2100 = "2000"
        self.last_load_tl2200 = "25000"
        self.last_baud_tl2200 = "38400"  # TL-2200 마지막 사용 baud

        self.run_no = SP2100App.master_run_no
        self.results = SP2100App.master_results # 통계용 데이터 리스트
        self.last_anim_update = 0
        self.tare_offset, self.last_raw_val, self.last_raw_unit = 0.0, 0.0, "g"
        self.last_traffic_time = 0
        # Comlink 자동 기록용 버퍼
        self.comlink_buf = []
        self._comlink_timer = None
        
        self.v_lc = tk.StringVar(value="MBP-5 (5 lbf)")
        self.v_delay = tk.DoubleVar(value=1.0)
        self.v_dur = tk.DoubleVar(value=5.0)

        # Initialize config UI variables before building UI
        self.v_model = tk.StringVar(value="SP-2100")
        self.v_sample = tk.StringVar(value="Measured_Data")
        self.v_load = tk.StringVar(value="2000")
        self.v_speed = tk.StringVar(value="90")
        self.v_delay_str = tk.StringVar(value="1")  # to decouple from double var v_delay
        self.v_eval = tk.StringVar(value="5")

        self._build_ui()
        
        # UI 레이아웃 크기 즉시 계산
        self.root.update_idletasks()
        
        # 초기 그래프 강제 렌더링
        self.cv_st.draw()
        
        self.raw_graph_data = [] # 바이너리 그래프용 데이터 버퍼
        
        self._load_cfg()
        
        self._resize_job = None
        self.root.bind("<Configure>", self._on_resize)
        
        self.root.after(500, self._deep_scan_ports)
        self.root.after(100, self._check_traffic)
        self.root.after(200, self._apply_initial_layout)
        
        self.root.after(300, self._force_resize_plots)
        self.root.after(800, self._force_resize_plots)

        # Bind config auto-save (v_model 제외 - _on_model_change에서 직접 저장 처리)
        for var in [self.v_sample, self.v_load, self.v_speed, self.v_delay_str, self.v_eval, self.v_baud, self.v_fmt]:
            var.trace_add("write", self._save_cfg)


        if self.is_toplevel:
            self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.bind("<Destroy>", self._on_destroy)
        
        # Restore previously stored results if any
        self.root.after(150, self._restore_data)

    def apply_style(self):
        # TTK 스타일 구성
        self.style = ttk.Style()
        self.style.theme_use('clam')
        
        self.style.configure('.', background=self.c_bg, foreground=self.c_text, fieldbackground=self.c_card, bordercolor=self.c_border)
        self.style.configure('TFrame', background=self.c_bg)
        self.style.configure('Card.TFrame', background=self.c_card, relief='flat')
        
        self.style.configure('TLabelframe', background=self.c_card, bordercolor=self.c_border, relief='solid', borderwidth=1)
        self.style.configure('TLabelframe.Label', background=self.c_card, foreground=self.c_subtext, font=("Malgun Gothic", 9, "bold"))
        
        self.style.configure('TButton', background=self.c_input, foreground=self.c_text, borderwidth=1, focuscolor=self.c_blue, font=("Malgun Gothic", 9, "bold"))
        self.style.map('TButton',
            background=[('active', self.c_blue), ('disabled', '#475569')],
            foreground=[('disabled', '#64748b')]
        )
        
        # Combobox 스타일 설정
        self.style.configure('TCombobox', fieldbackground=self.c_input, background=self.c_border, foreground=self.c_text, arrowcolor=self.c_text)
        self.style.map('TCombobox', fieldbackground=[('readonly', self.c_input)])
        
        # Entry 스타일 설정
        self.style.configure('TEntry', fieldbackground=self.c_input, foreground=self.c_text, insertcolor=self.c_text)
        
        # Treeview 스타일 설정
        self.style.configure('Treeview', background=self.c_card, foreground=self.c_text, fieldbackground=self.c_card, rowheight=28, bordercolor=self.c_border, font=("Malgun Gothic", 9))
        self.style.configure('Treeview.Heading', background=self.c_input, foreground=self.c_subtext, font=("Malgun Gothic", 9, "bold"), relief='flat')
        self.style.map('Treeview', background=[('selected', self.c_blue)], foreground=[('selected', self.c_text)])
        
        self.style.configure('TPanedwindow', background=self.c_bg)

    def t(self, key, default=None):

        if not self.is_toplevel and hasattr(self.root, 'app') and hasattr(self.root.app, 't'):
            return self.root.app.t(key, default)
        return default if default is not None else key

    def _apply_initial_layout(self):
        try:
            self.root.update_idletasks()
            w = self.root.winfo_width()
            if w > 100:
                scale = self.root.winfo_fpixels('1i') / 96.0
                left_w = int(340 * scale)
                self.pw_main.sashpos(0, left_w)
                
                right_w = w - left_w
                self.pw_right_h.sashpos(0, int(right_w * 0.60))
        except:
            pass

    def _build_ui(self):
        # 전체 레이아웃 패딩 여유롭게 주기
        main_container = ttk.Frame(self.root, padding=10)
        main_container.pack(fill=tk.BOTH, expand=True)

        self.pw_main = ttk.PanedWindow(main_container, orient=tk.HORIZONTAL)
        self.pw_main.pack(fill=tk.BOTH, expand=True)
        
        self.left = ttk.Frame(self.pw_main)
        self.pw_main.add(self.left, weight=0)

        # ====== [왼쪽] 제어 및 진단 패널 ======
        cf = ttk.LabelFrame(self.left, text=self.t("sp2100_comm_diag", " [1] 통신 및 진단 "), padding=12)
        cf.pack(fill=tk.X, padx=5, pady=5)
        
        # ── 장비 모델 (최상단 - Baud 자동 결정)
        row_model_cf = ttk.Frame(cf)
        row_model_cf.pack(fill=tk.X, pady=(0, 6))
        tk.Label(row_model_cf, text=self.t("sp2100_model", "장비 모델:"), font=("Malgun Gothic", 9), fg=self.c_subtext, bg=self.c_card, width=8, anchor="w").pack(side=tk.LEFT)
        if not hasattr(self, 'v_model'): self.v_model = tk.StringVar(value="SP-2100")
        cb_model_cf = ttk.Combobox(row_model_cf, textvariable=self.v_model, values=["SP-2100", "TL-2200"], state="readonly")
        cb_model_cf.pack(side=tk.LEFT, fill=tk.X, expand=True)
        cb_model_cf.bind("<<ComboboxSelected>>", self._on_model_change)

        # ── COM 포트
        row_port = ttk.Frame(cf)
        row_port.pack(fill=tk.X, pady=(0, 4))
        
        self.v_port = tk.StringVar()
        self.cb_port = ttk.Combobox(row_port, textvariable=self.v_port, width=28, state="readonly")
        self.cb_port.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        btn_refresh = tk.Button(row_port, text="⟳", font=("Malgun Gothic", 9, "bold"), bg=self.c_input, fg=self.c_text, activebackground=self.c_blue, activeforeground=self.c_text, borderwidth=1, relief="flat", width=3, command=self._deep_scan_ports)
        btn_refresh.pack(side=tk.RIGHT, padx=(5, 0))

        # ── Baud (자동 설정, 읽기 전용 표시)
        self.v_baud = tk.StringVar(value="57600")   # SP-2100 기본
        self.v_fmt  = tk.StringVar(value="8-N-1")   # 8-N-1 고정

        row_baud = ttk.Frame(cf)
        row_baud.pack(fill=tk.X, pady=(0, 6))
        tk.Label(row_baud, text=self.t("sp2100_baud", "Baud:"), font=("Malgun Gothic", 9), fg=self.c_subtext, bg=self.c_card).pack(side=tk.LEFT, padx=(0, 4))
        self.lbl_baud = tk.Label(row_baud, textvariable=self.v_baud, font=("Malgun Gothic", 9, "bold"), fg=self.c_accent, bg=self.c_card)
        self.lbl_baud.pack(side=tk.LEFT)
        tk.Label(row_baud, text=" bps  /  8-N-1", font=("Malgun Gothic", 9), fg=self.c_subtext, bg=self.c_card).pack(side=tk.LEFT)
        
        self.btn_conn = tk.Button(cf, text=self.t("sp2100_connect", "연결"), bg=self.c_blue, fg="white", activebackground="#2563eb", activeforeground="white", font=("Malgun Gothic", 9, "bold"), relief="flat", height=1, command=self._toggle_conn)
        self.btn_conn.pack(fill=tk.X, pady=(0, 6))

        # 상태 및 0점 조정 한 줄에 배치하여 콤팩트하게 구성
        st_row = ttk.Frame(cf)
        st_row.pack(fill=tk.X, pady=(6, 2))
        
        st_f = tk.Frame(st_row, bg=self.c_card, highlightbackground=self.c_border, highlightthickness=1, height=28)
        st_f.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        st_f.pack_propagate(False)
        
        self.lbl_st = tk.Label(st_f, text=self.t("sp2100_offline", "OFFLINE"), font=("Arial", 8, "bold"), fg=self.c_subtext, bg=self.c_card)
        self.lbl_st.pack(side=tk.LEFT, padx=8, pady=4)
        
        self.canvas_traffic = tk.Canvas(st_f, width=12, height=12, bg=self.c_card, highlightthickness=0)
        self.canvas_traffic.pack(side=tk.LEFT, padx=(0, 8), pady=6)
        self.traffic_led = self.canvas_traffic.create_oval(2, 2, 10, 10, fill="#374151", outline="#4b5563")
        
        # ====== [왼쪽] 테스트 설정 및 시료 정보 ======
        sf = ttk.LabelFrame(self.left, text=self.t("sp2100_test_settings", " [2] 테스트 설정 및 시료 정보 "), padding=12)
        sf.pack(fill=tk.X, padx=5, pady=5)
        
        # 시료명
        row_sample = ttk.Frame(sf)
        row_sample.pack(fill=tk.X, pady=(0, 6))
        tk.Label(row_sample, text=self.t("sp2100_sample_name", "시료 명칭:"), font=("Malgun Gothic", 9), fg=self.c_subtext, bg=self.c_card, width=14, anchor="w").pack(side=tk.LEFT)
        if not hasattr(self, 'v_sample'): self.v_sample = tk.StringVar(value="Measured_Data")
        tk.Entry(row_sample, textvariable=self.v_sample, bg=self.c_input, fg=self.c_text, insertbackground=self.c_text, relief="flat").pack(side=tk.LEFT, fill=tk.X, expand=True)

        # 숫자만 입력 가능하도록 검증하는 함수
        def validate_numeric(P):
            if P == "" or P == ".":
                return True
            try:
                float(P)
                return True
            except ValueError:
                return False
        vcmd_num = (self.root.register(validate_numeric), '%P')

        # 로드셀 용량
        row_lc = ttk.Frame(sf)
        row_lc.pack(fill=tk.X, pady=(0, 6))
        tk.Label(row_lc, text=self.t("sp2100_load_cell", "로드셀 용량(gf):"), font=("Malgun Gothic", 9), fg=self.c_subtext, bg=self.c_card, width=14, anchor="w").pack(side=tk.LEFT)
        if not hasattr(self, 'v_load'): self.v_load = tk.StringVar(value="2000")
        tk.Entry(row_lc, textvariable=self.v_load, validate='key', validatecommand=vcmd_num, bg=self.c_input, fg=self.c_text, insertbackground=self.c_text, relief="flat").pack(side=tk.LEFT, fill=tk.X, expand=True)

        # 측정 속도
        row_spd = ttk.Frame(sf)
        row_spd.pack(fill=tk.X, pady=(0, 6))
        tk.Label(row_spd, text=self.t("sp2100_speed", "측정 속도(in/min):"), font=("Malgun Gothic", 9), fg=self.c_subtext, bg=self.c_card, width=14, anchor="w").pack(side=tk.LEFT)
        if not hasattr(self, 'v_speed'): self.v_speed = tk.StringVar(value="90")
        tk.Entry(row_spd, textvariable=self.v_speed, validate='key', validatecommand=vcmd_num, bg=self.c_input, fg=self.c_text, insertbackground=self.c_text, relief="flat").pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        # 지연 시간
        row_delay = ttk.Frame(sf)
        row_delay.pack(fill=tk.X, pady=(0, 6))
        tk.Label(row_delay, text=self.t("sp2100_delay", "지연 시간(s):"), font=("Malgun Gothic", 9), fg=self.c_subtext, bg=self.c_card, width=14, anchor="w").pack(side=tk.LEFT)
        if not hasattr(self, 'v_delay_str'): self.v_delay_str = tk.StringVar(value="1")
        tk.Entry(row_delay, textvariable=self.v_delay_str, validate='key', validatecommand=vcmd_num, bg=self.c_input, fg=self.c_text, insertbackground=self.c_text, relief="flat").pack(side=tk.LEFT, fill=tk.X, expand=True)

        # 평가 시간
        row_eval = ttk.Frame(sf)
        row_eval.pack(fill=tk.X, pady=(0, 2))
        tk.Label(row_eval, text=self.t("sp2100_eval_time", "평가 시간(s):"), font=("Malgun Gothic", 9), fg=self.c_subtext, bg=self.c_card, width=14, anchor="w").pack(side=tk.LEFT)
        self.v_eval = tk.StringVar(value="5")
        tk.Entry(row_eval, textvariable=self.v_eval, validate='key', validatecommand=vcmd_num, bg=self.c_input, fg=self.c_text, insertbackground=self.c_text, relief="flat").pack(side=tk.LEFT, fill=tk.X, expand=True)

        # B 방식: 장비 테스트 완료 시 자동 기록 (버튼 불필요 - 마지막 기록 삭제용)
        self.btn_rec = tk.Button(self.left, text=self.t("sp2100_del_last", "마지막 기록 삭제"), bg=self.c_input, fg=self.c_subtext, activebackground=self.c_red, activeforeground="white", font=("Malgun Gothic", 9, "bold"), relief="flat", height=1, state=tk.DISABLED, command=self._delete_last)
        self.btn_rec.pack(fill=tk.X, padx=5, pady=5)
        
        # 로그창 프레임
        log_frame = ttk.LabelFrame(self.left, text=self.t("sp2100_sys_log", " [3] 시스템 로그 "), padding=5)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 로그 헤더 (파일 저장 / 지우기 버튼)
        log_hdr = ttk.Frame(log_frame)
        log_hdr.pack(fill=tk.X, pady=(0, 4))
        btn_save_log = tk.Button(log_hdr, text=self.t("sp2100_save_log", "📄 파일 저장"), font=("Malgun Gothic", 8, "bold"), bg=self.c_input, fg=self.c_text, activebackground=self.c_blue, activeforeground=self.c_text, relief="flat", padx=6, command=self._save_log)
        btn_save_log.pack(side=tk.RIGHT)
        btn_clear_log = tk.Button(log_hdr, text=self.t("sp2100_clear_log", "지우기"), font=("Malgun Gothic", 8, "bold"), bg=self.c_input, fg=self.c_subtext, activebackground=self.c_input, activeforeground=self.c_text, relief="flat", padx=6, command=lambda: self.log_text.delete(1.0, tk.END))
        btn_clear_log.pack(side=tk.RIGHT, padx=(0, 4))
        
        scrollbar = ttk.Scrollbar(log_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.log_text = tk.Text(log_frame, height=8, font=("Consolas", 8), bg=self.c_log_bg, fg=self.c_log_fg, insertbackground=self.c_log_fg, wrap=tk.WORD, yscrollcommand=scrollbar.set, relief="flat")
        self.log_text.pack(fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.log_text.yview)


        # ====== [오른쪽] 메인 대시보드 ======
        right = ttk.Frame(self.pw_main)
        self.pw_main.add(right, weight=1)
        
        # 디지털 디스플레이 (상단)
        disp_f = tk.Frame(right, bg=self.c_bg, highlightbackground=self.c_border, highlightthickness=1)
        disp_f.pack(fill=tk.X, padx=10, pady=(10, 5))
        
        lbl_title = tk.Label(disp_f, text=self.t("sp2100_meas_result", "측정 결과"), font=("Malgun Gothic", 16, "bold"), fg=self.c_subtext, bg=self.c_bg)
        lbl_title.pack(side=tk.LEFT, padx=20, pady=10)

        self.lbl_unit = tk.Label(disp_f, text="gf", font=("Arial", 20, "bold"), fg=self.c_subtext, bg=self.c_bg)
        self.lbl_unit.pack(side=tk.RIGHT, padx=(0, 20), pady=10)

        self.lbl_val = tk.Label(disp_f, text="0.0", font=("Consolas", 48, "bold"), fg=self.c_accent, bg=self.c_bg)
        self.lbl_val.pack(side=tk.RIGHT, padx=(0, 10), pady=10)
        
        # 측정 기록 및 통계 그래프를 위한 수평 PanedWindow 배치
        self.pw_right_h = ttk.PanedWindow(right, orient=tk.HORIZONTAL)
        self.pw_right_h.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        tf = ttk.LabelFrame(self.pw_right_h, text=self.t("sp2100_log_history", " 측정 기록 데이터 테이블 - ★ Avg 값 기준 (Log History) "), padding=5)
        self.pw_right_h.add(tf, weight=3)
        
        tf_btn_bar = tk.Frame(tf, bg=self.c_card)
        tf_btn_bar.pack(fill=tk.X, pady=(0, 5))
        
        btn_del_sel = tk.Button(tf_btn_bar, text=self.t("sp2100_del_selected", "🗑️ 삭제"), font=("Malgun Gothic", 9, "bold"), bg="#dc2626", fg="white", activebackground="#b91c1c", activeforeground="white", relief="flat", command=self._delete_selected)
        btn_del_sel.pack(side=tk.LEFT, padx=(0, 5))
        
        btn_export = tk.Button(tf_btn_bar, text=self.t("sp2100_save_data", "💾 Export CSV"), font=("Malgun Gothic", 9, "bold"), bg=self.c_blue, fg="white", activebackground="#2563eb", activeforeground="white", relief="flat", command=self._export_data)
        btn_export.pack(side=tk.LEFT, padx=5)

        btn_copy = tk.Button(tf_btn_bar, text=self.t("sp2100_copy_clipboard", "📋 복사"), font=("Malgun Gothic", 9, "bold"), bg="#10b981", fg="white", activebackground="#059669", activeforeground="white", relief="flat", command=self._copy_to_clipboard)
        btn_copy.pack(side=tk.LEFT, padx=(0, 5))
        
        self.v_group_size = tk.StringVar(value="3")
        sb_group = ttk.Spinbox(tf_btn_bar, from_=1, to=100, textvariable=self.v_group_size, width=5)
        sb_group.pack(side=tk.RIGHT)
        tk.Label(tf_btn_bar, text=self.t("sp2100_group_size", "샘플 그룹 개수:"), bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 9)).pack(side=tk.RIGHT, padx=5)
        
        cols = ["chk", "N", "Sample", "Val", "SP", "Avg", "KP", "RMS", "Load", "Speed", "Delay", "Eval"]
        self.tree = editable_grid.EditableGrid(tf, columns=cols, app=self)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        stf = ttk.LabelFrame(self.pw_right_h, text=self.t("sp2100_stats_graph", " 통계 분석 (Statistical Graph) "), padding=5)
        self.pw_right_h.add(stf, weight=1)
        
        ctrl_f = ttk.Frame(stf)
        ctrl_f.pack(fill=tk.X, pady=(2, 6))
        
        # 버튼으로 그래프 초기화 기능 추가 (좌측 배치)
        btn_clear_graph = tk.Button(ctrl_f, text=self.t("sp2100_clear_graph", "그래프 초기화"), font=("Malgun Gothic", 8), bg=self.c_input, fg=self.c_text, relief="flat", command=self._clear_raw_graph)
        btn_clear_graph.pack(side=tk.LEFT)
        
        self.fig_st, self.ax_st = plt.subplots(figsize=(2, 1.5))
        self.fig_st.subplots_adjust(left=0.15, right=0.95, bottom=0.15, top=0.9)
        self.fig_st.patch.set_facecolor(self.c_card)
        self.ax_st.set_facecolor(self.c_card)
        self.ax_st.tick_params(colors=self.c_subtext, labelsize=8)
        self.ax_st.xaxis.label.set_color(self.c_subtext)
        self.ax_st.yaxis.label.set_color(self.c_subtext)
        for spine in self.ax_st.spines.values():
            spine.set_color(self.c_border)
        self.ax_st.grid(True, color=self.c_input, linestyle=':')
        
        self.cv_st = FigureCanvasTkAgg(self.fig_st, master=stf)
        self.cv_st.get_tk_widget().pack(fill=tk.BOTH, expand=True, padx=5)

    def _on_model_change(self, event=None):
        if hasattr(self, '_updating_model') and self._updating_model:
            return
        self._updating_model = True
        try:
            new_model = self.v_model.get()
            old_model = getattr(self, '_applied_model', None)

            # 이전 장비의 현재 로드셀 값을 캐시에 저장
            cur_load = self.v_load.get()
            if old_model == "SP-2100" and cur_load:
                self.last_load_sp2100 = cur_load
            elif old_model == "TL-2200" and cur_load:
                self.last_load_tl2200 = cur_load

            # 새 장비에 맞는 로드셀 값 + Baud 자동 적용
            if new_model == "SP-2100":
                self.v_load.set(self.last_load_sp2100)
                self.v_baud.set("57600")
            elif new_model == "TL-2200":
                self.v_load.set(self.last_load_tl2200)
                self.v_baud.set(getattr(self, 'last_baud_tl2200', "38400"))

            self._applied_model = new_model
            self._save_cfg()

        finally:
            self._updating_model = False

    def _deep_scan_ports(self):
        ports = serial.tools.list_ports.comports()
        p_list = [f"{p.device}: {p.description}" for p in ports]
        self.cb_port['values'] = p_list
        
        current = self.v_port.get()
        if current:
            port_name = current.split(":")[0].strip()
            matched = [p for p in p_list if p.split(":")[0].strip() == port_name]
            if matched:
                self.v_port.set(matched[0])
                return
        if p_list:
            self.v_port.set(p_list[0])

    def _on_raw_byte(self, char):
        self.last_traffic_time = time.time()
        if not hasattr(self, '_line_buf'):
            self._line_buf = b""
        if char in (b'\r', b'\n'):
            if self._line_buf:
                self._flush_line_buf()
        else:
            self._line_buf += char
            if len(self._line_buf) > 200:
                self._flush_line_buf()
        # 200ms 후에도 CR/LF 없으면 강제 플러시 (comlink 등 특수 포맷 대응)
        if hasattr(self, '_flush_job'):
            try: self.root.after_cancel(self._flush_job)
            except: pass
        self._flush_job = self.root.after(200, self._timeout_flush_line)

    def _flush_line_buf(self):
        if not hasattr(self, '_line_buf') or not self._line_buf:
            return
        raw_bytes = self._line_buf
        self._line_buf = b""
        hex_str = ' '.join(f'{b:02X}' for b in raw_bytes)
        try:
            asc = raw_bytes.decode('ascii', errors='ignore')
        except:
            asc = repr(raw_bytes)
            
        if not hasattr(self, '_text_buf'): self._text_buf = ""
        self._text_buf += asc
        
        import re
        
        # 프린터 제어용 이스케이프 시퀀스(ESC + 1바이트)를 제거하여 N값이 오염되지 않도록 함
        clean_text = re.sub(r'\x1b.', '', self._text_buf)
        
        f_re = r'[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?'
        # TL-2200 CSV: N, Time, Date, Ver, Model, Serial, SP, KP, Val, Avg, RMS
        pattern = r'\d+,[^,]*,[^,]*,[^,]*,TL-22[O0]+,[^,]*,(' + f_re + r'),(' + f_re + r'),(' + f_re + r'),(' + f_re + r'),(' + f_re + r'),'
        match = re.search(pattern, clean_text)
        if match and not getattr(self, '_parsed_this_test', False):
            try:
                # N값은 프린터 제어 문자에 의해 오염될 수 있으므로, 소프트웨어 내부의 카운터를 사용합니다.
                n_val = self.run_no + 1
                sp_val = float(match.group(1))
                kp_val = float(match.group(2))
                val_val = float(match.group(3))
                avg_val = float(match.group(4)) # 4번째 float는 Avg
                rms_val = float(match.group(5)) # 5번째 float는 RMS
                
                # 소수점 1자리로 깔끔하게 반올림
                sp_disp = round(sp_val, 1)
                kp_disp = round(kp_val, 1)
                val_disp = round(val_val, 1)
                rms_disp = round(rms_val, 1)
                avg_disp = round(avg_val, 1)
                
                self._update_val_display(avg_disp, "g", True, self._text_buf)
                self.root.after(0, lambda: self._add_log_entry(n_val, val_disp, sp_disp, avg_disp, kp_disp, rms_disp))
                self._parsed_this_test = True
            except: pass
        self._log(f"[LINE] HEX: {hex_str}")
        self._log(f"[LINE] TXT: '{asc}'")

    def _delete_selected(self):
        indices = self.tree.get_checked_indices()
        if not indices:
            messagebox.showinfo(self.t("error_title", "알림"), self.t("sp2100_msg_no_del_select", "삭제할 항목을 먼저 체크박스로 선택해주세요."))
            return
            
        confirm_msg = self.t("sp2100_msg_del_confirm", "선택한 {cnt}개의 데이터를 삭제하시겠습니까?").format(cnt=len(indices))
        if messagebox.askyesno(self.t("delete_confirm", "확인"), confirm_msg):
            for idx in sorted(indices, reverse=True):
                if idx < len(self.results):
                    del self.results[idx]
            
            self.tree.delete_rows(indices)
            self._update_stats_graph()
            del_msg = self.t("sp2100_msg_deleted", "[삭제] {cnt}개의 데이터 삭제됨").format(cnt=len(indices))
            self._log(del_msg)

    def _add_log_entry(self, n_val, val_val, sp_val, avg_val, kp_val, rms_val):
        try:
            group_size = int(self.v_group_size.get())
            if group_size < 1: group_size = 1
        except:
            group_size = 3
            
        target_idx = -1
        indices = self.tree.get_checked_indices()
        if indices:
            target_idx = indices[-1]  # Overwrite the last checked row
                
        sn = self.v_sample.get()
        ld = self.v_load.get()
        spd = self.v_speed.get()
        dly = self.v_delay.get()
        evl = self.v_eval.get()
        
        if target_idx >= 0 and target_idx < len(self.results):
            old_n_disp = self.results[target_idx]["n_disp"]
            row_data = ["☐", old_n_disp, sn, f"{val_val:.1f}", f"{sp_val:.1f}", f"{avg_val:.1f}", f"{kp_val:.1f}", f"{rms_val:.1f}", ld, spd, dly, evl]
            self.tree.update_row(target_idx, row_data)
            
            self.results[target_idx].update({
                "sample": sn, "val": val_val, "sp": sp_val, "avg": avg_val, "kp": kp_val, "rms": rms_val,
                "load": ld, "speed": spd, "delay": dly, "eval": evl
            })
            self._update_stats_graph()
            self._log(f"[덮어쓰기 완료] N={old_n_disp} | Val={val_val:.1f} | SP={sp_val:.1f} | Avg={avg_val:.1f}")
        else:
            rid = self.run_no + 1
            self.run_no = rid
            SP2100App.master_run_no = self.run_no
            group = ((rid - 1) // group_size) + 1
            item_idx = ((rid - 1) % group_size) + 1
            n_disp = f"{group}-{item_idx}"
            
            self.results.append({
                "id": rid, "sample": sn, "n_val": rid, "n_disp": n_disp, "group": group,
                "val": val_val, "sp": sp_val, "avg": avg_val, "kp": kp_val, "rms": rms_val,
                "load": ld, "speed": spd, "delay": dly, "eval": evl
            })
            
            row_data = ["☐", n_disp, sn, f"{val_val:.1f}", f"{sp_val:.1f}", f"{avg_val:.1f}", f"{kp_val:.1f}", f"{rms_val:.1f}", ld, spd, dly, evl]
            self.tree.insert_row(row_data)
            
            self._update_stats_graph()
            self._log(f"[기록 완료] N={n_disp} | Val={val_val:.1f} | SP={sp_val:.1f} | Avg={avg_val:.1f}")
            self.btn_rec.config(state=tk.NORMAL)

    def _timeout_flush_line(self):
        if hasattr(self, '_line_buf') and self._line_buf:
            self._flush_line_buf()
        self._parsed_this_test = False
        self._text_buf = ""

    def _check_traffic(self):
        diff = time.time() - self.last_traffic_time
        self.canvas_traffic.itemconfig(self.traffic_led, fill=self.c_accent if diff < 0.15 else "#374151")
        self.root.after(100, self._check_traffic)

    def _toggle_conn(self):
        if not self.ctrl.is_running:
            p_full = self.v_port.get()
            if not p_full: return
            self.ctrl.port = p_full.split(":")[0].strip()
            
            # 보드레이트는 UI에서 선택한 값 우선 사용
            try:
                self.ctrl.baudrate = int(self.v_baud.get())
            except:
                self.ctrl.baudrate = 9600
            
            # SP-2100은 명령(S\r, R\r)을 전송하여 측정값을 받아오는 Active 모드로 작동, TL-2200은 수신 전용인 Passive 모드로 작동
            self.ctrl.is_passive = (self.v_model.get() == "TL-2200")

                
            self.ctrl.rtscts = False
            self.ctrl.dsrdtr = False
            self.ctrl.xonxoff = False
            
            # format은 8-N-1 고정
            self.ctrl.bytesize = serial.EIGHTBITS
            self.ctrl.parity = serial.PARITY_NONE
            
            # 버퍼 초기화
            self._raw_byte_count = 0
            self._raw_byte_buf = b""
            self._line_buf = b""
            
            if self.ctrl.connect():
                self.btn_conn.config(text=self.t("sp2100_disconnect", "해제"), bg=self.c_red, activebackground="#dc2626")
                self.lbl_st.config(text=self.t("sp2100_connected", "CONNECTED"), fg=self.c_accent)
                self.ctrl.start_polling()
                self.btn_rec.config(state=tk.NORMAL)
                mode_str = "Passive 수신" if self.ctrl.is_passive else "Active 송수신"
                self._log(f"연결 성공: {self.ctrl.port} | {self.ctrl.baudrate} bps | 8-N-1 | {mode_str}")



                self._log(f"장비에서 테스트 완료 시 결과값이 로그와 테이블에 기록됩니다.")
                self._save_cfg()
            else:
                self._log(f"연결 실패: {self.ctrl.port}")
                messagebox.showerror("Error", "Open failed.")
        else:
            self.ctrl.disconnect()
            self.btn_conn.config(text=self.t("sp2100_connect", "연결"), bg=self.c_blue, activebackground="#2563eb")
            self.lbl_st.config(text=self.t("sp2100_offline", "OFFLINE"), fg=self.c_subtext)
            self.btn_rec.config(state=tk.DISABLED)
            self._log("연결 해제됨")

    def _on_data(self, ok, val, unit, raw):
        self.last_raw_val, self.last_raw_unit = val, unit
        adj_val = val - self.tare_offset
        self.root.after(0, lambda: self._update_val_display(adj_val, unit, ok, raw))
        
        if not ok:
            return
        
        # 유효값(절대값 0.1 이상)만 수집 - 아이들(0.000) 무시
        if abs(adj_val) >= 0.1:
            self.comlink_buf.append(adj_val)
            # 타이머 리셋 (마지막 유효값 수신 후 2초 뒤 자동 기록)
            if self._comlink_timer:
                try: self.root.after_cancel(self._comlink_timer)
                except: pass
            self._comlink_timer = self.root.after(2000, self._auto_record_comlink)

    def _update_val_display(self, val, unit, ok, raw):
        self.lbl_val.config(text=f"{val:.2f}")
        self.lbl_unit.config(text=unit)
        if not ok:
            self.lbl_val.config(fg=self.c_red)
        else:
            self.lbl_val.config(fg=self.c_accent)

    def _update_stats_graph(self):
        self.ax_st.cla()
        self.ax_st.grid(True, color=self.c_input, linestyle=':')
        self.ax_st.set_ylabel(self.t("sp2100_avg_force_y", "Average Force (g)"), color=self.c_subtext)
        self.ax_st.tick_params(colors=self.c_subtext, labelsize=8)
        
        if not self.results:
            self.ax_st.set_title(self.t("sp2100_box_plot_title", "Statistical Comparison (Box Plot)"), color=self.c_text, fontsize=10, fontweight="bold")
            self.cv_st.draw_idle()
            return
            
        groups_data = {}
        for r in self.results:
            g = r.get("group", 1)
            if g not in groups_data:
                groups_data[g] = []
            groups_data[g].append(r["avg"])
            
        sorted_groups = sorted(groups_data.keys())
        plot_data = [groups_data[g] for g in sorted_groups]
        labels = [f"#{g}" for g in sorted_groups]
        
        if plot_data:
            bp = self.ax_st.boxplot(plot_data, patch_artist=True, tick_labels=labels)
            for box in bp['boxes']:
                box.set(color=self.c_border, linewidth=1.5)
                box.set(facecolor=self.c_blue, alpha=0.7)
            for whisker in bp['whiskers']:
                whisker.set(color=self.c_subtext, linewidth=1.5)
            for cap in bp['caps']:
                cap.set(color=self.c_subtext, linewidth=1.5)
            for median in bp['medians']:
                median.set(color=self.c_accent, linewidth=2)
            for flier in bp['fliers']:
                flier.set(marker='o', color=self.c_accent, alpha=0.5)
                
        self.ax_st.set_title(self.t("sp2100_box_plot_title", "Statistical Comparison (Box Plot)"), color=self.c_text, fontsize=10, fontweight="bold")
        self.cv_st.draw_idle()

    def _auto_record_comlink(self):
        """Comlink 버스트 종료 후 자동으로 결과를 테이블에 기록"""
        self._comlink_timer = None
        if not self.comlink_buf:
            return
        
        values = self.comlink_buf[:]
        self.comlink_buf = []
        
        # 의미 있는 값만 필터링 (절대값 0.01 이상)
        meaningful = [v for v in values if abs(v) >= 0.01]
        if not meaningful:
            self._log("[AUTO] 수신 값이 모두 0에 가까워 기록 건너뜀")
            return
        
        avg = sum(meaningful) / len(meaningful)
        peak = max(meaningful, key=abs)
        rid = self.run_no + 1
        self.run_no = rid
        SP2100App.master_run_no = self.run_no
        sn = self.v_sample.get()
        ld = self.v_load.get()
        spd = self.v_speed.get()
        dly = self.v_delay.get()
        evl = self.v_eval.get()
        self.results.append({"id": rid, "sample": sn, "avg": avg, "peak": peak, "load": ld, "speed": spd, "delay": dly, "eval": evl})
        
        row_data = ["☐", str(rid), sn, "", "", f"{avg:.3f}", f"{peak:.3f}", "", ld, spd, dly, evl]
        self.tree.insert_row(row_data)
        
        self._update_stats_graph()
        self._log(f"[AUTO 기록] #{rid} {sn} | 평균: {avg:.3f} | 피크: {peak:.3f} ({len(meaningful)}개 샘플)")
        # 버튼 활성화 (마지막 기록 삭제 가능하도록)
        self.btn_rec.config(state=tk.NORMAL)

    def _delete_last(self):
        """마지막으로 기록된 결과 삭제"""
        if not self.results:
            return
        self.results.pop()
        last_idx = len(self.results)
        self.tree.delete_rows([last_idx])
        self.run_no = max(0, self.run_no - 1)
        SP2100App.master_run_no = self.run_no
        self._update_stats_graph()
        self._log("[삭제] 마지막 기록 삭제됨")
        if not self.results:
            self.btn_rec.config(state=tk.DISABLED)



    def _clear_raw_graph(self):
        self.results.clear()
        self.run_no = 0
        SP2100App.master_run_no = 0
        self.tree.rebuild()
        self._update_stats_graph()
        self._log("[삭제] 모든 기록 초기화됨")

    def _restore_data(self):
        """복원: 클래스 저장소에 백업된 self.results가 있으면 테이블 그리드에 복원합니다."""
        if not self.results:
            return
        
        self.tree.rebuild() # 확실히 비우고 시작
        for r in self.results:
            n_disp = r.get("n_disp", str(r.get("id", "")))
            sn = r.get("sample", "")
            ld = r.get("load", "")
            spd = r.get("speed", "")
            dly = r.get("delay", "")
            evl = r.get("eval", "")
            
            if "val" in r:
                # _add_log_entry 기반 데이터
                row_data = ["☐", n_disp, sn, f"{r['val']:.1f}", f"{r['sp']:.1f}", f"{r['avg']:.1f}", f"{r['kp']:.1f}", f"{r['rms']:.1f}", ld, spd, dly, evl]
            else:
                # _auto_record_comlink 기반 데이터 (avg, peak만 존재)
                avg_val = r.get("avg", 0.0)
                peak_val = r.get("peak", 0.0)
                row_data = ["☐", str(r.get("id", "")), sn, "", "", f"{avg_val:.3f}", f"{peak_val:.3f}", "", ld, spd, dly, evl]
            
            self.tree.insert_row(row_data)
        
        self._update_stats_graph()
        self._log(f"[복원 완료] {len(self.results)}개의 이전 데이터 기록이 복원되었습니다.")

    def _on_resize(self, event):
        if event.widget != self.root:
            return
        if hasattr(self, '_resize_job') and self._resize_job:
            try: self.root.after_cancel(self._resize_job)
            except: pass
        self._resize_job = self.root.after(150, self._force_resize_plots)

    def _force_resize_plots(self, event=None):
        for canvas in [self.cv_st]:
            try:
                widget = canvas.get_tk_widget()
                w = widget.winfo_width()
                h = widget.winfo_height()
                if w > 20 and h > 20:
                    dpi = canvas.figure.dpi
                    canvas.figure.set_size_inches(w / dpi, h / dpi)
                    canvas.draw()
            except Exception as e:
                pass

    def _log(self, msg):
        try:
            self.log_text.insert(tk.END, f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}\n")
            self.log_text.see(tk.END)
        except: pass

    def _save_log(self):
        try:
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            fname = f"log_{ts}.txt"
            content = self.log_text.get(1.0, tk.END)
            with open(fname, "w", encoding="utf-8") as f:
                f.write(content)
            self._log(f"로그 저장 완료: {fname}")
            import subprocess
            subprocess.Popen(["notepad", fname])  # 메모장으로 바로 열기
        except Exception as e:
            self._log(f"로그 저장 실패: {e}")

    def _load_cfg(self):
        try:
            if os.path.exists("config.json"):
                with open("config.json") as f:
                    c = json.load(f)
                    if "port" in c: self.v_port.set(c["port"])
                    # 각 장비별 저장된 값 먼저 복원
                    self.last_load_sp2100  = c.get("sp2100_load", "2000")
                    self.last_load_tl2200  = c.get("tl2200_load", "25000")
                    self.last_baud_tl2200  = c.get("tl2200_baud", "38400")
                    if "sample" in c: self.v_sample.set(c["sample"])
                    if "speed"  in c: self.v_speed.set(c["speed"])
                    if "delay"  in c: self.v_delay_str.set(c["delay"])
                    if "eval"   in c: self.v_eval.set(c["eval"])
                    # 마지막에 모델 설정 → _on_model_change가 올바른 로드셀+baud 자동 적용
                    if "model" in c:
                        self._applied_model = None
                        self.v_model.set(c["model"])
                        self._on_model_change()
        except: pass

    def _save_cfg(self, *_):
        try:
            model = self.v_model.get()
            val = self.v_load.get()
            # Only update the cache if we are not programmatically changing models
            if not getattr(self, '_updating_model', False):
                if model == "SP-2100":
                    self.last_load_sp2100 = val
                elif model == "TL-2200":
                    self.last_load_tl2200 = val
                
            with open("config.json","w") as f:
                json.dump({
                    "port":        self.v_port.get(),
                    "model":       self.v_model.get(),
                    "sample":      self.v_sample.get(),
                    "load":        self.v_load.get(),
                    "sp2100_load": getattr(self, 'last_load_sp2100', "2000"),
                    "tl2200_load": getattr(self, 'last_load_tl2200', "25000"),
                    "tl2200_baud": getattr(self, 'last_baud_tl2200', "38400"),
                    "speed":       self.v_speed.get(),
                    "delay":       self.v_delay_str.get(),
                    "eval":        self.v_eval.get()
                }, f)
        except: pass


    def _on_error(self, msg):
        if "3초 동안 수신된 데이터가 없습니다" in msg:
            msg = self.t("sp2100_err_no_data_3s", "Warning: 3초 동안 수신된 데이터가 없습니다. 장비 전원을 확인하거나 송신 상태(Run)인지 확인하세요.")
        self._log(f"ERR: {msg}")

    def _export_data(self):
        if not self.results:
            messagebox.showwarning(self.t("error_title", "Warning"), self.t("sp2100_msg_no_data", "저장할 측정 데이터가 없습니다."))
            return
            
        from tkinter import filedialog
        file_path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV Files (*.csv)", "*.csv"), ("Text Files (*.txt)", "*.txt"), ("All Files (*.*)", "*.*")],
            title=self.t("sp2100_save_data", "측정 데이터 저장")
        )
        if not file_path:
            return
        if not file_path.lower().endswith('.csv') and not file_path.lower().endswith('.txt'):
            file_path += '.csv'
            
        try:
            _, ext = os.path.splitext(file_path)
            if ext.lower() == ".csv":
                import csv
                with open(file_path, "w", newline="", encoding="utf-8-sig") as f:
                    writer = csv.writer(f)
                    writer.writerow(["N", "Sample", "Val", "SP", "Avg", "KP", "RMS", "Load", "Speed", "Delay", "Eval"])
                    for r in self.results:
                        # 엑셀 날짜 자동 변환 방지: ="1-1" 형태로 출력
                        n_str = f'="{r["n_disp"]}"'
                        writer.writerow([n_str, r.get("sample",""), f"{r['val']:.1f}", f"{r['sp']:.1f}", f"{r['avg']:.1f}", f"{r['kp']:.1f}", f"{r['rms']:.1f}", r.get("load",""), r.get("speed",""), r.get("delay",""), r.get("eval","")])
            else:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write("="*80 + "\n")
                    f.write(" MASS Slip/Peel Logger 측정 데이터 보고서\n")
                    f.write(f" 저장 시간: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                    f.write("-" * 80 + "\n")
                    f.write(" [테스트 설정 정보]\n")
                    f.write(f" - 장비 모델: {self.v_model.get()}\n")
                    f.write(f" - 로드셀 용량: {self.v_load.get()} gf\n")
                    f.write(f" - 측정 속도: {self.v_speed.get()} in/min\n")
                    f.write(f" - 지연 시간: {self.v_delay.get()} s\n")
                    f.write(f" - 평가 시간: {self.v_eval.get()} s\n")
                    f.write("="*80 + "\n\n")
                    f.write(f"{'N':<6}{'Sample':<15}{'Val':<8}{'SP':<8}{'Avg':<8}{'KP':<8}{'RMS':<8}{'Load':<8}{'Speed':<8}{'Delay':<8}{'Eval':<8}\n")
                    f.write("-" * 80 + "\n")
                    for r in self.results:
                        f.write(f"{r['n_disp']:<6}{r.get('sample','')[:14]:<15}{r['val']:<8.1f}{r['sp']:<8.1f}{r['avg']:<8.1f}{r['kp']:<8.1f}{r['rms']:<8.1f}{r.get('load',''):<8}{r.get('speed',''):<8}{r.get('delay',''):<8}{r.get('eval',''):<8}\n")
                    f.write("-" * 80 + "\n")
            self._log(f"데이터 파일 저장 성공: {os.path.basename(file_path)}")
            messagebox.showinfo("Success", self.t("sp2100_msg_save_success", "데이터가 성공적으로 저장되었습니다."))
        except Exception as e:
            self._log(f"데이터 저장 실패: {e}")
            err_msg = self.t("sp2100_msg_save_fail", "파일 저장 중 에러가 발생했습니다:\n{e}").format(e=e)
            messagebox.showerror(self.t("error_title", "Error"), err_msg)

    def _copy_to_clipboard(self):
        if not self.results:
            messagebox.showwarning(self.t("error_title", "Warning"), self.t("sp2100_msg_no_data", "저장할 측정 데이터가 없습니다."))
            return
        
        try:
            lines = []
            # 헤더
            lines.append("N\tSample\tVal\tSP\tAvg\tKP\tRMS\tLoad\tSpeed\tDelay\tEval")
            for r in self.results:
                line = f"{r['n_disp']}\t{r.get('sample','')}\t{r['val']:.1f}\t{r['sp']:.1f}\t{r['avg']:.1f}\t{r['kp']:.1f}\t{r['rms']:.1f}\t{r.get('load','')}\t{r.get('speed','')}\t{r.get('delay','')}\t{r.get('eval','')}"
                lines.append(line)
            
            self.root.clipboard_clear()
            self.root.clipboard_append("\n".join(lines))
            self.root.update() # necessary to keep clipboard after app closes or continues
            self._log("데이터 클립보드 복사 성공")
            messagebox.showinfo("Success", self.t("sp2100_msg_copy_success", "데이터가 클립보드에 복사되었습니다. 엑셀 등에 붙여넣기 할 수 있습니다."))
        except Exception as e:
            self._log(f"클립보드 복사 실패: {e}")
            messagebox.showerror(self.t("error_title", "Error"), f"{self.t('sp2100_msg_copy_fail', '클립보드 복사 실패')}: {e}")

    def _on_destroy(self, event):
        if event.widget == self.root:
            if hasattr(self, '_resize_job') and self._resize_job:
                try: self.root.after_cancel(self._resize_job)
                except: pass
            if hasattr(self, '_flush_job') and self._flush_job:
                try: self.root.after_cancel(self._flush_job)
                except: pass
                
            try:
                self.ctrl.disconnect()
            except:
                pass

    def _on_close(self):
        if hasattr(self, '_resize_job') and self._resize_job:
            try: self.root.after_cancel(self._resize_job)
            except: pass
        if hasattr(self, '_flush_job') and self._flush_job:
            try: self.root.after_cancel(self._flush_job)
            except: pass
            
        try:
            self.ctrl.disconnect()
        except:
            pass
            
        if self.is_toplevel:
            self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk(); app = SP2100App(root); root.mainloop()
