import serial
import threading
import time
import re

class VL50Controller:
    """Mitutoyo VL-50 통합 로거용 컨트롤러"""
    POLL_INTERVAL_SEC   = 0.1
    MIN_SLEEP_SEC       = 0.05
    DISCONNECT_TIMEOUT  = 2.0

    def __init__(self, port=None, baudrate=9600, timeout=1.0):
        self.port      = port
        self.baudrate  = baudrate
        self.timeout   = timeout

        self.serial_conn  = None
        self.is_connected = False
        self.is_running   = False

        # 콜백
        self.on_value_received = None
        self.on_log_triggered  = None
        self.on_error          = None
        self.on_state_change   = None

        # 상태 관리 (Hioki/Keithley와 동일)
        self.wait_time = 2.0
        self.state     = "WAIT_FOR_CONTACT"
        self.contact_start_time = 0.0
        self.thread    = None
        self.mode      = "Thickness" # 고정
        self.current_value = 0.0
        self.current_formatted = "Wait Data..."

    def connect(self):
        try:
            if self.serial_conn and self.serial_conn.is_open:
                try: self.serial_conn.close()
                except: pass
            
            # 단독 프로그램(vl50_driver.py) 설정과 동일하게 맞춤
            # 9600, 7bits, Even, 2Stop, dsrdtr=True, rtscts=True
            self.serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.SEVENBITS,
                parity=serial.PARITY_EVEN,
                stopbits=serial.STOPBITS_TWO,
                timeout=self.timeout,
                dsrdtr=True,
                rtscts=True
            )
            
            self.is_connected = True
            time.sleep(0.5)
            
            # 에러 클리어 시도
            self.send_command("CS")
            return True
        except Exception as e:
            self.is_connected = False
            self._notify_error(f"VL-50 연결 실패: {e}")
            return False

    def disconnect(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.close()
                self.serial_conn = None
            except:
                self.serial_conn = None
        self.is_connected = False

    def send_command(self, cmd: str):
        """명령 전송 (단독 프로그램 방식: Uppercase + \r\n)"""
        if not self.is_connected or not self.serial_conn:
            return False
        try:
            cmd_upper = cmd.upper().strip()
            self.serial_conn.write(f"{cmd_upper}\r\n".encode("ascii"))
            self.serial_conn.flush()
            return True
        except Exception as e:
            if self.on_error: self.on_error(f"Send error: {e}")
            return False

    def start_polling(self):
        if not self.is_connected or self.is_running:
            return
        self.is_running = True
        self.state = "WAIT_FOR_CONTACT"
        self._notify_state_change(self.state)
        self.thread = threading.Thread(target=self._polling_loop, daemon=True)
        self.thread.start()

    def _polling_loop(self):
        """단독 프로그램의 청크 기반 읽기 로직 이식"""
        buffer = ""
        try:
            while self.is_running and self.is_connected:
                # 1. 데이터 요청 (0.3초 간격) - GA01 채널 사용
                self.send_command("GA01")
                
                # 2. 응답 대기 및 읽기
                time.sleep(0.15) 
                
                if self.serial_conn and self.serial_conn.in_waiting > 0:
                    try:
                        chunk = self.serial_conn.read(self.serial_conn.in_waiting).decode('ascii', errors='ignore')
                        buffer += chunk
                        
                        if '\r' in buffer or '\n' in buffer:
                            lines = re.split(r'\r\n|\r|\n', buffer)
                            buffer = lines.pop()
                            
                            for line in lines:
                                if line.strip():
                                    self._process_line(line.strip())
                    except Exception as e:
                        pass
                
                time.sleep(0.15) 
        except Exception as e:
            self._notify_error(f"Polling error: {e}")
        finally:
            self.is_running = False

    def _process_line(self, line):
        """단독 프로그램의 파싱 로직 이식"""
        val_float = 0.0
        is_valid  = False
        formatted_str = "Wait..."

        try:
            if line.startswith('G'):
                comma_idx = line.find(',')
                if comma_idx != -1:
                    val_str = line[comma_idx+1:].strip()
                    val_float = float(val_str)
                    is_valid = True
                    formatted_str = f"{val_float:.5f} mm"
            elif line.startswith('CH'):
                # 커맨드 수신 확인 응답
                return
        except Exception:
            formatted_str = "Parse Error"

        self.current_value = val_float
        self.current_formatted = formatted_str

        if self.on_value_received:
            self.on_value_received(is_valid, val_float, formatted_str)

        # 상태 머신 처리
        self._update_state_machine(is_valid, val_float, formatted_str)

    def _update_state_machine(self, is_valid: bool, val_float: float, formatted_str: str):
        # 접촉 감지 (소수점 3자리 이상 변화 시 측정 중으로 판단)
        is_contact = is_valid and (abs(val_float) > 0.001)

        if self.state != "LOGGED":
            if is_contact:
                self.state = "MEASURING"
            else:
                self.state = "READY"
            self._notify_state_change(self.state)

    def _notify_state_change(self, new_state: str):
        if self.on_state_change:
            self.on_state_change(new_state)

    def _notify_error(self, msg: str):
        if self.on_error:
            self.on_error(msg)

