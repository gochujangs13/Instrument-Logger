# -*- coding: utf-8 -*-
"""
Epson PRIFIA OK900P — DPI & Unit Converter Module
360 DPI 기반의 밀리미터(mm), 픽셀(px), 포인트(pt) 정밀 변환 및 테이프 규격 관리 모듈
"""

from dataclasses import dataclass
from typing import Dict, List, Tuple

# Epson PRIFIA OK900P 기본 사양
PRINTER_NAME = "PRIFIA OK900P"
PRINTER_DPI = 360
INCH_TO_MM = 25.4

# 360 DPI 기준 1mm 당 도트 수 (360 / 25.4 ≈ 14.1732)
DOTS_PER_MM = PRINTER_DPI / INCH_TO_MM

# 포인트(pt) 변환 (1 pt = 1/72 inch) -> 360 / 72 = 5 px/pt
DOTS_PER_PT = PRINTER_DPI / 72.0


@dataclass(frozen=True)
class TapeSpec:
    """테이프 규격별 제원 정보"""
    width_mm: float          # 테이프 전체 폭 (mm)
    max_print_mm: float      # 최대 인쇄 가능 폭 (mm)
    min_lead_margin_mm: float # 최소 여백 (mm)
    std_lead_margin_mm: float # 표준 여백 (mm)

    @property
    def width_px(self) -> int:
        """360 DPI 기준 테이프 폭(px)"""
        return round(self.width_mm * DOTS_PER_MM)

    @property
    def max_print_px(self) -> int:
        """360 DPI 기준 최대 인쇄 높이(px)"""
        return round(self.max_print_mm * DOTS_PER_MM)

    @property
    def side_margin_mm(self) -> float:
        """상하 여백 (mm)"""
        return max(0.0, (self.width_mm - self.max_print_mm) / 2.0)

    @property
    def side_margin_px(self) -> int:
        """상하 여백 (px)"""
        return round(self.side_margin_mm * DOTS_PER_MM)


# Epson PRIFIA OK900P 공식 지원 테이프 규격 테이블 (mm)
# 4mm, 6mm, 9mm, 12mm, 18mm, 24mm, 36mm
SUPPORTED_TAPES: Dict[float, TapeSpec] = {
    4.0:  TapeSpec(width_mm=4.0,  max_print_mm=2.0,  min_lead_margin_mm=2.0, std_lead_margin_mm=10.0),
    6.0:  TapeSpec(width_mm=6.0,  max_print_mm=4.0,  min_lead_margin_mm=2.0, std_lead_margin_mm=10.0),
    9.0:  TapeSpec(width_mm=9.0,  max_print_mm=6.5,  min_lead_margin_mm=2.0, std_lead_margin_mm=10.0),
    12.0: TapeSpec(width_mm=12.0, max_print_mm=9.0,  min_lead_margin_mm=2.0, std_lead_margin_mm=10.0),
    18.0: TapeSpec(width_mm=18.0, max_print_mm=14.0, min_lead_margin_mm=2.0, std_lead_margin_mm=10.0),
    24.0: TapeSpec(width_mm=24.0, max_print_mm=18.5, min_lead_margin_mm=2.0, std_lead_margin_mm=10.0),
    36.0: TapeSpec(width_mm=36.0, max_print_mm=27.1, min_lead_margin_mm=2.0, std_lead_margin_mm=10.0),
}


class UnitConverter:
    """360 DPI 기반 치수 변환 유틸리티 클래스"""

    DPI: int = PRINTER_DPI

    @classmethod
    def mm_to_px(cls, mm: float) -> int:
        """밀리미터(mm)를 360 DPI 픽셀(px)로 변환 (반올림)"""
        return int(round(mm * DOTS_PER_MM))

    @classmethod
    def mm_to_px_f(cls, mm: float) -> float:
        """밀리미터(mm)를 360 DPI 픽셀(px) 부동소수점으로 변환"""
        return mm * DOTS_PER_MM

    @classmethod
    def px_to_mm(cls, px: float) -> float:
        """360 DPI 픽셀(px)을 밀리미터(mm)로 변환"""
        return px / DOTS_PER_MM

    @classmethod
    def pt_to_px(cls, pt: float) -> int:
        """폰트 포인트(pt)를 360 DPI 픽셀(px)로 변환 (1pt = 5px at 360 DPI)"""
        return int(round(pt * DOTS_PER_PT))

    @classmethod
    def px_to_pt(cls, px: float) -> float:
        """360 DPI 픽셀(px)을 폰트 포인트(pt)로 변환"""
        return px / DOTS_PER_PT

    @classmethod
    def get_tape_spec(cls, width_mm: float) -> TapeSpec:
        """테이프 폭에 해당하는 제원 반환 (가장 가까운 규격)"""
        if width_mm in SUPPORTED_TAPES:
            return SUPPORTED_TAPES[width_mm]
        closest = min(SUPPORTED_TAPES.keys(), key=lambda w: abs(w - width_mm))
        return SUPPORTED_TAPES[closest]

    @classmethod
    def get_supported_tape_widths(cls) -> List[float]:
        """지원 테이프 폭 목록 반환 [4.0, 6.0, 9.0, 12.0, 18.0, 24.0, 36.0]"""
        return sorted(list(SUPPORTED_TAPES.keys()))
