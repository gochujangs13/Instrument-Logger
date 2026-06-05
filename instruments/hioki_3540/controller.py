import serial
import threading
import time
import re
import logging

# 모듈 레벨 로거 설정 (프로덕션 환경에서 print 대체)
logger = logging.getLogger(__name__)


class Hioki3540Controller:
    """
    HIOKI 3540-03 mΩ HiTESTER RS-232C Controller
    Optimized: Using \\r as delimiter and increasing stability.
    """

    # ─── 타이밍 상수 (Magic Number 제거) ───────────────────────────────────────
    POLL_INTERVAL_SEC   = 0.4   # 폴링 1사이클 목표 주기 (초)
    MIN_SLEEP_SEC       = 0.1   # 폴링 루프 최소 슬립 (초)
    RESIDUAL_WAIT_SEC   = 0.05  # ERR 응답 후 잔여 데이터 대기 (초)
    DISCONNECT_TIMEOUT  = 2.0   # disconnect() 에서 스레드 join 최대 대기 (초)
    NO_RESPONSE_SLEEP   = 0.2   # 응답 없을 때 재시도 대기 (초)
    # ──────────────────────────────────────────────────────────────────────────

    def __init__(self, port=None, baudrate=9600, timeout=1.0):
        self.port      = port
        self.baudrate  = baudrate
        self.timeout   = timeout       # serial readline() 타임아웃 (초)

        self.serial_conn  = None
        self.is_connected = False
        self.is_running   = False

        # ─── 콜백 ─────────────────────────────────────────────────────────────
        self.on_value_received = None   # (is_valid, val_float, formatted_str)
        self.on_log_triggered  = None   # (val_float, raw_val_str)
        self.on_error          = None   # (message: str)
        self.on_state_change   = None   # (new_state: str)
        # ─────────────────────────────────────────────────────────────────────

        # ─── 설정 ─────────────────────────────────────────────────────────────
        self.read_command    = "RMES"
        self.sampling_speed  = "F"
        self.wait_time       = 2.0    # STABILIZING → WAIT_FOR_OPEN 전이 대기 (초)
        # ─────────────────────────────────────────────────────────────────────

        self.state              = "WAIT_FOR_CONTACT"
        self.contact_start_time = 0.0
        self.thread             = None

        self.value_pattern = re.compile(r'([+-]?\d+\.?\d*[Ee][+-]?\d+)')

    # ──────────────────────────────────────────────────────────────────────────
    # 연결 / 해제
    # ──────────────────────────────────────────────────────────────────────────

    def connect(self, initial_mode=None, initial_speed="F", initial_range="AUTO"):
        """시리얼 포트에 연결하고 초기 설정을 동기화합니다. 성공 시 True 반환."""
        try:
            if self.serial_conn and self.serial_conn.is_open:
                try: self.serial_conn.close()
                except: pass

            self.serial_conn = serial.Serial()
            self.serial_conn.port     = self.port
            self.serial_conn.baudrate = self.baudrate
            self.serial_conn.bytesize = serial.EIGHTBITS
            self.serial_conn.parity   = serial.PARITY_NONE
            self.serial_conn.stopbits = serial.STOPBITS_ONE
            self.serial_conn.timeout  = self.timeout
            
            time.sleep(0.1)
            self.serial_conn.open()
            
            self.is_connected = True
            
            # 장비가 시리얼 포트 연결 직후 안정화될 시간 확보
            time.sleep(0.3)
            
            # 1. 초기 레인지 동기화 (AUTO 포함)
            if hasattr(self, 'set_range'):
                self.set_range(initial_range)
                time.sleep(0.1)
                
            # 2. 초기 샘플링 속도 동기화
            if hasattr(self, 'set_sampling_speed'):
                # Hioki는 F, S 만 지원하므로 MED(M)가 들어오면 S로 다운그레이드 처리
                speed_code = "S" if initial_speed == "M" else initial_speed
                self.set_sampling_speed(speed_code)
                time.sleep(0.1)
                
            return True
        except Exception as e:
            self.is_connected = False
            self._notify_error(f"Connect failed: {e}")
            return False

    def disconnect(self):
        """폴링을 중단하고 시리얼 포트를 닫습니다."""
        self.is_running = False

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=self.DISCONNECT_TIMEOUT)
            if self.thread.is_alive():
                logger.warning(
                    "Polling thread did not stop within %.1fs. "
                    "Proceeding to close serial anyway.",
                    self.DISCONNECT_TIMEOUT,
                )
        self.thread = None

        if self.serial_conn and self.serial_conn.is_open:
            try:
                # DTR/RTS를 명시적으로 꺼서 USB 인터페이스를 OS에 반환
                self.serial_conn.dtr = False
                self.serial_conn.rts = False
                self.serial_conn.reset_input_buffer()
                self.serial_conn.reset_output_buffer()
                self.serial_conn.close()
                self.serial_conn = None
            except Exception as e:
                logger.error(f"Error during serial close: {e}")
                self.serial_conn = None
        self.is_connected = False

    # ──────────────────────────────────────────────────────────────────────────
    # 명령 송수신
    # ──────────────────────────────────────────────────────────────────────────

    def send_command(self, cmd: str):
        """
        \\r 구분자를 붙여 명령을 전송하고 응답을 반환합니다.

        Notes
        -----
        - reset_input_buffer()를 쓰기 *전*에 호출해 직전 응답 잔여분을 제거합니다.
        - serial.Serial(timeout=...)이 readline()의 대기를 담당하므로
          별도 sleep()이 필요 없습니다.
        - 비ASCII 바이트는 errors='ignore' 로 안전하게 무시합니다.
        - ERR 포함 응답도 문자열로 반환하며, 호출자가 판단합니다.
        """
        if not self.is_connected or not self.serial_conn:
            return None
        try:
            # [FIX] 버퍼 초기화를 write 직전에 수행 → 이전 잔여 데이터만 제거
            self.serial_conn.reset_input_buffer()
            self.serial_conn.write(f"{cmd}\r".encode("ascii"))
            self.serial_conn.flush()

            # [FIX] sleep(0.1) 제거 — serial timeout이 readline() 대기를 처리
            response = (
                self.serial_conn.readline()
                .decode("ascii", errors="ignore")
                .strip()
            )

            if response:
                if "ERR" in response.upper():
                    logger.debug("CMD='%s' -> ERR_RESP='%s'", cmd, response)
                    # 잔여 데이터 읽기
                    time.sleep(self.RESIDUAL_WAIT_SEC)
                    if self.serial_conn.in_waiting:
                        residual = (
                            self.serial_conn.read(self.serial_conn.in_waiting)
                            .decode("ascii", errors="ignore")
                            .strip()
                        )
                        if residual:
                            logger.debug("Residual='%s'", residual)
                else:
                    logger.debug("CMD='%s' -> RESP='%s'", cmd, response)
            else:
                logger.debug("CMD='%s' -> TIMEOUT", cmd)

            return response
        except Exception as e:
            self._notify_error(f"Comm error: {e}")
            return None

    # ──────────────────────────────────────────────────────────────────────────
    # 장비 설정
    # ──────────────────────────────────────────────────────────────────────────

    def set_sampling_speed(self, speed: str):
        """'F'(Fast) 또는 'S'(Slow) 중 하나를 설정합니다."""
        if speed in ("F", "S"):
            code = "1" if speed == "F" else "0"
            return self.send_command(f"SMP {code}")
        logger.warning("Invalid sampling speed: '%s'. Use 'F' or 'S'.", speed)
        return None

    def set_range(self, range_code: str):
        """
        측정 레인지를 설정합니다.

        Parameters
        ----------
        range_code : str
            'AUTO' 이면 자동 레인지, 그 외에는 RNG 명령 코드.
        """
        if range_code == "AUTO":
            return self.send_command("AUTO 1")

        # [FIX] AUTO 0 응답이 None이거나 ERR을 포함하면 RNG 명령 생략
        result = self.send_command("AUTO 0")
        if result is None or "ERR" in result.upper():
            self._notify_error(
                f"AUTO 0 command failed (response={result!r}), skipping RNG."
            )
            return None
        return self.send_command(f"RNG {range_code}")

    # ──────────────────────────────────────────────────────────────────────────
    # 폴링 제어
    # ──────────────────────────────────────────────────────────────────────────

    def start_polling(self):
        """측정 폴링 스레드를 시작합니다."""
        if not self.is_connected or self.is_running:
            return
        self.is_running = True
        self.state = "WAIT_FOR_CONTACT"
        self._notify_state_change(self.state)
        self.thread = threading.Thread(
            target=self._polling_loop, daemon=True, name="Hioki3540-Poller"
        )
        self.thread.start()

    def stop_polling(self):
        """폴링을 요청 중단합니다 (스레드 종료는 비동기)."""
        self.is_running = False

    # ──────────────────────────────────────────────────────────────────────────
    # 내부 — 폴링 루프
    # ──────────────────────────────────────────────────────────────────────────

    def _polling_loop(self):
        """폴링 스레드 진입점. 예외 발생 시 로그 후 정리."""
        try:
            while self.is_running and self.is_connected:
                start_time = time.time()
                response   = self.send_command(self.read_command)

                if not response:
                    time.sleep(self.NO_RESPONSE_SLEEP)
                    continue

                is_valid         = False
                val_float        = 0.0
                raw_upper        = response.upper()

                # ── 응답 파싱 ─────────────────────────────────────────────────
                if "OF" in raw_upper:
                    # [FIX] 오버플로우(OF)는 프로브 오픈 상태이므로 상태 머신 리셋
                    formatted_str    = "Over Flow"
                elif "----" in raw_upper:
                    # [FIX] 전류 오류도 프로브 접촉 불량/오픈 상태이므로 상태 머신 리셋
                    formatted_str    = "Current Error"
                elif "ERR" in raw_upper:
                    formatted_str = "Cmd Error"
                else:
                    match = self.value_pattern.search(response)
                    if match:
                        try:
                            val_float     = float(match.group(1))
                            is_valid      = True
                            formatted_str = f"{val_float:g} Ω"
                        except ValueError:
                            formatted_str = response
                    else:
                        formatted_str = response or "---"
                # ─────────────────────────────────────────────────────────────

                # UI/외부 콜백 — 일시 오류 포함 항상 전달 (디스플레이 목적)
                self.current_formatted = formatted_str # 최신값 저장
                if self.on_value_received:
                    self.on_value_received(is_valid, val_float, formatted_str)

                # 상태 머신 업데이트 (OF 등 에러 시 is_valid=False 로 인해 자동으로 리셋됨)
                self._update_state_machine(is_valid, val_float, formatted_str)

                # 주기 조절
                elapsed    = time.time() - start_time
                sleep_time = max(self.MIN_SLEEP_SEC, self.POLL_INTERVAL_SEC - elapsed)
                time.sleep(sleep_time)

        except Exception as e:
            self._notify_error(f"Polling thread crashed: {e}")
            logger.exception("Polling loop terminated unexpectedly.")
        finally:
            # 정상/비정상 종료 모두 플래그 정리
            self.is_running = False

    # ──────────────────────────────────────────────────────────────────────────
    # 내부 — 상태 머신
    # ──────────────────────────────────────────────────────────────────────────

    def _update_state_machine(self, is_valid: bool, val_float: float, raw_val_str: str):
        if self.state == "WAIT_FOR_CONTACT":
            if is_valid:
                self.contact_start_time = time.time()
                self._change_state("STABILIZING")

        elif self.state == "STABILIZING":
            if not is_valid:
                self._change_state("WAIT_FOR_CONTACT")
                return
            if time.time() - self.contact_start_time >= self.wait_time:
                if self.on_log_triggered:
                    self.on_log_triggered(val_float, raw_val_str)
                self._change_state("WAIT_FOR_OPEN")

        elif self.state == "WAIT_FOR_OPEN":
            if not is_valid:
                self._change_state("WAIT_FOR_CONTACT")

    def _change_state(self, new_state: str):
        if self.state != new_state:
            self.state = new_state
            self._notify_state_change(new_state)

    # ──────────────────────────────────────────────────────────────────────────
    # 내부 — 콜백 헬퍼 (None 체크 중복 제거)
    # ──────────────────────────────────────────────────────────────────────────

    def _notify_error(self, message: str):
        logger.error(message)
        if self.on_error:
            self.on_error(message)

    def _notify_state_change(self, state: str):
        logger.debug("State -> %s", state)
        if self.on_state_change:
            self.on_state_change(state)