import customtkinter as ctk

class BaseInstrumentView(ctk.CTkFrame):
    """
    모든 계측기 UI 모듈의 기본 클래스.
    메인 프로그램(App)과의 통신 인터페이스를 정의합니다.
    """
    def __init__(self, master, app, **kwargs):
        super().__init__(master, **kwargs)
        self.app = app # App 인스턴스 참조

    def update_ui_text(self):
        """다국어 지원 등 UI 텍스트 갱신 시 호출"""
        pass

    def get_settings_ui(self, master):
        """사이드바에 표시될 장비 전용 설정 UI 프레임을 반환 (필요 시 구현)"""
        return None

    def export_csv(self):
        """장비 고유의 데이터 형식으로 CSV 내보내기 실행"""
        pass

    def on_enter_pressed(self):
        """메인 화면에서 Enter 키 입력 시 동작 (수동 캡처 등)"""
        pass

class BaseInstrumentController:
    """
    모든 계측기 컨트롤러의 기본 클래스.
    하드웨어 통신 및 데이터 처리를 담당합니다.
    """
    def __init__(self):
        self.is_connected = False
        self.on_value_received = None
        self.on_log_triggered = None
        self.on_state_change = None
        self.on_error = None

    def connect(self, **kwargs):
        raise NotImplementedError

    def disconnect(self):
        raise NotImplementedError

    def start_polling(self):
        pass

    def stop_polling(self):
        pass
