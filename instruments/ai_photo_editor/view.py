import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
import os
import sys

# Integrated imports
from base_instrument import BaseInstrumentView
from .ui_step1 import Step1Frame
from .ui_step2 import Step2Frame

class PhotoEditorView(BaseInstrumentView):
    def __init__(self, master, app, **kwargs):
        super().__init__(master, app, **kwargs)
        
        # Shared state (previously in App)
        self.files = []          # list of {"path","name","size","image"(PIL),"w","h"}
        self.crop_rect = None    # (x, y, w, h) in original-image coords
        self.center_rel_rect = None # (rel_center_x, rel_center_y, rel_w, rel_h) in % (0-1)

        # Container
        self.container = ctk.CTkFrame(self, fg_color="transparent")
        self.container.pack(fill="both", expand=True)

        self.step1 = Step1Frame(self.container, self)
        self.step2 = Step2Frame(self.container, self)

        self.show_step1()

    def update_ui_text(self):
        """다국어 지원 등 UI 텍스트 갱신 (필요 시 구현)"""
        if hasattr(self.step1, "update_ui_text"):
            self.step1.update_ui_text()
        if hasattr(self.step2, "update_ui_text"):
            self.step2.update_ui_text()

    # Navigation
    def show_step1(self):
        self.step2.pack_forget()
        self.step1.pack(fill="both", expand=True)

    def show_step2(self):
        try:
            print("[DEBUG] Transitioning to Step 2...")
            self.step1.pack_forget()
            self.step2.pack(fill="both", expand=True)
            self.update() # Force UI update before heavy rendering
            self.step2.render_preview()
            print("[DEBUG] Step 2 loaded successfully.")
        except Exception as e:
            print(f"[ERROR] Step 2 transition failed: {e}")
            import traceback
            traceback.print_exc()
            tk.messagebox.showerror(
                self.app.t("error_title", "오류"), 
                f"{self.app.t('transition_error', '전환 중 오류가 발생했습니다')}:\n{e}"
            )
            self.step1.pack(fill="both", expand=True)

