# -*- coding: utf-8 -*-
"""
Epson PRIFIA OK900P — Desktop Application Entry Point
"""

import sys
import os

# 모듈 검색 경로 추가 (단독 실행 지원)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QIcon
from instruments.epson_ok900p.gui import OK900PMainWindow


def main():
    # 고해상도 DPI 스케일링 설정
    app = QApplication(sys.argv)
    app.setApplicationName("Epson PRIFIA OK900P Label Studio")

    icon_path = os.path.join(BASE_DIR, "assets", "epson_ok900p.png")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))

    window = OK900PMainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
