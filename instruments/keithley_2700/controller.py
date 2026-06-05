import serial
import serial.tools.list_ports
import threading
import time
import logging
import re

logger = logging.getLogger(__name__)

class Keithley2700Controller:
    def __init__(self):
        self.port = "COM3"
        self.baudrate = 9600
        self.serial_conn = None
        self.is_connected = False
        self.is_polling = False
        self.is_switching = False
        
        self.mode = "4-Wire" # "2-Wire" or "4-Wire"
        self.range = "Auto"
        self.speed = "MED"
        self.relative_on = False

        # 콜백
        self.on_value_received = None
        self.on_state_change = None
        self.on_log_triggered = None
        self.on_error = None
        self.on_info = None

        # 설정
        self.wait_time = 2.0
        self.last_poll_time = 0

    def connect(self):
        try:
            if self.serial_conn and self.serial_conn.is_open:
                self.serial_conn.close()
            
            self.serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1.0
            )
            self.is_connected = True
            
            # 초기화 명령
            self.send_command("*RST")
            time.sleep(0.5)
            self.send_command("SYST:REM")
            self.send_command("*CLS")
            
            # 기본 모드 설정 (4-Wire)
            self.set_mode(self.mode)
            
            # 장치 정보 확인
            idn = self.send_command("*IDN?")
            msg = f"Keithley 2700 Connected: {idn if idn else 'Unknown'}"
            if self.on_info: self.on_info(f"[SYSTEM] {msg}")
            
            return True
        except Exception as e:
            logger.error(f"Keithley 2700 Connection Error: {e}")
            if self.on_error: self.on_error(str(e))
            return False

    def disconnect(self):
        self.stop_polling()
        if self.serial_conn and self.serial_conn.is_open:
            self.send_command("SYST:LOC")
            self.serial_conn.close()
        self.is_connected = False
        if self.on_state_change:
            self.on_state_change(False)

    def send_command(self, cmd):
        """명령어 전송 시 CRLF(\\r\\n) 터미네이터를 사용합니다."""
        if self.serial_conn and self.serial_conn.is_open:
            try:
                full_cmd = (cmd + "\r\n").encode("ascii")
                self.serial_conn.write(full_cmd)
                if "?" in cmd:
                    return self.serial_conn.readline().decode().strip()
            except Exception as e:
                logger.error(f"Keithley 2700 Send Error: {e}")
        return None

    def start_polling(self):
        self.is_polling = True
        threading.Thread(target=self._polling_worker, daemon=True).start()

    def stop_polling(self):
        self.is_polling = False

    def _polling_worker(self):
        while self.is_polling:
            if self.is_connected and not self.is_switching:
                try:
                    # 데이터 읽기
                    raw_data = self.send_command(":READ?")
                    if raw_data:
                        # Keithley 2700 데이터 파싱 (보통 컴마로 구분된 여러 값이 옴)
                        # 예: +1.2345E+00, 00001.234, +01234
                        parts = raw_data.split(',')
                        if parts:
                            val_str = parts[0].strip()
                            try:
                                val_float = float(val_str)
                                formatted = f"{val_float:.6E}"
                                if self.on_value_received:
                                    self.on_value_received(formatted)
                            except: pass
                except Exception as e:
                    logger.error(f"Polling error: {e}")
            time.sleep(0.5)

    def set_mode(self, mode):
        self.mode = mode
        p = "FRES" if mode == "4-Wire" else "RES"
        self.is_switching = True
        try:
            self.send_command(f":FUNC '{p}'")
            # 자동 레인지 기본 활성
            self.send_command(f":{p}:RANG:AUTO ON")
        finally:
            self.is_switching = False

    def set_range(self, range_val):
        self.range = range_val
        p = "FRES" if self.mode == "4-Wire" else "RES"
        self.is_switching = True
        try:
            if range_val == "Auto":
                self.send_command(f":{p}:RANG:AUTO ON")
            else:
                self.send_command(f":{p}:RANG {range_val}")
        finally:
            self.is_switching = False

    def set_speed(self, speed):
        self.speed = speed
        p = "FRES" if self.mode == "4-Wire" else "RES"
        nplc = {"FAST": 0.1, "MED": 1.0, "SLOW": 10.0}.get(speed, 1.0)
        self.is_switching = True
        try:
            self.send_command(f":{p}:NPLC {nplc}")
        finally:
            self.is_switching = False

    def trigger_zero(self):
        """정밀 진단 워커를 별도 스레드에서 실행"""
        threading.Thread(target=self._trigger_zero_worker, daemon=True).start()

    def _trigger_zero_worker(self):
        """장비를 확실히 멈추고(Triple ABOR) 17번 키를 시뮬레이션"""
        if not self.is_connected: return
        self.is_switching = True
        try:
            self.log_print("--- Triple Abort & Key 17 Simulation ---")
            
            # 1. 강력한 입막음 (3회 반복)
            for _ in range(3):
                self.send_command("ABOR")
                self.send_command(":INIT:CONT OFF")
                time.sleep(0.3)
            
            self.send_command("*CLS")
            self.send_command(":TRAC:CLE")
            time.sleep(0.5)
            
            # 2. 17번 키 시도 (16번이 온도였으므로 17번이 REL일 확률 99%)
            # 만약 17번도 아니면 18번까지 시도합니다.
            variants = [":SYST:KEY 17", ":SYST:KEY 18", ":FRES:REL ON"]
            
            success_cmd = None
            for cmd in variants:
                self.log_print(f"Trying: {cmd}")
                # 버퍼 비우기
                if self.serial_conn: self.serial_conn.reset_input_buffer()
                
                self.send_command(cmd)
                time.sleep(1.0)
                
                res = self.send_command("SYST:ERR?")
                self.log_print(f"Device Response: {res}")
                
                if res and ("No error" in res or res.startswith("0")):
                    success_cmd = cmd
                    break
                else:
                    self.send_command("*CLS")
                    time.sleep(0.2)

            if success_cmd:
                self.relative_on = True
                if self.on_info: self.on_info(f"[SUCCESS] Zero Triggered via {success_cmd}")
            else:
                if self.on_error: self.on_error("17, 18번 키 및 표준 명령 모두 거부됨")

            self.send_command(":INIT:CONT ON")
        except Exception as e:
            if self.on_error: self.on_error(f"Exception: {e}")
        finally:
            self.is_switching = False

    def log_print(self, msg):
        if self.on_info: self.on_info(f"[DEBUG] {msg}")

    def toggle_relative(self, on: bool):
        p = "FRES" if self.mode == "4-Wire" else "RES"
        self.is_switching = True
        try:
            state = "ON" if on else "OFF"
            self.send_command(f":{p}:REL:STAT {state}")
            self.relative_on = on
        finally:
            self.is_switching = False
