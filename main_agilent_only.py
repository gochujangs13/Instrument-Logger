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
import ctypes

try:
    # Tell Windows the process is Per-Monitor DPI Aware (2) for crisp rendering
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

from tkinter import messagebox, filedialog
from PIL import Image
from datetime import datetime

# Modular Imports
from constants import *
from translations import TRANSLATIONS
from instruments.agilent_4339b.controller import Agilent4339BController
from instruments.agilent_4339b.view import AgilentView

# --- Logging Setup ---
logger = logging.getLogger("AgilentLogger")
logger.setLevel(logging.DEBUG)
handler = RotatingFileHandler("agilent_crash_log.txt", maxBytes=5*1024*1024, backupCount=1, encoding="utf-8")
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

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.title("3M Instrument Logger - Agilent 4339B")

        self.BASE_WIDTH, self.BASE_HEIGHT = 1400, 900
        self.scale = 1.0
        
        # State Variables
        self.lang_var = ctk.StringVar(value="Korean")
        self.theme_var = ctk.StringVar(value="Dark")
        
        self.controller = None
        self.active_view = None

        # UI Setup
        self._init_window()
        self._setup_ui_shell()
        self._load_config()
        self.launch_logger()

        # Safe Exit Protocol
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

    def on_closing(self):
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
            import time
            time.sleep(0.2)
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
        
        # Multi-color Title
        title_container = ctk.CTkFrame(self.header, fg_color="transparent")
        title_container.pack(side="left", fill="y")

        self.lbl_3m = ctk.CTkLabel(title_container, text="3M", font=("Inter", self.sf(24), "bold"), text_color="#FF0000")
        self.lbl_3m.pack(side="left", padx=(20, 0))

        self.lbl_title_main = ctk.CTkLabel(title_container, text=" Instrument Logger", font=("Inter", self.sf(24), "bold"))
        self.lbl_title_main.pack(side="left")

        self.lbl_device_name = ctk.CTkLabel(title_container, text=" (Agilent 4339B)", font=("Inter", self.sf(20), "bold"), text_color=ACCENT_COLOR)
        self.lbl_device_name.pack(side="left", padx=(10, 0))
        
        # 2. Main Container
        self.main_container = ctk.CTkFrame(self, fg_color="transparent")
        self.main_container.pack(fill="both", expand=True)
        
        self.instrument_frame = ctk.CTkFrame(self.main_container, fg_color="transparent")
        self.instrument_frame.pack(fill="both", expand=True)

    def launch_logger(self):
        self.controller = Agilent4339BController()
        # In factory.py: return cls.REGISTRY[name]["view"](master, app)
        self.active_view = AgilentView(self.instrument_frame, self)
        
        if self.active_view: 
            self.active_view.pack(fill="both", expand=True)
            self.update_idletasks()

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
