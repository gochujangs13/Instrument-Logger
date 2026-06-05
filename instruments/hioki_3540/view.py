import customtkinter as ctk
from instruments.common.grid_instrument_view import GridInstrumentView
from constants import *

class HiokiView(GridInstrumentView):
    def __init__(self, master, app, **kwargs):
        super().__init__(master, app, **kwargs)

    def _add_custom_tools(self):
        # 1. Wire Mode — fixed to 4-Wire, display only (no interaction needed)
        ctk.CTkLabel(self.settings_container, text=self.app.t("meas_wire", "측정 방식"),
                     font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5, pady=(10, 2))
        ctk.CTkLabel(self.settings_container, text="4-Wire (Fixed)",
                     font=("Inter", 12), text_color=ACCENT_COLOR).pack(anchor="w", padx=10, pady=(0, 5))

        # 2. Sampling Speed — inline toggle (only 2 options)
        self.sampling_var = self._make_toggle_row(
            self.settings_container,
            label_text=self.app.t("sample_rate", "측정 속도"),
            options=["FAST", "SLOW"],
            default="SLOW",
            on_select=self._on_sampling_changed
        )

        # 3. Range — dropdown (7 options, too many for inline)
        ctk.CTkLabel(self.settings_container, text=self.app.t("meas_range", "측정 레인지"),
                     font=("Inter", 11, "bold"), text_color=TEXT_MUTED).pack(anchor="w", padx=5, pady=(10, 2))
        self.range_var = ctk.StringVar(value="Auto")
        ctk.CTkOptionMenu(
            self.settings_container,
            values=["Auto", "30 mΩ", "300 mΩ", "3 Ω", "30 Ω", "300 Ω", "3 kΩ", "30 kΩ"],
            variable=self.range_var,
            command=self._on_range_changed
        ).pack(fill="x", padx=5, pady=5)

    def _on_range_changed(self, val):
        if self.app.controller and self.app.controller.is_connected:
            range_map = {
                "30 mΩ": "30E-3", "300 mΩ": "300E-3",
                "3 Ω": "3", "30 Ω": "30", "300 Ω": "300",
                "3 kΩ": "3E3", "30 kΩ": "30E3"
            }
            code = "AUTO" if val == "Auto" else range_map.get(val, "AUTO")
            self.app.controller.set_range(code)

    def _on_sampling_changed(self, val):
        if self.app.controller and self.app.controller.is_connected:
            speed_code = "F" if val == "FAST" else "S"
            self.app.controller.set_sampling_speed(speed_code)
