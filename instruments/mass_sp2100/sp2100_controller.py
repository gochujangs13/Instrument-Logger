import serial
import threading
import time
import re

class SP2100Controller:
    """IMASS SP-2100용 시리얼 컨트롤러 (데이터 비트/패리티 지원)"""
    
    def __init__(self, port=None, baudrate=9600, timeout=0.05):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        
        self.bytesize = serial.EIGHTBITS
        self.parity = serial.PARITY_NONE
        self.stopbits = serial.STOPBITS_ONE
        
        self.rtscts = False
        self.dsrdtr = False
        self.xonxoff = False
        
        self.is_passive = False
        self.serial_conn = None
        self.is_connected = False
        self.is_running = False
        
        self.on_value_received = None 
        self.on_raw_received = None    
        self.on_error = None
        self.thread = None

    def connect(self):
        try:
            if self.serial_conn and self.serial_conn.is_open:
                self.serial_conn.close()
                
            self.serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=self.bytesize,
                parity=self.parity,
                stopbits=self.stopbits,
                timeout=self.timeout,
                rtscts=self.rtscts,
                dsrdtr=self.dsrdtr,
                xonxoff=self.xonxoff
            )
            
            # DTR/RTS 신호를 명시적으로 False로 설정하여 일부 변환기/케이블에서의 신호 간섭이나 Reset 차단 방지
            try:
                self.serial_conn.dtr = False
                self.serial_conn.rts = False
            except Exception as e:
                self._notify_error(f"Failed to set DTR/RTS signals: {e}")


            # 매뉴얼 권장사항: 입력 및 출력 버퍼 클리어
            try:
                self.serial_conn.reset_input_buffer()
                self.serial_conn.reset_output_buffer()
            except: pass
            
            self.is_connected = True
            return True
        except Exception as e:
            self.is_connected = False
            self._notify_error(f"Connect Error: {e}")
            return False

    def disconnect(self):
        self.stop_polling()
        if self.serial_conn and self.serial_conn.is_open:
            try: self.serial_conn.close()
            except: pass
        self.is_connected = False

    def start_polling(self):
        if not self.is_connected or self.is_running: return
        self.is_running = True
        self.thread = threading.Thread(target=self._polling_loop, daemon=True)
        self.thread.start()

    def stop_polling(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=0.5)

    def send_command(self, cmd: str):
        """명령어를 시리얼 포트로 전송"""
        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.write(cmd.encode('ascii'))
                self.serial_conn.flush()
                return True
            except Exception as e:
                self._notify_error(f"Send Command Error: {e}")
        return False

    def _polling_loop(self):
        buffer = b""
        last_recv_time = time.time()
        last_query_time = 0
        last_warning_time = 0
        
        # 연결 직후 자동 스트리밍을 유도하기 위해 S\r 전송 (Passive 모드이면 생략)
        if not self.is_passive:
            try:
                self.serial_conn.write(b"S\r")
                self.serial_conn.flush()
                time.sleep(0.05)
            except Exception as e:
                self._notify_error(f"Initial stream command failed: {e}")
        
        while self.is_running and self.is_connected:
            try:
                # Read 1 byte (blocking read with 0.05s timeout)
                char = self.serial_conn.read(1)
                now = time.time()
                if char:
                    last_recv_time = now
                    if self.on_raw_received: self.on_raw_received(char)
                    if char in (b'\r', b'\n'):
                        if buffer:
                            try:
                                # 상위 비트(parity bit) 마스킹 후 디코딩 (7-E-1, 7-O-1 장비 호환)
                                clean_buf = bytes(b & 0x7F for b in buffer)
                                raw_str = clean_buf.decode('ascii', errors='ignore').strip()
                                self._parse_data(raw_str)
                            except: pass
                            buffer = b""
                    else:
                        buffer += char
                        if len(buffer) > 100: buffer = buffer[1:]
                else:
                    # 데이터 수신 대기 중 타임아웃
                    # 마지막으로 데이터를 수신한 지 3초가 지났다면 3초 주기로 경고 노티
                    if now - last_recv_time >= 3.0:
                        if now - last_warning_time >= 3.0:
                            self._notify_error("Warning: 3초 동안 수신된 데이터가 없습니다. 장비 전원을 확인하거나 송신 상태(Run)인지 확인하세요.")
                            last_warning_time = now

                    # 마지막으로 데이터를 수신한 지 0.3초가 지났고,
                    # 마지막으로 R\r을 보낸 지 0.2초가 지났다면 R\r 송신 (Passive 모드이면 생략)
                    if not self.is_passive and (now - last_recv_time >= 0.3) and (now - last_query_time >= 0.2):
                        try:
                            self.serial_conn.write(b"R\r")
                            self.serial_conn.flush()
                        except Exception as e:
                            self._notify_error(f"Write R\\r failed: {e}")
                        last_query_time = now
            except Exception as e:
                self._notify_error(f"Polling loop exception: {e}")
                time.sleep(0.1)

    def _parse_data(self, raw_str: str, raw_bytes: bytes = b""):
        try:
            # 1. 단일 숫자 (SP-2100 일반 스트림 포맷)
            match = re.match(r'^\s*([-+]?\d*\.?\d+)(?:\s+([a-zA-Z]+))?\s*$', raw_str)
            if match:
                val_float = float(match.group(1))
                unit_str = match.group(2) if match.group(2) else "gf"
                if self.on_value_received: self.on_value_received(True, val_float, unit_str, raw_str, raw_bytes)
                return
            
            # 2. TL-2200 요약 텍스트 (예: "N=15, Val -0.3, SP= 2.2, Avg=0.6, KP=1.7, RMS = 0.3")
            # Avg 또는 Val 값을 추출
            avg_match = re.search(r'Avg=\s*([-+]?\d*\.?\d+)', raw_str, re.IGNORECASE)
            val_match = re.search(r'Val\s*=?\s*([-+]?\d*\.?\d+)', raw_str, re.IGNORECASE)
            
            if avg_match or val_match:
                extracted_val = 0.0
                if avg_match:
                    extracted_val = float(avg_match.group(1))
                elif val_match:
                    extracted_val = float(val_match.group(1))
                
                if self.on_value_received: self.on_value_received(True, extracted_val, "gf", raw_str, raw_bytes)
                return

            if self.on_value_received: self.on_value_received(False, 0.0, "", raw_str, raw_bytes)
        except Exception as e:
            pass

    def _notify_error(self, msg: str):
        if self.on_error: self.on_error(msg)
