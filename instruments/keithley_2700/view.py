import customtkinter as ctk
from instruments.common.grid_instrument_view import GridInstrumentView
from constants import *

class KeithleyView(GridInstrumentView):
    def __init__(self, master, app, **kwargs):
        super().__init__(master, app, **kwargs)

    def _add_custom_tools(self):
        # 1. Sampling Speed — inline toggle: FAST | MED | SLOW
        self.sampling_var = self._make_toggle_row(
            self.settings_container,
            label_text=self.app.t("sample_rate", "샘플링 속도"),
            options=["FAST", "MED", "SLOW"],
            default="MED",
            on_select=self._on_sampling_changed
        )

        # 2. Measurement Range — dropdown (Auto only for Keithley, kept for future)
        ctk.CTkLabel(self.settings_container, text=self.app.t("meas_range", "측정 레인지"),
                     font=("Inter", 11, "bold"), text_color=TEXT_MUTED
                     ).pack(anchor="w", padx=5, pady=(10, 2))
        self.range_var = ctk.StringVar(value="Auto")
        ctk.CTkOptionMenu(
            self.settings_container,
            values=["Auto"],
            variable=self.range_var,
            state="disabled"
        ).pack(fill="x", padx=5, pady=(0, 5))

        # 3. Wire Mode — inline toggle: 2-Wire | 4-Wire
        self.wire_var = self._make_toggle_row(
            self.settings_container,
            label_text=self.app.t("meas_wire", "측정 방식 (Keithley)"),
            options=["2-Wire", "4-Wire"],
            default="4-Wire",
            on_select=self._on_wire_changed
        )


    def _on_wire_changed(self, val):
        self.app.log_print(f"Wire mode → {val}. Reconnect to apply.")

    def _on_sampling_changed(self, val):
        if self.app.controller and self.app.controller.is_connected:
            self.app.controller.set_speed(val)

    def _on_zero_pressed(self):
        if self.app.controller and self.app.controller.is_connected:
            self.app.controller.trigger_zero()
            self.app.log_print("Zero (REL) applied.")
        else:
            self.app.log_print("Device disconnected — cannot apply Zero.")
