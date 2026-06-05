from instruments.agilent_4339b.view import AgilentView
from instruments.agilent_4339b.controller import Agilent4339BController
from instruments.mitutoyo_vl50.view import VL50View
from instruments.mitutoyo_vl50.controller import VL50Controller
from instruments.hioki_3540.controller import Hioki3540Controller
from instruments.keithley_2700.controller import Keithley2700Controller
from instruments.hioki_3540.view import HiokiView
from instruments.keithley_2700.view import KeithleyView
from instruments.daq_6510.view import SmartLoggerView
from instruments.daq_6510.controller import DAQ6510Controller
from instruments.ai_photo_editor.view import PhotoEditorView
from instruments.mass_sp2100.view import SP2100View

class DeviceFactory:
    REGISTRY = {
        "Agilent 4339B": {
            "controller": Agilent4339BController,
            "view": AgilentView,
            "icon": "agilent_4339b.png",
            "category": "Instrument"
        },
        "Mitutoyo VL-50": {
            "controller": VL50Controller,
            "view": VL50View,
            "icon": "mitutoyo_vl50.png",
            "category": "Instrument"
        },
        "Hioki 3540": {
            "controller": Hioki3540Controller,
            "view": HiokiView,
            "icon": "hioki_3540.png",
            "category": "Instrument"
        },
        "Keithley 2700": {
            "controller": Keithley2700Controller,
            "view": KeithleyView,
            "icon": "keithley_2700.png",
            "category": "Instrument"
        },
        "DAQ-6510": {
            "controller": DAQ6510Controller,
            "view": SmartLoggerView,
            "icon": "Daq_6510.png",
            "category": "Instrument"
        },
        "AI Photo Editor": {
            "controller": None,
            "view": PhotoEditorView,
            "icon": "ai_photo_editor.png",
            "category": "Utility"
        },
        "MASS SP-2100": {
            "controller": None,
            "view": SP2100View,
            "icon": "sp2100.png",
            "category": "Instrument"
        }
    }


    @classmethod
    def get_controller(cls, name):
        if name in cls.REGISTRY:
            ctrl_class = cls.REGISTRY[name]["controller"]
            if ctrl_class:
                return ctrl_class()
        return None


    @classmethod
    def get_view(cls, name, master, app):
        if name in cls.REGISTRY and cls.REGISTRY[name]["view"]:
            return cls.REGISTRY[name]["view"](master, app)
        return None
