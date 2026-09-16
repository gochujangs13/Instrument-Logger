# -*- coding: utf-8 -*-
"""
Epson PRIFIA OK900P — Main GUI Application Module
PyQt6 기반의 산업용 고정밀 라벨 디자인 & 인쇄 데스크톱 애플리케이션
1. 상단 리본 툴바: 테이프 규격, 여백, 커터, 인쇄 방향, 요소 추가, 인쇄
2. 중앙 WYSIWYG 캔버스: mm 눈금자, 마진 가이드, 요소 드래그/리사이즈/스냅
3. 우측 속성 인스펙터: 폰트, 바코드, QR, 일련번호 실시간 편집
4. 하단 배치 데이터 시트: CSV/Excel 연동 1-클릭 대량 연속 인쇄
"""

import sys
import os
import csv
import io
import copy
from typing import Optional, List, Dict

from PyQt6 import QtCore, QtGui, QtWidgets
from PyQt6.QtCore import Qt, QRectF, QPointF, pyqtSignal
from PyQt6.QtGui import (
    QColor, QPen, QBrush, QFont, QPainter, QPixmap, QImage,
    QPainterPath, QTransform, QIcon, QKeySequence
)
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QToolBar, QLabel, QComboBox, QSpinBox, QDoubleSpinBox, QCheckBox,
    QPushButton, QGraphicsView, QGraphicsScene, QGraphicsItem,
    QGraphicsRectItem, QGraphicsTextItem, QGraphicsPixmapItem,
    QSplitter, QTableWidget, QTableWidgetItem, QFileDialog, QMessageBox,
    QGroupBox, QFormLayout, QLineEdit, QDialog, QScrollArea, QTabWidget,
    QHeaderView, QRadioButton, QButtonGroup, QFrame
)
from PIL import Image

from .converter import UnitConverter, TapeSpec, SUPPORTED_TAPES, PRINTER_NAME, PRINTER_DPI
from .renderer import LabelModel, LabelElement, LabelRenderer
from .printer import PrinterController


# 화면 표시 배율 (1mm 당 캔버스 논리 단위 픽셀 = 4.0 픽셀)
MM_TO_CANVAS_PX = 4.0

def mm_to_canvas(mm: float) -> float:
    return mm * MM_TO_CANVAS_PX

def canvas_to_mm(px: float) -> float:
    return px / MM_TO_CANVAS_PX


# ── 눈금자 위젯 (Ruler Widget) ───────────────────────────────────────────────
class HorizontalRuler(QWidget):
    """밀리미터(mm) 단위 가로 눈금자"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(26)
        self.origin_x = 0.0
        self.scale_factor = 1.0

    def update_view(self, origin_x: float, scale_factor: float):
        self.origin_x = origin_x
        self.scale_factor = scale_factor
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, False)
        painter.fillRect(self.rect(), QColor("#22272e"))
        painter.setPen(QPen(QColor("#444c56"), 1))
        painter.drawLine(0, self.height() - 1, self.width(), self.height() - 1)

        font = QFont("Segoe UI", 8)
        painter.setFont(font)
        painter.setPen(QColor("#768390"))

        # 1mm 마다 눈금, 5mm 중간, 10mm 긴 눈금 + 숫자
        step_mm = 1.0
        step_px = step_mm * MM_TO_CANVAS_PX * self.scale_factor

        start_mm = max(0, int((-self.origin_x) / (MM_TO_CANVAS_PX * self.scale_factor)) - 5)
        end_mm = start_mm + int(self.width() / step_px) + 15

        for mm in range(max(0, start_mm), max(0, end_mm)):
            x = self.origin_x + mm * step_px
            if x < 0 or x > self.width():
                continue

            if mm % 10 == 0:
                painter.drawLine(int(x), self.height() - 12, int(x), self.height() - 1)
                painter.drawText(int(x) + 2, 12, f"{mm}")
            elif mm % 5 == 0:
                painter.drawLine(int(x), self.height() - 7, int(x), self.height() - 1)
            else:
                painter.drawLine(int(x), self.height() - 4, int(x), self.height() - 1)


# ── 캔버스 그래픽스 아이템 (Canvas Element Item) ───────────────────────────────
class CanvasElementItem(QGraphicsRectItem):
    """캔버스 내에서 드래그 및 크기 조절이 가능한 라벨 요소 그래픽스 아이템"""

    def __init__(self, element: LabelElement, parent_scene):
        super().__init__()
        self.element = element
        self.parent_scene = parent_scene
        self.setFlags(
            QGraphicsItem.GraphicsItemFlag.ItemIsMovable |
            QGraphicsItem.GraphicsItemFlag.ItemIsSelectable |
            QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges
        )
        self.setAcceptHoverEvents(True)
        self.resizing = False
        self.resize_handle_size = 8.0
        self.sync_from_model()

    def sync_from_model(self):
        """데이터 모델의 mm 좌표를 캔버스 픽셀 좌표로 동기화"""
        x = mm_to_canvas(self.element.x_mm)
        y = mm_to_canvas(self.element.y_mm)
        w = mm_to_canvas(self.element.width_mm)
        h = mm_to_canvas(self.element.height_mm)
        self.setPos(x, y)
        self.setRect(0, 0, max(10.0, w), max(8.0, h))
        self.update()

    def sync_to_model(self):
        """캔버스 픽셀 좌표를 데이터 모델의 mm 좌표로 동기화"""
        pos = self.pos()
        rect = self.rect()
        self.element.x_mm = round(canvas_to_mm(pos.x()), 2)
        self.element.y_mm = round(canvas_to_mm(pos.y()), 2)
        self.element.width_mm = round(canvas_to_mm(rect.width()), 2)
        self.element.height_mm = round(canvas_to_mm(rect.height()), 2)
        if hasattr(self.parent_scene, "on_element_changed"):
            self.parent_scene.on_element_changed(self.element)

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionChange and self.scene():
            # 스냅 (Snap to Center / Margin)
            new_pos = value
            scene = self.parent_scene
            if scene and hasattr(scene, "snap_pos"):
                new_pos = scene.snap_pos(self, new_pos)
            return new_pos
        elif change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            self.sync_to_model()
        return super().itemChange(change, value)

    def paint(self, painter: QPainter, option, widget=None):
        rect = self.rect()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)

        # 1. 요소 내용 렌더링
        painter.save()
        if self.element.element_type == 'text':
            font = QFont(self.element.font_family)
            # 포인트 크기를 캔버스 크기로 비례 환산
            font.setPointSizeF(max(6.0, self.element.font_size_pt * (MM_TO_CANVAS_PX / 2.8)))
            font.setBold(self.element.is_bold)
            font.setItalic(self.element.is_italic)
            font.setUnderline(self.element.is_underline)
            painter.setFont(font)
            painter.setPen(QPen(QColor("#111827"), 1))

            text = self.element.text
            if self.element.is_serial:
                fmt_str = f"{{:0{self.element.serial_pad}d}}"
                sn = fmt_str.format(self.element.serial_start)
                text = text.replace("{SN}", sn) if "{SN}" in text else f"{text} {sn}".strip()

            align_flags = Qt.AlignmentFlag.AlignVCenter
            if self.element.align == 'center':
                align_flags |= Qt.AlignmentFlag.AlignHCenter
            elif self.element.align == 'right':
                align_flags |= Qt.AlignmentFlag.AlignRight
            else:
                align_flags |= Qt.AlignmentFlag.AlignLeft

            painter.drawText(rect, align_flags, text)

        elif self.element.element_type in ('barcode', 'qrcode'):
            # 바코드 / QR 비트맵 렌더링
            try:
                elem_w_px = max(20, int(rect.width() * 2))
                elem_h_px = max(20, int(rect.height() * 2))
                if self.element.element_type == 'qrcode':
                    pil_img = LabelRenderer.generate_qrcode_image(
                        self.element.barcode_data, min(elem_w_px, elem_h_px), self.element.qr_error_correction
                    )
                else:
                    pil_img = LabelRenderer.generate_barcode_image(
                        self.element.barcode_type, self.element.barcode_data, elem_w_px, elem_h_px, self.element.show_barcode_text
                    )
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG")
                qimg = QImage.fromData(buf.getvalue())
                painter.drawImage(rect, qimg)
            except Exception:
                painter.setPen(QPen(QColor("#ef4444"), 1, Qt.PenStyle.DashLine))
                painter.drawRect(rect)
                painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, f"Barcode\n{self.element.barcode_data}")

        elif self.element.element_type == 'image' and self.element.image_path:
            if os.path.exists(self.element.image_path):
                pixmap = QPixmap(self.element.image_path)
                painter.drawPixmap(rect.toRect(), pixmap)
            else:
                painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, "[Image]")
        painter.restore()

        # 2. 선택 상태 표시 (바운딩 박스 + 리사이즈 핸들)
        if self.isSelected():
            painter.setPen(QPen(QColor("#2563eb"), 1.5, Qt.PenStyle.DashLine))
            painter.setBrush(QColor(37, 99, 235, 20))
            painter.drawRect(rect)

            # 우측 하단 리사이즈 핸들
            handle_rect = QRectF(
                rect.right() - self.resize_handle_size,
                rect.bottom() - self.resize_handle_size,
                self.resize_handle_size,
                self.resize_handle_size
            )
            painter.setBrush(QColor("#2563eb"))
            painter.setPen(QPen(QColor("#ffffff"), 1))
            painter.drawRect(handle_rect)

    def mousePressEvent(self, event):
        rect = self.rect()
        handle_rect = QRectF(
            rect.right() - self.resize_handle_size,
            rect.bottom() - self.resize_handle_size,
            self.resize_handle_size,
            self.resize_handle_size
        )
        if handle_rect.contains(event.pos()):
            self.resizing = True
            self.resize_start_pos = event.pos()
            self.resize_start_rect = self.rect()
            event.accept()
        else:
            self.resizing = False
            super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self.resizing:
            delta = event.pos() - self.resize_start_pos
            new_w = max(15.0, self.resize_start_rect.width() + delta.x())
            new_h = max(10.0, self.resize_start_rect.height() + delta.y())
            self.setRect(0, 0, new_w, new_h)
            self.sync_to_model()
            self.update()
            event.accept()
        else:
            super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        self.resizing = False
        self.sync_to_model()
        super().mouseReleaseEvent(event)


# ── 인터랙티브 캔버스 뷰 & 씬 ───────────────────────────────────────────────
class LabelEditorScene(QGraphicsScene):
    """라벨 에디터의 캔버스 씬"""
    selection_changed_signal = pyqtSignal(object)
    model_modified_signal = pyqtSignal()

    def __init__(self, model: LabelModel, parent=None):
        super().__init__(parent)
        self.model = model
        self.tape_color = QColor("#ffffff")  # 기본 흰색 테이프
        self.selectionChanged.connect(self._on_selection_changed)

    def _on_selection_changed(self):
        items = self.selectedItems()
        elem = items[0].element if items and isinstance(items[0], CanvasElementItem) else None
        self.selection_changed_signal.emit(elem)

    def on_element_changed(self, elem: LabelElement):
        self.model_modified_signal.emit()

    def snap_pos(self, item: CanvasElementItem, new_pos: QPointF) -> QPointF:
        """스냅 (중앙선 및 인쇄 여백선 근처에서 자동 자석 부착)"""
        snap_dist = 6.0  # px
        x, y = new_pos.x(), new_pos.y()
        w, h = item.rect().width(), item.rect().height()

        # 테이프 중앙 Y축 스냅
        tape_h_px = mm_to_canvas(self.model.tape_width_mm)
        center_y = (tape_h_px - h) / 2.0
        if abs(y - center_y) < snap_dist:
            y = center_y

        # 여백 시작선 X축 스냅
        margin_x_px = mm_to_canvas(self.model.lead_margin_mm)
        if abs(x - margin_x_px) < snap_dist:
            x = margin_x_px

        return QPointF(x, y)

    def drawBackground(self, painter: QPainter, rect):
        painter.fillRect(rect, QColor("#1c2128"))  # 외곽 어두운 작업 배경

        # 1. 실제 테이프 외곽 렌더링
        tape_w_px = mm_to_canvas(self.model.effective_length_mm)
        tape_h_px = mm_to_canvas(self.model.tape_width_mm)
        tape_rect = QRectF(0, 0, tape_w_px, tape_h_px)

        # 그림자
        painter.setBrush(QColor(0, 0, 0, 80))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(tape_rect.translated(4, 4), 3, 3)

        # 테이프 본체
        painter.setBrush(self.tape_color)
        painter.setPen(QPen(QColor("#adb5bd"), 1.2))
        painter.drawRoundedRect(tape_rect, 2, 2)

        # 2. 인쇄 가능 영역 가이드 (붉은 점선: Margin Guide)
        l, t, r, b = self.model.printable_rect_mm
        print_rect = QRectF(
            mm_to_canvas(l),
            mm_to_canvas(t),
            max(2.0, mm_to_canvas(r - l)),
            max(2.0, mm_to_canvas(b - t))
        )
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.setPen(QPen(QColor("#f87171"), 1.0, Qt.PenStyle.DashLine))
        painter.drawRect(print_rect)

        # 3. 테이프 중앙 기준선 (아주 옅은 하늘색 점선)
        painter.setPen(QPen(QColor(56, 189, 248, 80), 0.8, Qt.PenStyle.DotLine))
        painter.drawLine(0, int(tape_h_px / 2.0), int(tape_w_px), int(tape_h_px / 2.0))


class InteractiveCanvasView(QGraphicsView):
    """줌, 팬 및 눈금자 연동을 지원하는 그래픽스 뷰"""
    def __init__(self, scene: LabelEditorScene, ruler: HorizontalRuler, parent=None):
        super().__init__(scene, parent)
        self.ruler = ruler
        self.setRenderHints(QPainter.RenderHint.Antialiasing | QPainter.RenderHint.SmoothPixmapTransform)
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorViewCenter)
        self.zoom_level = 1.0
        self.horizontalScrollBar().valueChanged.connect(self._sync_ruler)

    def _sync_ruler(self):
        if self.ruler:
            origin = self.mapFromScene(QPointF(0, 0))
            self.ruler.update_view(origin.x(), self.zoom_level)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._sync_ruler()

    def wheelEvent(self, event):
        # Ctrl + 휠로 줌 조절
        if event.modifiers() == Qt.KeyboardModifier.ControlModifier:
            delta = event.angleDelta().y()
            factor = 1.15 if delta > 0 else (1.0 / 1.15)
            self.set_zoom(self.zoom_level * factor)
            event.accept()
        else:
            super().wheelEvent(event)

    def set_zoom(self, zoom: float):
        self.zoom_level = max(0.4, min(6.0, zoom))
        self.setTransform(QTransform().scale(self.zoom_level, self.zoom_level))
        self._sync_ruler()


# ── 우측 속성 패널 (Properties Inspector) ──────────────────────────────────
class PropertiesInspector(QWidget):
    """선택된 요소의 세부 속성을 편집하는 우측 인스펙터 패널"""
    property_changed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_element: Optional[LabelElement] = None
        self.setMinimumWidth(260)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(12)

        title = QLabel("⚙️ 요소 속성 (Properties)")
        title.setStyleSheet("font-weight: bold; font-size: 13px; color: #58a6ff;")
        layout.addWidget(title)

        # 1. 위치 및 크기 그룹
        pos_grp = QGroupBox("위치 및 크기 (mm)")
        pos_layout = QFormLayout(pos_grp)
        self.spin_x = QDoubleSpinBox(); self.spin_x.setRange(0, 500); self.spin_x.setSingleStep(0.5)
        self.spin_y = QDoubleSpinBox(); self.spin_y.setRange(0, 100); self.spin_y.setSingleStep(0.5)
        self.spin_w = QDoubleSpinBox(); self.spin_w.setRange(1, 500); self.spin_w.setSingleStep(1.0)
        self.spin_h = QDoubleSpinBox(); self.spin_h.setRange(1, 100); self.spin_h.setSingleStep(1.0)
        pos_layout.addRow("X:", self.spin_x)
        pos_layout.addRow("Y:", self.spin_y)
        pos_layout.addRow("너비(W):", self.spin_w)
        pos_layout.addRow("높이(H):", self.spin_h)
        layout.addWidget(pos_grp)

        for sp in (self.spin_x, self.spin_y, self.spin_w, self.spin_h):
            sp.valueChanged.connect(self._on_geometry_changed)

        # 2. 텍스트 속성 그룹
        self.text_grp = QGroupBox("텍스트 설정")
        text_layout = QFormLayout(self.text_grp)
        self.txt_input = QLineEdit()
        self.font_combo = QComboBox()
        self.font_combo.addItems(["Arial", "맑은 고딕", "굴림", "돋움", "Courier New", "Times New Roman"])
        self.spin_font_size = QDoubleSpinBox(); self.spin_font_size.setRange(4, 72); self.spin_font_size.setValue(12)
        
        style_box = QHBoxLayout()
        self.chk_bold = QCheckBox("B"); self.chk_bold.setStyleSheet("font-weight: bold;")
        self.chk_italic = QCheckBox("I"); self.chk_italic.setStyleSheet("font-style: italic;")
        self.chk_underline = QCheckBox("U")
        style_box.addWidget(self.chk_bold); style_box.addWidget(self.chk_italic); style_box.addWidget(self.chk_underline)

        self.combo_align = QComboBox(); self.combo_align.addItems(["왼쪽 (Left)", "가운데 (Center)", "오른쪽 (Right)"])
        self.combo_rot = QComboBox(); self.combo_rot.addItems(["0° (기본)", "90°", "180°", "270°"])

        text_layout.addRow("내용:", self.txt_input)
        text_layout.addRow("폰트:", self.font_combo)
        text_layout.addRow("크기(pt):", self.spin_font_size)
        text_layout.addRow("스타일:", style_box)
        text_layout.addRow("정렬:", self.combo_align)
        text_layout.addRow("회전:", self.combo_rot)
        layout.addWidget(self.text_grp)

        self.txt_input.textChanged.connect(self._on_text_changed)
        self.font_combo.currentTextChanged.connect(self._on_text_changed)
        self.spin_font_size.valueChanged.connect(self._on_text_changed)
        self.chk_bold.toggled.connect(self._on_text_changed)
        self.chk_italic.toggled.connect(self._on_text_changed)
        self.chk_underline.toggled.connect(self._on_text_changed)
        self.combo_align.currentIndexChanged.connect(self._on_text_changed)
        self.combo_rot.currentIndexChanged.connect(self._on_text_changed)

        # 3. 바코드 / QR 속성 그룹
        self.barcode_grp = QGroupBox("바코드 / QR 설정")
        bc_layout = QFormLayout(self.barcode_grp)
        self.bc_data_input = QLineEdit()
        self.combo_bc_type = QComboBox(); self.combo_bc_type.addItems(["Code128", "EAN13", "QRCode"])
        self.combo_qr_ec = QComboBox(); self.combo_qr_ec.addItems(["L (7%)", "M (15%)", "Q (25%)", "H (30%)"])
        self.chk_show_bctxt = QCheckBox("바코드 번호 표기")
        bc_layout.addRow("데이터:", self.bc_data_input)
        bc_layout.addRow("종류:", self.combo_bc_type)
        bc_layout.addRow("QR 보정:", self.combo_qr_ec)
        bc_layout.addRow("", self.chk_show_bctxt)
        layout.addWidget(self.barcode_grp)

        self.bc_data_input.textChanged.connect(self._on_barcode_changed)
        self.combo_bc_type.currentTextChanged.connect(self._on_barcode_changed)
        self.combo_qr_ec.currentTextChanged.connect(self._on_barcode_changed)
        self.chk_show_bctxt.toggled.connect(self._on_barcode_changed)

        # 4. 일련번호 (시리얼 카운터) 그룹
        self.serial_grp = QGroupBox("시리얼 카운터 (자동 번호 증가)")
        sn_layout = QFormLayout(self.serial_grp)
        self.chk_enable_sn = QCheckBox("시리얼 활성화 ({SN})")
        self.spin_sn_start = QSpinBox(); self.spin_sn_start.setRange(0, 999999); self.spin_sn_start.setValue(1)
        self.spin_sn_step = QSpinBox(); self.spin_sn_step.setRange(1, 100); self.spin_sn_step.setValue(1)
        self.spin_sn_pad = QSpinBox(); self.spin_sn_pad.setRange(1, 10); self.spin_sn_pad.setValue(3)
        sn_layout.addRow(self.chk_enable_sn)
        sn_layout.addRow("시작값:", self.spin_sn_start)
        sn_layout.addRow("증가폭:", self.spin_sn_step)
        sn_layout.addRow("자릿수:", self.spin_sn_pad)
        layout.addWidget(self.serial_grp)

        self.chk_enable_sn.toggled.connect(self._on_serial_changed)
        self.spin_sn_start.valueChanged.connect(self._on_serial_changed)
        self.spin_sn_step.valueChanged.connect(self._on_serial_changed)
        self.spin_sn_pad.valueChanged.connect(self._on_serial_changed)

        layout.addStretch()

    def set_element(self, elem: Optional[LabelElement]):
        self.current_element = elem
        self.setEnabled(elem is not None)
        if not elem:
            return

        self.blockSignals(True)
        self.spin_x.setValue(elem.x_mm)
        self.spin_y.setValue(elem.y_mm)
        self.spin_w.setValue(elem.width_mm)
        self.spin_h.setValue(elem.height_mm)

        if elem.element_type == 'text':
            self.text_grp.setVisible(True)
            self.barcode_grp.setVisible(False)
            self.serial_grp.setVisible(True)
            self.txt_input.setText(elem.text)
            self.font_combo.setCurrentText(elem.font_family)
            self.spin_font_size.setValue(elem.font_size_pt)
            self.chk_bold.setChecked(elem.is_bold)
            self.chk_italic.setChecked(elem.is_italic)
            self.chk_underline.setChecked(elem.is_underline)
            align_map = {'left': 0, 'center': 1, 'right': 2}
            self.combo_align.setCurrentIndex(align_map.get(elem.align, 0))
            rot_map = {0: 0, 90: 1, 180: 2, 270: 3}
            self.combo_rot.setCurrentIndex(rot_map.get(elem.rotation, 0))
            self.chk_enable_sn.setChecked(elem.is_serial)
            self.spin_sn_start.setValue(elem.serial_start)
            self.spin_sn_step.setValue(elem.serial_step)
            self.spin_sn_pad.setValue(elem.serial_pad)

        elif elem.element_type in ('barcode', 'qrcode'):
            self.text_grp.setVisible(False)
            self.barcode_grp.setVisible(True)
            self.serial_grp.setVisible(False)
            self.bc_data_input.setText(elem.barcode_data)
            self.combo_bc_type.setCurrentText(elem.barcode_type)
            self.combo_qr_ec.setCurrentText(f"{elem.qr_error_correction} (15%)")
            self.chk_show_bctxt.setChecked(elem.show_barcode_text)
        else:
            self.text_grp.setVisible(False)
            self.barcode_grp.setVisible(False)
            self.serial_grp.setVisible(False)

        self.blockSignals(False)

    def _on_geometry_changed(self):
        if not self.current_element: return
        self.current_element.x_mm = self.spin_x.value()
        self.current_element.y_mm = self.spin_y.value()
        self.current_element.width_mm = self.spin_w.value()
        self.current_element.height_mm = self.spin_h.value()
        self.property_changed.emit()

    def _on_text_changed(self):
        if not self.current_element or self.current_element.element_type != 'text': return
        self.current_element.text = self.txt_input.text()
        self.current_element.font_family = self.font_combo.currentText()
        self.current_element.font_size_pt = self.spin_font_size.value()
        self.current_element.is_bold = self.chk_bold.isChecked()
        self.current_element.is_italic = self.chk_italic.isChecked()
        self.current_element.is_underline = self.chk_underline.isChecked()
        align_rev = {0: 'left', 1: 'center', 2: 'right'}
        self.current_element.align = align_rev.get(self.combo_align.currentIndex(), 'left')
        rot_rev = {0: 0, 1: 90, 2: 180, 3: 270}
        self.current_element.rotation = rot_rev.get(self.combo_rot.currentIndex(), 0)
        self.property_changed.emit()

    def _on_barcode_changed(self):
        if not self.current_element: return
        self.current_element.barcode_data = self.bc_data_input.text()
        self.current_element.barcode_type = self.combo_bc_type.currentText()
        self.current_element.qr_error_correction = self.combo_qr_ec.currentText()[0]
        self.current_element.show_barcode_text = self.chk_show_bctxt.isChecked()
        self.property_changed.emit()

    def _on_serial_changed(self):
        if not self.current_element: return
        self.current_element.is_serial = self.chk_enable_sn.isChecked()
        self.current_element.serial_start = self.spin_sn_start.value()
        self.current_element.serial_step = self.spin_sn_step.value()
        self.current_element.serial_pad = self.spin_sn_pad.value()
        self.property_changed.emit()


# ── 하단 배치 데이터 시트 (Batch Data Grid View) ───────────────────────────
class BatchDataGrid(QWidget):
    """대량 연속 인쇄용 CSV/Excel 데이터 그리드 패널"""
    batch_print_requested = pyqtSignal(list, str)  # (records, target_element_id)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 10)
        layout.setSpacing(6)

        # 상단 제어 바
        ctrl_bar = QHBoxLayout()
        self.lbl_title = QLabel("📊 배치 데이터 인쇄 (Batch Data Sheet)")
        self.lbl_title.setStyleSheet("font-weight: bold; font-size: 12px; color: #58a6ff;")
        ctrl_bar.addWidget(self.lbl_title)

        ctrl_bar.addSpacing(20)
        ctrl_bar.addWidget(QLabel("바인딩 대상 요소:"))
        self.combo_target_elem = QComboBox()
        ctrl_bar.addWidget(self.combo_target_elem)

        btn_csv = QPushButton("📁 CSV 불러오기")
        btn_csv.clicked.connect(self.load_csv)
        ctrl_bar.addWidget(btn_csv)

        btn_paste = QPushButton("📋 클립보드 붙여넣기")
        btn_paste.clicked.connect(self.paste_from_clipboard)
        ctrl_bar.addWidget(btn_paste)

        btn_clear = QPushButton("✕ 지우기")
        btn_clear.clicked.connect(self.clear_table)
        ctrl_bar.addWidget(btn_clear)

        ctrl_bar.addStretch()

        self.btn_batch_print = QPushButton("⚡ 대량 연속 인쇄 시작")
        self.btn_batch_print.setStyleSheet(
            "background-color: #238636; color: white; font-weight: bold; padding: 5px 14px; border-radius: 4px;"
        )
        self.btn_batch_print.clicked.connect(self._on_batch_print)
        ctrl_bar.addWidget(self.btn_batch_print)

        layout.addLayout(ctrl_bar)

        # 테이블 위젯
        self.table = QTableWidget(5, 4)
        self.table.setHorizontalHeaderLabels(["Column 1 (ID/Text)", "Column 2 (Code)", "Column 3", "Column 4"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        layout.addWidget(self.table)

    def update_elements(self, elements: List[LabelElement]):
        current = self.combo_target_elem.currentText()
        self.combo_target_elem.clear()
        for e in elements:
            self.combo_target_elem.addItem(f"{e.id}: {e.text or e.barcode_data}", e.id)
        idx = self.combo_target_elem.findText(current)
        if idx >= 0:
            self.combo_target_elem.setCurrentIndex(idx)

    def load_csv(self):
        path, _ = QFileDialog.getOpenFileName(self, "CSV 파일 열기", "", "CSV Files (*.csv);;All Files (*)")
        if not path: return
        try:
            with open(path, 'r', encoding='utf-8-sig') as f:
                reader = csv.reader(f)
                rows = list(reader)
            if not rows: return
            self.populate_table(rows)
        except Exception as e:
            QMessageBox.critical(self, "오류", f"CSV 파일을 읽을 수 없습니다: {e}")

    def paste_from_clipboard(self):
        clipboard = QApplication.clipboard()
        text = clipboard.text()
        if not text: return
        rows = [line.split('\t') for line in text.strip().split('\n')]
        self.populate_table(rows)

    def populate_table(self, rows: List[List[str]]):
        self.table.setRowCount(len(rows))
        max_cols = max(len(r) for r in rows) if rows else 1
        self.table.setColumnCount(max_cols)
        for r_idx, row in enumerate(rows):
            for c_idx, val in enumerate(row):
                self.table.setItem(r_idx, c_idx, QTableWidgetItem(val.strip()))

    def clear_table(self):
        self.table.clearContents()
        self.table.setRowCount(5)

    def _on_batch_print(self):
        rows = []
        for r in range(self.table.rowCount()):
            row_vals = []
            for c in range(self.table.columnCount()):
                item = self.table.item(r, c)
                row_vals.append(item.text() if item else "")
            if any(row_vals):
                rows.append(row_vals)

        if not rows:
            QMessageBox.warning(self, "경고", "인쇄할 데이터가 시트에 없습니다.")
            return

        target_id = self.combo_target_elem.currentData()
        self.batch_print_requested.emit(rows, target_id)


# ── 메인 윈도우 (Epson OK900P Main Window) ──────────────────────────────────
class OK900PMainWindow(QMainWindow):
    """Epson PRIFIA OK900P 라벨 에디터 메인 GUI 창"""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Epson PRIFIA OK900P - High Resolution Label Studio (360 DPI)")
        self.resize(1280, 840)

        # 모델 초기화 (기본 24mm 테이프)
        self.model = LabelModel(tape_width_mm=24.0, length_mode="auto", cutter_mode="full")
        self._init_default_elements()

        # UI 컴포넌트 빌드
        self.init_ui()
        self.init_printers()
        self.refresh_canvas()

    def _init_default_elements(self):
        """기본 샘플 라벨 요소 추가 (텍스트 2개 + 2D QR 코드 1개)"""
        self.model.elements = [
            LabelElement(
                id="ELEM_TITLE",
                element_type="text",
                text="EQUIPMENT ASSET TAG",
                x_mm=4.0, y_mm=2.5, width_mm=38.0, height_mm=6.0,
                font_family="Arial", font_size_pt=9.0, is_bold=True
            ),
            LabelElement(
                id="ELEM_SN",
                element_type="text",
                text="ID: EP-OK900P-{SN}",
                x_mm=4.0, y_mm=9.0, width_mm=38.0, height_mm=7.0,
                font_family="Arial", font_size_pt=11.0, is_bold=True,
                is_serial=True, serial_start=1, serial_step=1, serial_pad=3
            ),
            LabelElement(
                id="ELEM_QR",
                element_type="qrcode",
                barcode_data="https://3m.com/instrument",
                x_mm=44.0, y_mm=2.5, width_mm=19.0, height_mm=19.0
            )
        ]

    def init_ui(self):
        self.setStyleSheet("""
            QMainWindow { background-color: #0d1117; color: #c9d1d9; }
            QWidget { color: #c9d1d9; font-family: 'Segoe UI', 'Malgun Gothic', sans-serif; }
            QToolBar { background-color: #161b22; border-bottom: 1px solid #30363d; spacing: 8px; padding: 4px; }
            QGroupBox { border: 1px solid #30363d; border-radius: 6px; margin-top: 10px; font-size: 11px; font-weight: bold; color: #8b949e; }
            QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; }
            QPushButton { background-color: #21262d; border: 1px solid #30363d; border-radius: 4px; padding: 5px 12px; color: #c9d1d9; }
            QPushButton:hover { background-color: #30363d; }
            QPushButton:pressed { background-color: #161b22; }
            QComboBox, QSpinBox, QDoubleSpinBox, QLineEdit { background-color: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 4px; color: #c9d1d9; }
            QTableWidget { background-color: #0d1117; gridline-color: #30363d; border: 1px solid #30363d; color: #c9d1d9; }
            QHeaderView::section { background-color: #161b22; border: 1px solid #30363d; color: #8b949e; padding: 4px; }
        """)

        # 1. 상단 리본 툴바 빌드
        self.build_toolbar()

        # 2. 중앙 레이아웃 (눈금자 + 캔버스) & 우측 패널 (Splitter)
        main_splitter = QSplitter(Qt.Orientation.Horizontal)

        # 캔버스 영역 위젯
        canvas_container = QWidget()
        canvas_layout = QVBoxLayout(canvas_container)
        canvas_layout.setContentsMargins(0, 0, 0, 0)
        canvas_layout.setSpacing(0)

        self.ruler = HorizontalRuler()
        canvas_layout.addWidget(self.ruler)

        self.scene = LabelEditorScene(self.model)
        self.scene.selection_changed_signal.connect(self._on_item_selected)
        self.scene.model_modified_signal.connect(self._on_model_modified)

        self.view = InteractiveCanvasView(self.scene, self.ruler)
        canvas_layout.addWidget(self.view)

        main_splitter.addWidget(canvas_container)

        # 우측 속성 인스펙터
        self.inspector = PropertiesInspector()
        self.inspector.property_changed.connect(self._on_inspector_changed)
        main_splitter.addWidget(self.inspector)
        main_splitter.setStretchFactor(0, 4)
        main_splitter.setStretchFactor(1, 1)

        # 3. 하단 데이터 시트 (수직 분할)
        v_splitter = QSplitter(Qt.Orientation.Vertical)
        v_splitter.addWidget(main_splitter)

        self.batch_grid = BatchDataGrid()
        self.batch_grid.batch_print_requested.connect(self.do_batch_print)
        v_splitter.addWidget(self.batch_grid)
        v_splitter.setStretchFactor(0, 3)
        v_splitter.setStretchFactor(1, 1)

        self.setCentralWidget(v_splitter)

    def build_toolbar(self):
        tb = QToolBar("메인 툴바")
        tb.setIconSize(QtCore.QSize(20, 20))
        self.addToolBar(tb)

        # 테이프 폭 선택
        tb.addWidget(QLabel(" 폭: "))
        self.combo_tape_width = QComboBox()
        for w in UnitConverter.get_supported_tape_widths():
            self.combo_tape_width.addItem(f"{int(w) if w.is_integer() else w}mm", w)
        self.combo_tape_width.setCurrentText("24mm")
        self.combo_tape_width.currentIndexChanged.connect(self._on_tape_width_changed)
        tb.addWidget(self.combo_tape_width)

        # 길이 모드
        tb.addWidget(QLabel(" 길이: "))
        self.combo_len_mode = QComboBox()
        self.combo_len_mode.addItems(["자동 (Auto)", "고정 (Fixed)"])
        self.combo_len_mode.currentIndexChanged.connect(self._on_len_mode_changed)
        tb.addWidget(self.combo_len_mode)

        self.spin_fixed_len = QDoubleSpinBox()
        self.spin_fixed_len.setRange(15.0, 500.0)
        self.spin_fixed_len.setValue(60.0)
        self.spin_fixed_len.setSuffix(" mm")
        self.spin_fixed_len.setEnabled(False)
        self.spin_fixed_len.valueChanged.connect(self._on_fixed_len_changed)
        tb.addWidget(self.spin_fixed_len)

        # 여백 선택
        tb.addWidget(QLabel(" 여백: "))
        self.combo_margin = QComboBox()
        self.combo_margin.addItems(["최소 (2mm)", "표준 (10mm)"])
        self.combo_margin.currentIndexChanged.connect(self._on_margin_changed)
        tb.addWidget(self.combo_margin)

        # 커터 옵션
        tb.addWidget(QLabel(" 커터: "))
        self.combo_cutter = QComboBox()
        self.combo_cutter.addItems(["완전 절단 (Full)", "하프 컷 (Half)", "절단 없음 (None)"])
        tb.addWidget(self.combo_cutter)

        tb.addSeparator()

        # 요소 추가 버튼들
        btn_add_txt = QPushButton("➕ 텍스트")
        btn_add_txt.clicked.connect(self.add_text_element)
        tb.addWidget(btn_add_txt)

        btn_add_bc = QPushButton("➕ 1D 바코드")
        btn_add_bc.clicked.connect(self.add_barcode_element)
        tb.addWidget(btn_add_bc)

        btn_add_qr = QPushButton("➕ QR 코드")
        btn_add_qr.clicked.connect(self.add_qrcode_element)
        tb.addWidget(btn_add_qr)

        btn_add_img = QPushButton("➕ 이미지")
        btn_add_img.clicked.connect(self.add_image_element)
        tb.addWidget(btn_add_img)

        btn_del = QPushButton("🗑️ 삭제")
        btn_del.clicked.connect(self.delete_selected_element)
        tb.addWidget(btn_del)

        tb.addSeparator()

        # 프린터 선택
        tb.addWidget(QLabel(" 🖨️ 프린터: "))
        self.combo_printer = QComboBox()
        self.combo_printer.setMinimumWidth(180)
        tb.addWidget(self.combo_printer)

        btn_refresh_printers = QPushButton("🔄")
        btn_refresh_printers.setToolTip("프린터 목록 새로고침")
        btn_refresh_printers.clicked.connect(self.init_printers)
        tb.addWidget(btn_refresh_printers)

        # 인쇄 매수
        tb.addWidget(QLabel(" 매수: "))
        self.spin_copies = QSpinBox()
        self.spin_copies.setRange(1, 999)
        self.spin_copies.setValue(1)
        tb.addWidget(self.spin_copies)

        # 360 DPI 비트맵 미리보기 버튼
        btn_preview = QPushButton("👁️ 360 DPI 미리보기")
        btn_preview.clicked.connect(self.show_preview_dialog)
        tb.addWidget(btn_preview)

        # 인쇄 버튼
        self.btn_print = QPushButton("🖨️ 인쇄 (Print)")
        self.btn_print.setStyleSheet(
            "background-color: #238636; color: white; font-weight: bold; font-size: 12px; padding: 6px 18px; border-radius: 4px;"
        )
        self.btn_print.clicked.connect(self.do_print)
        tb.addWidget(self.btn_print)

    def init_printers(self):
        self.combo_printer.clear()
        printers = PrinterController.get_printers()
        detected = PrinterController.auto_detect_ok900p()
        selected_idx = 0

        for idx, p in enumerate(printers):
            self.combo_printer.addItem(p)
            if detected and p == detected:
                selected_idx = idx

        if printers:
            self.combo_printer.setCurrentIndex(selected_idx)

    def refresh_canvas(self):
        """데이터 모델을 캔버스 아이템들로 전면 갱신"""
        self.scene.clear()
        for elem in self.model.elements:
            item = CanvasElementItem(elem, self.scene)
            self.scene.addItem(item)
        self.scene.update()
        self.view._sync_ruler()
        self.batch_grid.update_elements(self.model.elements)

    def _on_tape_width_changed(self):
        width = self.combo_tape_width.currentData()
        self.model.tape_width_mm = float(width)
        self.refresh_canvas()

    def _on_len_mode_changed(self):
        is_fixed = self.combo_len_mode.currentIndex() == 1
        self.model.length_mode = "fixed" if is_fixed else "auto"
        self.spin_fixed_len.setEnabled(is_fixed)
        self.refresh_canvas()

    def _on_fixed_len_changed(self):
        self.model.fixed_length_mm = self.spin_fixed_len.value()
        self.refresh_canvas()

    def _on_margin_changed(self):
        self.model.margin_mode = "standard" if self.combo_margin.currentIndex() == 1 else "minimum"
        self.refresh_canvas()

    def _on_item_selected(self, elem: Optional[LabelElement]):
        self.inspector.set_element(elem)

    def _on_model_modified(self):
        self.scene.update()
        self.view._sync_ruler()

    def _on_inspector_changed(self):
        for item in self.scene.items():
            if isinstance(item, CanvasElementItem) and item.element == self.inspector.current_element:
                item.sync_from_model()
                break
        self.scene.update()

    def add_text_element(self):
        elem = LabelElement(
            id=f"TXT_{len(self.model.elements)+1}",
            element_type="text",
            text="라벨 텍스트 입력",
            x_mm=self.model.lead_margin_mm + 2.0,
            y_mm=self.model.tape_spec.side_margin_mm + 2.0,
            width_mm=30.0, height_mm=8.0,
            font_family="Arial", font_size_pt=11.0
        )
        self.model.elements.append(elem)
        self.refresh_canvas()

    def add_barcode_element(self):
        elem = LabelElement(
            id=f"BAR_{len(self.model.elements)+1}",
            element_type="barcode",
            barcode_type="Code128",
            barcode_data="12345678",
            x_mm=self.model.lead_margin_mm + 2.0,
            y_mm=self.model.tape_spec.side_margin_mm + 2.0,
            width_mm=36.0, height_mm=12.0
        )
        self.model.elements.append(elem)
        self.refresh_canvas()

    def add_qrcode_element(self):
        elem = LabelElement(
            id=f"QR_{len(self.model.elements)+1}",
            element_type="qrcode",
            barcode_data="https://3m.com",
            x_mm=self.model.lead_margin_mm + 2.0,
            y_mm=self.model.tape_spec.side_margin_mm + 2.0,
            width_mm=16.0, height_mm=16.0
        )
        self.model.elements.append(elem)
        self.refresh_canvas()

    def add_image_element(self):
        path, _ = QFileDialog.getOpenFileName(self, "이미지 선택", "", "Images (*.png *.jpg *.bmp);;All Files (*)")
        if not path: return
        elem = LabelElement(
            id=f"IMG_{len(self.model.elements)+1}",
            element_type="image",
            image_path=path,
            x_mm=self.model.lead_margin_mm + 2.0,
            y_mm=self.model.tape_spec.side_margin_mm + 2.0,
            width_mm=18.0, height_mm=18.0
        )
        self.model.elements.append(elem)
        self.refresh_canvas()

    def delete_selected_element(self):
        selected = self.scene.selectedItems()
        if not selected: return
        for item in selected:
            if isinstance(item, CanvasElementItem) and item.element in self.model.elements:
                self.model.elements.remove(item.element)
        self.refresh_canvas()
        self.inspector.set_element(None)

    def show_preview_dialog(self):
        """360 DPI 1-bit Monochrome 최종 래스터 비트맵 미리보기 다이얼로그"""
        one_bit_img = LabelRenderer.render(self.model)
        buf = io.BytesIO()
        one_bit_img.save(buf, format="PNG")
        qimg = QImage.fromData(buf.getvalue())

        dlg = QDialog(self)
        dlg.setWindowTitle(f"360 DPI 1-Bit 비트맵 미리보기 ({one_bit_img.width} × {one_bit_img.height} px)")
        dlg.resize(750, 400)
        dlg_layout = QVBoxLayout(dlg)

        scroll = QScrollArea()
        lbl_img = QLabel()
        lbl_img.setPixmap(QPixmap.fromImage(qimg))
        lbl_img.setStyleSheet("background-color: #333; padding: 20px;")
        scroll.setWidget(lbl_img)
        dlg_layout.addWidget(scroll)

        info_lbl = QLabel(
            f"출력 해상도: 360 DPI | 규격: {self.model.tape_width_mm}mm × {self.model.effective_length_mm}mm | "
            f"비트맵: {one_bit_img.width}×{one_bit_img.height} px (1-bit Monochrome)"
        )
        info_lbl.setStyleSheet("color: #8b949e; font-size: 11px;")
        dlg_layout.addWidget(info_lbl)

        btn_box = QHBoxLayout()
        btn_save = QPushButton("💾 비트맵 PNG 저장")
        btn_save.clicked.connect(lambda: self._save_preview_png(one_bit_img))
        btn_box.addWidget(btn_save)

        btn_box.addStretch()
        btn_close = QPushButton("닫기")
        btn_close.clicked.connect(dlg.close)
        btn_box.addWidget(btn_close)
        dlg_layout.addLayout(btn_box)

        dlg.exec()

    def _save_preview_png(self, img: Image.Image):
        path, _ = QFileDialog.getSaveFileName(self, "PNG 저장", "label_360dpi.png", "PNG Images (*.png)")
        if path:
            img.save(path)
            QMessageBox.information(self, "저장 완료", f"360 DPI 라벨 이미지가 저장되었습니다:\n{path}")

    def do_print(self):
        printer_name = self.combo_printer.currentText()
        if not printer_name:
            QMessageBox.warning(self, "프린터 없음", "인쇄할 프린터를 선택하세요.")
            return

        copies = self.spin_copies.value()
        # 1-bit Monochrome 이미지 렌더링
        rendered_img = LabelRenderer.render(self.model)

        ok, msg = PrinterController.print(printer_name, rendered_img, self.model, copies=copies)
        if ok:
            QMessageBox.information(self, "인쇄 완료", msg)
        else:
            QMessageBox.critical(self, "인쇄 오류", msg)

    def do_batch_print(self, records: List[List[str]], target_element_id: str):
        printer_name = self.combo_printer.currentText()
        if not printer_name:
            QMessageBox.warning(self, "프린터 없음", "인쇄할 프린터를 선택하세요.")
            return

        target_elem = next((e for e in self.model.elements if e.id == target_element_id), None)
        if not target_elem and self.model.elements:
            target_elem = self.model.elements[0]

        reply = QMessageBox.question(
            self, "대량 인쇄 확인",
            f"총 {len(records)}개의 라벨을 '{printer_name}'로 연속 인쇄하시겠습니까?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply != QMessageBox.StandardButton.Yes:
            return

        success_count = 0
        for idx, row in enumerate(records):
            val = row[0] if row else ""
            # 모델 복제 후 대상 요소 값 대체
            temp_model = copy.deepcopy(self.model)
            t_elem = next((e for e in temp_model.elements if e.id == target_elem.id), None)
            if t_elem:
                if t_elem.element_type == 'text':
                    t_elem.text = val
                elif t_elem.element_type in ('barcode', 'qrcode'):
                    t_elem.barcode_data = val

            rendered = LabelRenderer.render(temp_model, serial_offset=idx)
            ok, _ = PrinterController.print(printer_name, rendered, temp_model, copies=1)
            if ok:
                success_count += 1

        QMessageBox.information(self, "대량 인쇄 완료", f"총 {len(records)}건 중 {success_count}건 인쇄 완료되었습니다.")
