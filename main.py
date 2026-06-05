import sys
import os

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
import traceback
import logging
from logging.handlers import RotatingFileHandler
import customtkinter as ctk
# Enable automatic High DPI scaling to scale properly on 100%, 150%, and 200% displays
import ctypes
try:
    # Tell Windows the process is Per-Monitor DPI Aware (2) for crisp rendering across different displays
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass
from tkinter import messagebox, filedialog, Canvas, END
from PIL import Image
import serial.tools.list_ports
from datetime import datetime

# Modular Imports
from constants import *
from translations import TRANSLATIONS
from instruments.factory import DeviceFactory

# --- Logging Setup ---
logger = logging.getLogger("3MLogger")
logger.setLevel(logging.DEBUG)
handler = RotatingFileHandler("crash_log.txt", maxBytes=5*1024*1024, backupCount=1, encoding="utf-8")
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)

# --- Global Crash Handler ---
def handle_exception(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    logger.error("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))
sys.excepthook = handle_exception

from tkinterdnd2 import TkinterDnD

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        # Initialize TkinterDnD
        try:
            if getattr(sys, 'frozen', False):
                dnd_path = os.path.join(sys._MEIPASS, 'tkdnd')
                os.environ['TKDND_LIBRARY'] = dnd_path
            self.TkdndVersion = TkinterDnD._require(self)
            print(f"[DEBUG] TkinterDnD initialized: {self.TkdndVersion}")
        except Exception as e:
            print(f"[ERROR] DnD Loading Failed: {e}")
            self.TkdndVersion = None

        self.title("3M Instrument Logger")

        self.BASE_WIDTH, self.BASE_HEIGHT = 1400, 900
        self.scale = 1.0
        
        # State Variables
        self.lang_var = ctk.StringVar(value="Korean")
        self.theme_var = ctk.StringVar(value="Dark")
        self.device_type_var = ctk.StringVar(value="")
        self.port_var = ctk.StringVar(value="")
        
        # Default devices and favorites
        self.launcher_devices = ["Hioki 3540", "Keithley 2700", "Mitutoyo VL-50", "Agilent 4339B", "DAQ-6510", "AI Photo Editor", "MASS SP-2100"]
        self.favorites = []
        
        self.launcher_edit_mode = False
        self.dragging_index = None
        
        self.controller = None
        self.active_view = None
        self.cached_instruments = {} # Cache for fast screen transitions

        # UI Setup
        self._init_window()
        self._setup_ui_shell()
        self._load_config()
        self.show_launcher()

        # Safe Exit Protocol
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

    def on_closing(self):
        """프로그램 종료 시 모든 측정을 중단하고 계측기를 안전하게 해제합니다."""
        try:
            if self.controller:
                is_conn = getattr(self.controller, 'is_connected', False) or getattr(self.controller, 'connected', False)
                if is_conn:
                    if hasattr(self.controller, 'stop_measurement'):
                        try: self.controller.stop_measurement()
                        except: pass
                    if hasattr(self.controller, 'disconnect'):
                        try: self.controller.disconnect()
                        except: pass
            
            for k in list(self.cached_instruments.keys()):
                ctrl = self.cached_instruments[k].get("controller")
                if ctrl:
                    is_conn = getattr(ctrl, 'is_connected', False) or getattr(ctrl, 'connected', False)
                    if is_conn:
                        if hasattr(ctrl, 'stop_measurement'):
                            try: ctrl.stop_measurement()
                            except: pass
                        if hasattr(ctrl, 'disconnect'):
                            try: ctrl.disconnect()
                            except: pass
            import time
            time.sleep(0.2) # 통신 종료 시간 확보
        except Exception as e:
            pass
        finally:
            self.destroy()
            sys.exit(0)

    def _init_window(self):
        screen_h = self.winfo_screenheight()
        self.scale = min(1.0, max(0.65, screen_h / 1050))
        self.geometry(f"{int(self.BASE_WIDTH * self.scale)}x{int(self.BASE_HEIGHT * self.scale)}")
        self.minsize(900, 650)
        ctk.set_appearance_mode(self.theme_var.get())

    def _setup_ui_shell(self):
        # 1. Header
        self.header = ctk.CTkFrame(self, height=int(70 * self.scale), fg_color=HEADER_COLOR)
        self.header.pack(side="top", fill="x")
        self.header.pack_propagate(False)
        
        # Home Button (Far Left)
        self.btn_back = ctk.CTkButton(self.header, text="🏠 Home", width=100, command=self.show_launcher)
        self.btn_back.pack(side="left", padx=20)
        
        # Multi-color Title
        title_container = ctk.CTkFrame(self.header, fg_color="transparent")
        title_container.pack(side="left", fill="y")

        self.lbl_3m = ctk.CTkLabel(title_container, text="3M", font=("Inter", self.sf(24), "bold"), text_color="#FF0000")
        self.lbl_3m.pack(side="left", padx=(10, 0))

        self.lbl_title_main = ctk.CTkLabel(title_container, text=" Instrument Logger", font=("Inter", self.sf(24), "bold"))
        self.lbl_title_main.pack(side="left")

        self.lbl_device_name = ctk.CTkLabel(title_container, text="", font=("Inter", self.sf(20), "bold"), text_color=ACCENT_COLOR)
        self.lbl_device_name.pack(side="left", padx=(10, 0))
        
        # 2. Main Container
        self.main_container = ctk.CTkFrame(self, fg_color="transparent")
        self.main_container.pack(fill="both", expand=True)
        
        # 3. Frames
        self.launcher_frame = ctk.CTkFrame(self.main_container, fg_color="transparent")
        self.instrument_frame = ctk.CTkFrame(self.main_container, fg_color="transparent")

    def show_launcher(self):
        if self.controller:
            self.controller.disconnect()
            self.controller = None
        if self.active_view:
            self.active_view.pack_forget()
            self.active_view = None
        self.instrument_frame.pack_forget()
        
        self.lbl_device_name.configure(text="")
        self.launcher_frame.pack(fill="both", expand=True)
        
        # Build only if empty to save time
        if not self.launcher_frame.winfo_children():
            self._build_launcher_ui()
            
        self.update_idletasks()

    def launch_logger(self, device_name):
        if self.launcher_edit_mode: return
        self.device_type_var.set(device_name)
        self.launcher_frame.pack_forget()
        
        self.lbl_device_name.configure(text=f"({device_name})")
        
        if self.active_view:
            self.active_view.pack_forget()
            
        # UI & Logic Caching for instant load times
        if device_name not in self.cached_instruments:
            controller = DeviceFactory.get_controller(device_name)
            self.controller = controller  # Assign early so view can use it during init
            view = DeviceFactory.get_view(device_name, self.instrument_frame, self)
            self.cached_instruments[device_name] = {"controller": controller, "view": view}
            
        self.controller = self.cached_instruments[device_name]["controller"]
        self.active_view = self.cached_instruments[device_name]["view"]
        
        if self.active_view: 
            self.active_view.pack(fill="both", expand=True)
            self.instrument_frame.pack(fill="both", expand=True)
            self.update_idletasks()

    def _build_launcher_ui(self):
        if self.dragging_index is not None: return
        
        for child in self.launcher_frame.winfo_children(): child.destroy()
        
        # 1. Settings Header
        top_section = ctk.CTkFrame(self.launcher_frame, fg_color="transparent")
        top_section.pack(side="top", fill="x", pady=(40, 20))
        
        ctk.CTkLabel(top_section, text=self.t("launcher_subtitle"), font=("Inter", self.sf(32), "bold")).pack(pady=(0, 20))
        
        settings_bar = ctk.CTkFrame(top_section, fg_color="transparent")
        settings_bar.pack()
        
        # Theme/Lang
        ctk.CTkLabel(settings_bar, text=self.t("theme_setting") + ":", font=("Inter", self.sf(12), "bold")).pack(side="left", padx=10)
        self.theme_menu = ctk.CTkOptionMenu(settings_bar, values=["Light", "Dark"], variable=self.theme_var, width=100, command=self._on_theme_changed)
        self.theme_menu.pack(side="left", padx=(0, 10))
        
        ctk.CTkLabel(settings_bar, text=self.t("lang_setting") + ":", font=("Inter", self.sf(12), "bold")).pack(side="left", padx=10)
        self.lang_menu = ctk.CTkOptionMenu(settings_bar, values=["Korean", "English"], variable=self.lang_var, width=120, command=self._on_lang_changed)
        self.lang_menu.pack(side="left", padx=(0, 20))
        
        # Edit mode and favorite management are disabled for fixed registry.
        pass

        # 2. Scrollable Area with Sections
        scroll = ctk.CTkScrollableFrame(self.launcher_frame, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=40, pady=10)
        
        # Categorize
        fav_list = [d for d in self.launcher_devices if d in self.favorites]
        ins_list = [d for d in self.launcher_devices if d not in self.favorites and DeviceFactory.REGISTRY.get(d, {}).get("category") == "Instrument"]
        util_list = [d for d in self.launcher_devices if d not in self.favorites and DeviceFactory.REGISTRY.get(d, {}).get("category") == "Utility"]

        # Build Sections
        if fav_list or self.launcher_edit_mode:
            self._build_section(scroll, self.t("section_fav"), fav_list)
        
        if ins_list:
            self._build_section(scroll, self.t("section_ins"), ins_list)
            
        if util_list:
            self._build_section(scroll, self.t("section_util"), util_list)

    def _build_section(self, master, title, devices):
        container = ctk.CTkFrame(master, fg_color="transparent")
        container.pack(fill="x", pady=20)
        
        # Header
        header_frame = ctk.CTkFrame(container, fg_color="transparent")
        header_frame.pack(fill="x", padx=10)
        ctk.CTkLabel(header_frame, text=title, font=("Inter", self.sf(20), "bold"), text_color=ACCENT_COLOR).pack(side="left")
        ctk.CTkFrame(header_frame, height=2, fg_color=BORDER_SUBTLE).pack(side="left", fill="x", expand=True, padx=20)

        # Grid
        grid = ctk.CTkFrame(container, fg_color="transparent")
        grid.pack(pady=10)
        
        for i, name in enumerate(devices):
            card = ctk.CTkFrame(grid, width=self.sf(280), height=self.sf(320), corner_radius=15, 
                                border_width=2, border_color=ACCENT_COLOR if self.launcher_edit_mode else BORDER_SUBTLE)
            card.grid(row=i//4, column=i%4, padx=15, pady=15)
            card.pack_propagate(False)
            card.device_name = name
            
            # Icon
            img_filename = DeviceFactory.REGISTRY.get(name, {}).get("icon", "")
            img_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", img_filename)
            lbl_img = None
            if os.path.exists(img_path):
                try:
                    pil_img = Image.open(img_path)
                    ctk_img = ctk.CTkImage(light_image=pil_img, dark_image=pil_img, size=(self.sf(220), self.sf(220)))
                    lbl_img = ctk.CTkLabel(card, text="", image=ctk_img)
                    lbl_img.pack(pady=(20, 10))
                except: pass
            if not lbl_img:
                lbl_img = ctk.CTkLabel(card, text=name[0], font=("Inter", self.sf(80), "bold"), height=self.sf(220))
                lbl_img.pack(pady=(20, 10))
                
            lbl_name = ctk.CTkLabel(card, text=name, font=("Inter", self.sf(20), "bold"))
            lbl_name.pack(pady=(0, 20))
            
            # Favorite/Pin Button (Visible in Edit Mode)
            if self.launcher_edit_mode:
                is_fav = name in self.favorites
                btn_pin = ctk.CTkButton(card, text="⭐" if is_fav else "☆", width=30, height=30,
                                       fg_color="transparent", text_color=ACCENT_COLOR,
                                       font=("Inter", self.sf(16), "bold"),
                                       command=lambda n=name: self._toggle_favorite(n))
                btn_pin.place(relx=0.95, rely=0.05, anchor="ne")
                self._bind_drag_events(card, lbl_img, lbl_name)
            else:
                self._bind_normal_events(card, lbl_img, lbl_name, name)

    def _bind_normal_events(self, card, img, name_lbl, device_name):
        def on_enter(e): card.configure(border_color=ACCENT_COLOR)
        def on_leave(e): card.configure(border_color=BORDER_SUBTLE)
        for w in [card, img, name_lbl]:
            w.bind("<Enter>", on_enter)
            w.bind("<Leave>", on_leave)
            w.bind("<Button-1>", lambda e, n=device_name: self.launch_logger(n))

    def _bind_drag_events(self, card, img, name_lbl):
        def on_press(e):
            if card.device_name in self.launcher_devices:
                self.dragging_index = self.launcher_devices.index(card.device_name)
            card.configure(border_color=WARNING_COLOR)
        
        def on_drag(e):
            pass

        def on_release(e):
            if self.dragging_index is not None:
                target_widget = self.winfo_containing(e.x_root, e.y_root)
                target_card = None
                w = target_widget
                while w:
                    if hasattr(w, 'device_name'):
                        target_card = w
                        break
                    if w == self:
                        break
                    w = w.master
                
                if target_card and target_card.device_name != card.device_name:
                    if card.device_name in self.launcher_devices and target_card.device_name in self.launcher_devices:
                        old_idx = self.launcher_devices.index(card.device_name)
                        new_idx = self.launcher_devices.index(target_card.device_name)
                        item = self.launcher_devices.pop(old_idx)
                        self.launcher_devices.insert(new_idx, item)
            
            self.dragging_index = None
            self._build_launcher_ui()

        for w in [card, img, name_lbl]:
            w.bind("<ButtonPress-1>", on_press)
            w.bind("<B1-Motion>", on_drag)
            w.bind("<ButtonRelease-1>", on_release)

    def _toggle_favorite(self, name):
        if name in self.favorites:
            self.favorites.remove(name)
        else:
            self.favorites.append(name)
        self._build_launcher_ui()

    def _toggle_launcher_edit_mode(self):
        self.launcher_edit_mode = not self.launcher_edit_mode
        self.dragging_index = None
        self._build_launcher_ui()
        if not self.launcher_edit_mode: self._save_config()

    def _on_theme_changed(self, new_theme):
        ctk.set_appearance_mode(new_theme)
        self._save_config()
        # Clear cached instruments so they rebuild with the new theme
        for k in list(self.cached_instruments.keys()):
            if self.cached_instruments[k]["view"]:
                self.cached_instruments[k]["view"].destroy()
        self.cached_instruments.clear()
        self.active_view = None
        self.controller = None

    def _on_lang_changed(self, new_lang):
        self._save_config()
        self._build_launcher_ui()
        # Clear cached instruments so they rebuild with the new language
        for k in list(self.cached_instruments.keys()):
            if self.cached_instruments[k]["view"]:
                self.cached_instruments[k]["view"].destroy()
        self.cached_instruments.clear()
        self.active_view = None
        self.controller = None

    def t(self, key, default=None):
        return TRANSLATIONS.get(self.lang_var.get(), {}).get(key, default if default else key)

    def sf(self, size): return int(size * self.scale)

    def _load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    cfg = json.load(f)
                    self.lang_var.set(cfg.get("lang", "Korean"))
                    self.theme_var.set(cfg.get("theme", "Dark"))
            except: pass

    def _save_config(self):
        cfg = {
            "lang": self.lang_var.get(), 
            "theme": self.theme_var.get()
        }
        with open(CONFIG_FILE, "w") as f: json.dump(cfg, f, indent=4)


if __name__ == "__main__":
    app = App()
    app.mainloop()
