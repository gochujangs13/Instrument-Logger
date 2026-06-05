import os

# ── 경로 설정 ────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

# ── 색상 팔레트 ───────────────────────────────────────────────────────────────
BG_COLOR       = ("#F8FAFC", "#0F172A")
PANEL_COLOR    = ("#FFFFFF", "#1E293B")
DASHBOARD_BG   = ("#D1D5DB", "#111827")
DASHBOARD_TEXT = ("#475569", "#E2E8F0")
ACCENT_COLOR   = ("#0369A1", "#60A5FA")
DISPLAY_VAL    = ("#000000", "#38BDF8")
SUCCESS_COLOR  = ("#0D9488", "#34D399")
TEXT_COLOR     = ("#1E293B", "#F9FAFB")
HEADER_COLOR   = ("#FFFFFF", "#111827")
WARNING_COLOR  = ("#F59E0B", "#FBBF24")
DANGER_COLOR   = ("#EF4444", "#F87171")
ENTRY_BG       = ("#F1F5F9", "#1F2937")
ENTRY_FOCUS    = ("#FEF9C3", "#1E3A8A")
TEXT_MUTED     = ("#64748B", "#9CA3AF")
BORDER_SUBTLE  = ("#CBD5E1", "#374151")
SIDEBAR_BLUE   = ("#D1EDFF", "#111827")
GRID_HDR_BG    = ("#E2E8F0", "#1E2937")

# 하드코딩 색상 상수
COLOR_BLUE_BTN       = "#3B82F6"
COLOR_BLUE_BTN_HOVER = "#2563EB"
COLOR_GREEN_BTN      = "#15803D"
COLOR_GREEN_HOVER    = "#166534"
COLOR_GRAY_BTN       = "#6B7280"
COLOR_RED_HOVER      = "#B91C1C"
COLOR_WHITE          = "#FFFFFF"
COLOR_DARK_BORDER    = ("#1F2937", "#000000")

import customtkinter as ctk

def _c(color_tuple):
    """라이트/다크 모드 색상 튜플에서 현재 모드에 맞는 색상 문자열 반환을 위한 헬퍼"""
    if isinstance(color_tuple, str):
        return color_tuple
    
    # CustomTkinter의 현재 모드 가져오기
    try:
        mode = ctk.get_appearance_mode()
        if mode == "Light":
            return color_tuple[0]
        else:
            return color_tuple[1]
    except Exception:
        # Default to Dark mode if appearance mode cannot be determined
        return color_tuple[1]
