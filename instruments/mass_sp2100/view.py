import customtkinter as ctk
import sys
import os

class SP2100View(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        
        # Add local directory to sys.path to allow sibling imports inside logger_main
        cur_file_dir = os.path.dirname(os.path.abspath(__file__))
        if cur_file_dir not in sys.path:
            sys.path.insert(0, cur_file_dir)
            
        try:
            # We import SP2100App from the local logger_main which we copied
            from .logger_main import SP2100App
            self.logger_app = SP2100App(self)
        except Exception as e:
            import traceback
            traceback.print_exc()
            lbl = ctk.CTkLabel(self, text="MASS SP-2100 로거를 로드하는 데 실패했습니다.", font=("Inter", 16, "bold"), text_color="#ef4444")
            lbl.pack(pady=50)
            err_lbl = ctk.CTkLabel(self, text=f"Error: {e}", font=("Inter", 12), text_color="#94a3b8")
            err_lbl.pack(pady=10)
            self.logger_app = None

        self.bind("<Map>", self._on_map)

    def _on_map(self, event):
        if event.widget == self:
            if hasattr(self, 'logger_app') and self.logger_app:
                self.logger_app.apply_style()

