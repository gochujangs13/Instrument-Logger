# -*- coding: utf-8 -*-
"""
Epson PRIFIA OK900P — Canvas & Renderer Module
360 DPI 1비트 흑백 비트맵(1-bit Monochrome) 고해상도 렌더링 엔진
텍스트, 1D 바코드(Code128/EAN), 2D QR 코드, 이미지, 일련번호 카운터 지원
"""

import io
import os
import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict, Any
from PIL import Image, ImageDraw, ImageFont

import qrcode
import barcode
from barcode.writer import ImageWriter

from .converter import UnitConverter, TapeSpec, PRINTER_DPI


@dataclass
class LabelElement:
    """라벨 내부 요소 기본 클래스 (치수는 mm 단위)"""
    id: str
    element_type: str  # 'text', 'barcode', 'qrcode', 'image'
    x_mm: float = 2.0
    y_mm: float = 2.0
    width_mm: float = 20.0
    height_mm: float = 10.0
    rotation: int = 0  # 0, 90, 180, 270

    # 텍스트 관련 속성
    text: str = ""
    font_family: str = "Arial"
    font_size_pt: float = 12.0
    is_bold: bool = False
    is_italic: bool = False
    is_underline: bool = False
    align: str = "left"  # left, center, right

    # 시리얼 카운터 관련 속성
    is_serial: bool = False
    serial_start: int = 1
    serial_step: int = 1
    serial_pad: int = 3  # e.g. 001, 002

    # 바코드 / QR 속성
    barcode_type: str = "Code128"  # Code128, EAN13, QRCode
    barcode_data: str = "12345678"
    show_barcode_text: bool = True
    qr_error_correction: str = "M"  # L, M, Q, H

    # 이미지 속성
    image_path: Optional[str] = None
    image_pil: Optional[Image.Image] = None

    def clone(self) -> 'LabelElement':
        import copy
        return copy.deepcopy(self)


@dataclass
class LabelModel:
    """라벨 디자인 전체 상태 모델"""
    tape_width_mm: float = 24.0
    length_mode: str = "auto"       # 'auto' or 'fixed'
    fixed_length_mm: float = 60.0
    margin_mode: str = "minimum"     # 'minimum' (2mm) or 'standard' (10mm)
    orientation: str = "horizontal"  # 'horizontal' or 'vertical'
    cutter_mode: str = "full"       # 'full', 'half', 'none'
    elements: List[LabelElement] = field(default_factory=list)

    @property
    def tape_spec(self) -> TapeSpec:
        return UnitConverter.get_tape_spec(self.tape_width_mm)

    @property
    def lead_margin_mm(self) -> float:
        """선두 및 후미 여백 (mm)"""
        if self.margin_mode == "standard":
            return self.tape_spec.std_lead_margin_mm
        return self.tape_spec.min_lead_margin_mm

    @property
    def effective_length_mm(self) -> float:
        """실제 계산된 총 테이프 길이 (mm) - OK900P 물리 헤드-커터 거리 보정 대칭 센터"""
        if self.length_mode == "fixed":
            return max(20.0, self.fixed_length_mm)

        min_x = 999.0
        max_x = 0.0
        for elem in self.elements:
            min_x = min(min_x, elem.x_mm)
            elem_right = elem.x_mm + elem.width_mm
            if elem_right > max_x:
                max_x = elem_right

        if min_x > max_x:
            min_x = 3.0
            max_x = 59.0

        phys_offset_mm = 1.5
        calc_len = max_x + min_x + phys_offset_mm
        return round(max(calc_len, 20.0), 1)

    @property
    def printable_rect_mm(self) -> Tuple[float, float, float, float]:
        """(left, top, right, bottom) mm 기준 인쇄 가능 영역"""
        left = self.lead_margin_mm
        top = self.tape_spec.side_margin_mm
        right = self.effective_length_mm - self.lead_margin_mm
        bottom = self.tape_width_mm - self.tape_spec.side_margin_mm
        return (left, top, max(left, right), max(top, bottom))


class LabelRenderer:
    """360 DPI 1-bit Monochrome 렌더링 엔진"""

    @classmethod
    def get_font(cls, family: str, size_pt: float, bold: bool = False, italic: bool = False) -> ImageFont.ImageFont:
        """시스템 폰트 또는 기본 폰트를 360 DPI 크기에 맞춰 로드"""
        px_size = UnitConverter.pt_to_px(size_pt)
        # Windows 시스템 폰트 경로 후보
        win_fonts = [
            f"C:\\Windows\\Fonts\\{family.lower()}.ttf",
            f"C:\\Windows\\Fonts\\{family.lower()}{'bd' if bold else ''}.ttf",
            "C:\\Windows\\Fonts\\malgun.ttf" if bold else "C:\\Windows\\Fonts\\malgun.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
        ]
        if bold and "malgun" in family.lower():
            win_fonts.insert(0, "C:\\Windows\\Fonts\\malgunbd.ttf")
        if bold and "arial" in family.lower():
            win_fonts.insert(0, "C:\\Windows\\Fonts\\arialbd.ttf")

        for p in win_fonts:
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size=px_size)
                except Exception:
                    pass

        try:
            return ImageFont.load_default(size=px_size)
        except Exception:
            return ImageFont.load_default()

    @classmethod
    def generate_barcode_image(cls, btype: str, data: str, width_px: int, height_px: int, show_text: bool) -> Image.Image:
        """1D 바코드 (Code128 / EAN13) 고해상도 생성"""
        try:
            writer = ImageWriter()
            writer.dpi = PRINTER_DPI
            # 바코드 클래스 선택
            btype_lower = btype.lower()
            if "ean" in btype_lower:
                bc_cls = barcode.get_barcode_class('ean13')
            else:
                bc_cls = barcode.get_barcode_class('code128')

            bc_obj = bc_cls(str(data), writer=writer)
            # 버퍼에 렌더링
            buf = io.BytesIO()
            options = {
                'write_text': show_text,
                'font_size': 12,
                'text_distance': 4.0,
                'quiet_zone': 2.0,
            }
            bc_obj.write(buf, options=options)
            buf.seek(0)
            img = Image.open(buf).convert('L')
            # 요청 크기로 리사이즈 (가로세로 비율 고려)
            img_resized = img.resize((max(1, width_px), max(1, height_px)), Image.Resampling.NEAREST)
            return img_resized
        except Exception as e:
            # 실패 시 에러 텍스트가 표시된 대체 이미지 생성
            err_img = Image.new('L', (max(1, width_px), max(1, height_px)), color=255)
            draw = ImageDraw.Draw(err_img)
            draw.rectangle([0, 0, width_px - 1, height_px - 1], outline=0, width=2)
            draw.text((10, 10), f"Barcode Err:\n{str(e)[:20]}", fill=0)
            return err_img

    @classmethod
    def generate_qrcode_image(cls, data: str, size_px: int, error_correct: str = "M") -> Image.Image:
        """2D QR 코드 고해상도 비트맵 생성"""
        ec_map = {
            'L': qrcode.constants.ERROR_CORRECT_L,
            'M': qrcode.constants.ERROR_CORRECT_M,
            'Q': qrcode.constants.ERROR_CORRECT_Q,
            'H': qrcode.constants.ERROR_CORRECT_H,
        }
        ec = ec_map.get(error_correct.upper(), qrcode.constants.ERROR_CORRECT_M)
        qr = qrcode.QRCode(
            version=None,
            error_correction=ec,
            box_size=10,
            border=2
        )
        qr.add_data(str(data))
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert('L')
        img_resized = img.resize((max(1, size_px), max(1, size_px)), Image.Resampling.NEAREST)
        return img_resized

    @classmethod
    def render(cls, model: LabelModel, serial_offset: int = 0) -> Image.Image:
        """
        LabelModel을 360 DPI 1-bit Monochrome 이미지(PIL Image, mode='1')로 최종 렌더링.
        배경: 0 (Black), 인쇄선: 1 (White) 또는 열전사 테이프 반전 처리.
        표준 프린터 스풀러용: 흰색 배경(255)에 검은색 인쇄 도트(0).
        """
        w_mm = model.effective_length_mm
        h_mm = model.tape_width_mm

        w_px = UnitConverter.mm_to_px(w_mm)
        h_px = UnitConverter.mm_to_px(h_mm)

        # 1. 24-bit RGB 캔버스 생성 (초기 흰색 배경)
        canvas = Image.new('RGB', (w_px, h_px), color=(255, 255, 255))
        draw = ImageDraw.Draw(canvas)

        # 2. 각 요소 순차 렌더링
        for elem in model.elements:
            elem_x_px = UnitConverter.mm_to_px(elem.x_mm)
            elem_y_px = UnitConverter.mm_to_px(elem.y_mm)
            elem_w_px = UnitConverter.mm_to_px(elem.width_mm)
            elem_h_px = UnitConverter.mm_to_px(elem.height_mm)

            if elem.element_type == 'text':
                text_content = elem.text
                if elem.is_serial:
                    current_serial = elem.serial_start + (serial_offset * elem.serial_step)
                    fmt_str = f"{{:0{elem.serial_pad}d}}"
                    serial_txt = fmt_str.format(current_serial)
                    text_content = text_content.replace("{SN}", serial_txt) if "{SN}" in text_content else f"{text_content} {serial_txt}".strip()

                font = cls.get_font(elem.font_family, elem.font_size_pt, elem.is_bold, elem.is_italic)
                
                # 임시 투명 오프스크린에 텍스트 렌더링 후 회전 처리
                # bbox 측정
                bbox = font.getbbox(text_content or " ")
                tw = max(1, bbox[2] - bbox[0] + 10)
                th = max(1, bbox[3] - bbox[1] + 10)
                
                txt_img = Image.new('RGBA', (tw, th), (255, 255, 255, 0))
                tdraw = ImageDraw.Draw(txt_img)
                tdraw.text((-bbox[0], -bbox[1]), text_content, fill=(0, 0, 0, 255), font=font)

                if elem.is_underline:
                    line_y = th - 2
                    tdraw.line([(0, line_y), (tw, line_y)], fill=(0, 0, 0, 255), width=UnitConverter.pt_to_px(1))

                # 회전 처리
                if elem.rotation in (90, 180, 270):
                    txt_img = txt_img.rotate(360 - elem.rotation, expand=True)

                # 캔버스에 합성
                canvas.paste(txt_img, (elem_x_px, elem_y_px), txt_img)

            elif elem.element_type == 'barcode':
                bc_img = cls.generate_barcode_image(
                    elem.barcode_type,
                    elem.barcode_data,
                    elem_w_px,
                    elem_h_px,
                    elem.show_barcode_text
                )
                if elem.rotation in (90, 180, 270):
                    bc_img = bc_img.rotate(360 - elem.rotation, expand=True)
                canvas.paste(bc_img.convert('RGB'), (elem_x_px, elem_y_px))

            elif elem.element_type == 'qrcode':
                size_px = min(elem_w_px, elem_h_px)
                qr_img = cls.generate_qrcode_image(elem.barcode_data, size_px, elem.qr_error_correction)
                if elem.rotation in (90, 180, 270):
                    qr_img = qr_img.rotate(360 - elem.rotation, expand=True)
                canvas.paste(qr_img.convert('RGB'), (elem_x_px, elem_y_px))

            elif elem.element_type == 'image':
                img_source = elem.image_pil
                if not img_source and elem.image_path and os.path.exists(elem.image_path):
                    try:
                        img_source = Image.open(elem.image_path)
                    except Exception:
                        img_source = None

                if img_source:
                    resized = img_source.convert('L').resize((elem_w_px, elem_h_px), Image.Resampling.LANCZOS)
                    if elem.rotation in (90, 180, 270):
                        resized = resized.rotate(360 - elem.rotation, expand=True)
                    # 이미지는 Floyd-Steinberg 디더링 적용
                    dithered = resized.convert('1', dither=Image.Dither.FLOYDSTEINBERG).convert('RGB')
                    canvas.paste(dithered, (elem_x_px, elem_y_px))

        # 3. 세로 인쇄 (Orientation: vertical) 회전 처리
        if model.orientation == "vertical":
            canvas = canvas.rotate(90, expand=True)

        # 4. 1-bit Monochrome 최종 변환 (열전사용 순수 흑백 버퍼)
        # 텍스트와 바코드의 에지가 칼처럼 날카롭도록 128 임계값(Threshold) 처리
        gray = canvas.convert('L')
        one_bit = gray.point(lambda p: 0 if p < 128 else 255, '1')

        return one_bit
