# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Epson PRIFIA OK900P — Printer Controller Module
Windows Spooler API (win32print, win32ui) 및 QPrinter를 통한
프린터 검색, 드라이버 자동 바인딩, 사용자 정의 테이프 용지 크기 설정 및 1:1 인쇄 제어
"""

import sys
import os
import ctypes
from ctypes import wintypes
from typing import TYPE_CHECKING, List, Optional, Tuple, Dict, Any

try:
    import win32print
    WIN32PRINT_AVAILABLE = True
except ImportError:
    win32print = None
    WIN32PRINT_AVAILABLE = False

try:
    import win32ui
    import win32gui
    import win32con
    from PIL import ImageWin
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False

from .converter import UnitConverter, PRINTER_NAME, PRINTER_DPI

if TYPE_CHECKING:
    from PIL import Image
    from .renderer import LabelModel


def _enum_printers_native() -> List[str]:
    """Read installed Windows printers without pywin32 or Pillow.

    The direct Winspool call is intentionally used only for discovery. Printing
    still requires the full renderer and pywin32 path below.
    """
    if os.name != 'nt':
        return []

    class PRINTER_INFO_2W(ctypes.Structure):
        _fields_ = [
            ('pServerName', wintypes.LPWSTR), ('pPrinterName', wintypes.LPWSTR),
            ('pShareName', wintypes.LPWSTR), ('pPortName', wintypes.LPWSTR),
            ('pDriverName', wintypes.LPWSTR), ('pComment', wintypes.LPWSTR),
            ('pLocation', wintypes.LPWSTR), ('pDevMode', wintypes.LPVOID),
            ('pSepFile', wintypes.LPWSTR), ('pPrintProcessor', wintypes.LPWSTR),
            ('pDatatype', wintypes.LPWSTR), ('pParameters', wintypes.LPWSTR),
            ('pSecurityDescriptor', wintypes.LPVOID), ('Attributes', wintypes.DWORD),
            ('Priority', wintypes.DWORD), ('DefaultPriority', wintypes.DWORD),
            ('StartTime', wintypes.DWORD), ('UntilTime', wintypes.DWORD),
            ('Status', wintypes.DWORD), ('cJobs', wintypes.DWORD), ('AveragePPM', wintypes.DWORD),
        ]

    flags = 0x00000002 | 0x00000004  # PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
    needed = wintypes.DWORD(0)
    returned = wintypes.DWORD(0)
    spooler = ctypes.WinDLL('winspool.drv', use_last_error=True)
    enum = spooler.EnumPrintersW
    enum.argtypes = [wintypes.DWORD, wintypes.LPWSTR, wintypes.DWORD, wintypes.LPBYTE,
                     wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.DWORD)]
    enum.restype = wintypes.BOOL
    enum(flags, None, 2, None, 0, ctypes.byref(needed), ctypes.byref(returned))
    if not needed.value:
        return []
    buf = (ctypes.c_byte * needed.value)()
    if not enum(flags, None, 2, ctypes.cast(buf, wintypes.LPBYTE), needed.value,
                ctypes.byref(needed), ctypes.byref(returned)):
        return []
    records = ctypes.cast(buf, ctypes.POINTER(PRINTER_INFO_2W))
    return [records[i].pPrinterName for i in range(returned.value) if records[i].pPrinterName]


def _get_default_printer_native() -> Optional[str]:
    if os.name != 'nt':
        return None
    needed = wintypes.DWORD(0)
    spooler = ctypes.WinDLL('winspool.drv', use_last_error=True)
    get_default = spooler.GetDefaultPrinterW
    get_default.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    get_default.restype = wintypes.BOOL
    get_default(None, ctypes.byref(needed))
    if not needed.value:
        return None
    buf = ctypes.create_unicode_buffer(needed.value)
    return buf.value if get_default(buf, ctypes.byref(needed)) else None


class PrinterController:
    """Epson PRIFIA OK900P 및 Windows 프린터 제어기"""

    # 자동 검색 우선순위 키워드
    AUTO_DETECT_KEYWORDS = ["OK900P", "PRIFIA", "LW-900", "EPSON TAPE", "LABEL PRINTER"]

    @classmethod
    def get_printers(cls) -> List[str]:
        """시스템에 설치된 모든 Windows 프린터 목록 반환"""
        if WIN32PRINT_AVAILABLE:
            try:
                flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
                return [p[2] for p in win32print.EnumPrinters(flags)]
            except Exception as e:
                print(f"[PrinterController] pywin32 EnumPrinters 오류: {e}")
        try:
            printers = _enum_printers_native()
            if printers:
                return printers
        except Exception as e:
            print(f"[PrinterController] Winspool EnumPrinters 오류: {e}")
        return []

    @classmethod
    def auto_detect_ok900p(cls) -> Optional[str]:
        """Epson PRIFIA OK900P 프린터 드라이버 자동 검색"""
        printers = cls.get_printers()
        # 1. 키워드 매칭
        for kw in cls.AUTO_DETECT_KEYWORDS:
            for p in printers:
                if kw.upper() in p.upper():
                    return p
        # 2. 기본 프린터 확인
        try:
            default_p = win32print.GetDefaultPrinter() if WIN32PRINT_AVAILABLE else _get_default_printer_native()
            if default_p:
                for kw in cls.AUTO_DETECT_KEYWORDS:
                    if kw.upper() in default_p.upper():
                        return default_p
        except Exception:
            pass

        return None

    @classmethod
    def get_detected_tape_width(cls, printer_name: str) -> Optional[float]:
        """프린터 드라이버 DEVMODE에서 현재 설정된 테이프 폭(mm) 조회"""
        if not WIN32_AVAILABLE or not printer_name:
            return None
        try:
            hprinter = win32print.OpenPrinter(printer_name)
            try:
                props = win32print.GetPrinter(hprinter, 2)
                dm = props.get('pDevMode')
                if dm:
                    rev_map = {
                        274: 4.0,
                        259: 6.0,
                        260: 9.0,
                        261: 12.0,
                        262: 18.0,
                        263: 24.0,
                        264: 36.0,
                    }
                    if dm.PaperSize in rev_map:
                        return rev_map[dm.PaperSize]
                    if dm.PaperWidth:
                        return round(dm.PaperWidth / 10.0, 1)
            finally:
                win32print.ClosePrinter(hprinter)
        except Exception as e:
            print(f"[PrinterController] get_detected_tape_width error: {e}")
        return None

    @classmethod
    def print_label_spooler(
        cls,
        printer_name: str,
        image: Image.Image,
        model: LabelModel,
        copies: int = 1,
        job_title: str = "Epson PRIFIA OK900P Label Print"
    ) -> Tuple[bool, str]:
        """
        Windows Spooler API(win32print, win32ui)를 사용하여 360 DPI 1-bit 비트맵을 1:1 출력.
        테이프 폭 및 길이에 맞춰 사용자 정의 용지(User-defined Paper Size)를 DEVMODE에 적용.
        """
        if not WIN32_AVAILABLE:
            return False, "win32print / win32ui 모듈을 사용할 수 없습니다."

        try:
            # 1. 프린터 핸들 및 DEVMODE 획득
            hprinter = win32print.OpenPrinter(printer_name)
            devmode = None
            try:
                # 0.1 mm 단위 (e.g. 18mm -> 180, 24mm -> 240, 65mm -> 650)
                width_mm = float(model.tape_width_mm)
                length_mm = float(model.effective_length_mm)

                # Epson PRIFIA OK900P 공식 지원 테이프 ID 및 폭 매핑
                TAPE_PAPER_MAP = {
                    4.0:  (274, 40),
                    6.0:  (259, 60),
                    9.0:  (260, 90),
                    12.0: (261, 120),
                    18.0: (262, 180),
                    24.0: (263, 240),
                    36.0: (264, 360),
                }
                closest_w = min(TAPE_PAPER_MAP.keys(), key=lambda w: abs(w - width_mm))
                paper_id, width_01mm = TAPE_PAPER_MAP[closest_w]
                length_01mm = max(150, int(round(length_mm * 10)))

                props = win32print.GetPrinter(hprinter, 2)
                devmode = props.get('pDevMode')
                if devmode:
                    devmode.Fields |= (
                        win32con.DM_PAPERSIZE |
                        win32con.DM_PAPERLENGTH |
                        win32con.DM_PAPERWIDTH |
                        win32con.DM_PRINTQUALITY |
                        win32con.DM_COPIES |
                        win32con.DM_ORIENTATION
                    )
                    devmode.PaperSize = paper_id
                    devmode.PaperWidth = width_01mm
                    devmode.PaperLength = length_01mm
                    devmode.PrintQuality = PRINTER_DPI
                    devmode.Copies = max(1, copies)

                    # OK900P는 테이프 배출 방향(길이)이 X축이므로 일반 가로 라벨은 LANDSCAPE 필수!
                    if model.orientation == "vertical":
                        devmode.Orientation = win32con.DMORIENT_PORTRAIT
                    else:
                        devmode.Orientation = win32con.DMORIENT_LANDSCAPE
            finally:
                win32print.ClosePrinter(hprinter)

            # 2. DC (Device Context) 생성
            if devmode:
                raw_hdc = win32gui.CreateDC("WINSPOOL", printer_name, devmode)
                hdc = win32ui.CreateDCFromHandle(raw_hdc)
            else:
                hdc = win32ui.CreateDC()
                hdc.CreatePrinterDC(printer_name)

            # 3. 인쇄 작업 시작
            hdc.StartDoc(job_title)
            for copy_idx in range(max(1, copies)):
                hdc.StartPage()

                # RGB 모드로 변환 (DIB 출력 호환성)
                rgb_img = image.convert('RGB')
                dib = ImageWin.Dib(rgb_img)

                # 하드웨어 마진 오프셋 보정 (물리적 테이프 경계와 1:1 일치)
                off_x = hdc.GetDeviceCaps(win32con.PHYSICALOFFSETX) if hasattr(win32con, 'PHYSICALOFFSETX') else 0
                off_y = hdc.GetDeviceCaps(win32con.PHYSICALOFFSETY) if hasattr(win32con, 'PHYSICALOFFSETY') else 0
                horzres = hdc.GetDeviceCaps(win32con.HORZRES) if hasattr(win32con, 'HORZRES') else image.size[0]
                vertres = hdc.GetDeviceCaps(win32con.VERTRES) if hasattr(win32con, 'VERTRES') else image.size[1]
                w_px, h_px = image.size

                draw_w = min(w_px - off_x, horzres)
                draw_h = min(h_px - off_y, vertres)
                if draw_w > 0 and draw_h > 0:
                    dib.draw(
                        hdc.GetHandleOutput(),
                        (0, 0, draw_w, draw_h),
                        (off_x, off_y, off_x + draw_w, off_y + draw_h)
                    )

                hdc.EndPage()

            hdc.EndDoc()
            hdc.DeleteDC()

            return True, f"인쇄 작업이 성공적으로 '{printer_name}' 스풀러에 전달되었습니다. ({copies}매)"

        except Exception as e:
            return False, f"스풀러 인쇄 실패: {str(e)}"

    @classmethod
    def print_via_qt(
        cls,
        printer_name: str,
        image: Image.Image,
        model: LabelModel,
        copies: int = 1
    ) -> Tuple[bool, str]:
        """
        PyQt6 QtPrintSupport를 사용한 보조/가상 프린터 인쇄 (PDF 저장 등 호환)
        """
        try:
            from PyQt6 import QtPrintSupport, QtGui, QtCore
            _qapp = QtCore.QCoreApplication.instance()
            if _qapp is None:
                _qapp = QtGui.QGuiApplication(sys.argv)

            printer = QtPrintSupport.QPrinter(QtPrintSupport.QPrinter.PrinterMode.HighResolution)
            printer.setPrinterName(printer_name)
            printer.setResolution(PRINTER_DPI)
            printer.setCopyCount(copies)

            if "PDF" in printer_name.upper():
                pdf_dir = os.path.join(os.path.expanduser("~"), "Downloads")
                pdf_path = os.path.join(pdf_dir, f"label_{int(model.tape_width_mm)}mm_{int(model.effective_length_mm)}mm.pdf")
                printer.setOutputFileName(pdf_path)
                printer.setOutputFormat(QtPrintSupport.QPrinter.OutputFormat.PdfFormat)

            # 사용자 정의 테이프 크기 설정 (mm)
            page_size = QtGui.QPageSize(
                QtCore.QSizeF(model.effective_length_mm, model.tape_width_mm),
                QtGui.QPageSize.Unit.Millimeter
            )
            printer.setPageSize(page_size)
            printer.setPageMargins(QtCore.QMarginsF(0, 0, 0, 0), QtGui.QPageLayout.Unit.Millimeter)

            if model.orientation == "vertical":
                printer.setPageOrientation(QtGui.QPageLayout.Orientation.Portrait)
            else:
                printer.setPageOrientation(QtGui.QPageLayout.Orientation.Landscape)

            # PIL 이미지를 QImage로 변환
            buf = io_buf = io = None
            import io
            buf = io.BytesIO()
            image.save(buf, format="PNG")
            qimg = QtGui.QImage.fromData(buf.getvalue())

            painter = QtGui.QPainter()
            if not painter.begin(printer):
                return False, "QPainter 시작 실패 (프린터 준비 안됨)"

            for _ in range(copies):
                painter.drawImage(QtCore.QPoint(0, 0), qimg)
                if _ < copies - 1:
                    printer.newPage()

            painter.end()
            return True, f"Qt 인쇄가 '{printer_name}'로 전송되었습니다. ({copies}매)"

        except Exception as e:
            return False, f"Qt 인쇄 실패: {str(e)}"

    @classmethod
    def print(
        cls,
        printer_name: str,
        image: Image.Image,
        model: LabelModel,
        copies: int = 1
    ) -> Tuple[bool, str]:
        """
        프린터 종류에 맞춰 최적의 인쇄 경로를 자동 선택하여 출력.
        OK900P 실기 또는 일반 로컬 프린터는 win32print 스풀러 우선 사용.
        PDF 또는 win32 실패 시 QtPrintSupport로 원활하게 폴백.
        """
        if "PDF" in printer_name.upper():
            return cls.print_via_qt(printer_name, image, model, copies)

        if WIN32_AVAILABLE:
            ok, msg = cls.print_label_spooler(printer_name, image, model, copies)
            if ok:
                return ok, msg
            # win32 실패 시 Qt 폴백 시도
            print(f"[PrinterController] win32 인쇄 실패({msg}), Qt 인쇄로 폴백 시도...")

        return cls.print_via_qt(printer_name, image, model, copies)
