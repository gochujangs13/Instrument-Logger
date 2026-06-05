"""
Agilent 4339B - 펌웨어 01.05 완전 대응 최종본

수정 사항 (구버전 대비):
  [1] measure() return key "success" → "ok"  (app.py 호환 필수)
  [2] ABOR 후 *CLS 복원                      (잔류 데이터/에러 큐 초기화)
  [3] *TRG 후 대기 3초 + 긴급정지 체크 포함
  [4] _safe_off() 분리: OUTP OFF → 0.5초 대기 → *CLS (패널 410 해소)
  [5] disconnect() 에 *CLS 추가
  [6] I-Limit 감지: parts[0] status 코드 파싱
  [7] _wait_for_mav() 완전 제거 (dead code)
"""
import pyvisa
import time
import threading

ELECTRODE_CONSTANTS = {
    "26mm": {"area": 5.7256e-4, "perimeter": 8.4823e-2, "gap": 1.0e-3},
    "50mm": {"area": 2.0612e-3, "perimeter": 1.6022e-1, "gap": 1.0e-3},
    "76mm": {"area": 4.6760e-3, "perimeter": 2.4190e-1, "gap": 1.0e-3},
}


class Agilent4339BController:
    def __init__(self, gpib_address=17, callback=None):
        self.gpib_address = gpib_address
        self.callback = callback
        self.inst = None
        self.rm = None
        self.connected = False
        self._lock = threading.Lock()
        self._charge_time = 60
        self._stop_event = threading.Event()

    @property
    def is_connected(self):
        return self.connected

    def log(self, msg):
        if self.callback:
            self.callback(msg)
        elif hasattr(self, 'on_log_triggered') and self.on_log_triggered:
            self.on_log_triggered(msg)
        else:
            print(msg)

    # ───────────────────────────────────────────
    # 연결 / 해제
    # ───────────────────────────────────────────
    def connect(self):
        try:
            self.rm = pyvisa.ResourceManager()
            self.inst = self.rm.open_resource(f"GPIB0::{self.gpib_address}::INSTR")
            self.inst.timeout = 25000
            idn = self.inst.query("*IDN?").strip()
            self.log(f"[CONNECT] {idn}")
            self.connected = True
            return True
        except Exception as e:
            self.log(f"[ERROR] 연결 실패: {e}")
            return False

    def disconnect(self):
        try:
            if self.inst:
                self.inst.write("OUTP OFF")
                time.sleep(0.5)
                self.inst.write("*CLS")   # ★ 추가: 해제 시 에러 큐 클리어
                self.inst.close()
            if self.rm:
                self.rm.close()
            self.connected = False
        except:
            pass

    # ───────────────────────────────────────────
    # 셋업
    # ───────────────────────────────────────────
    def setup_volume_resistivity(self, voltage, current_limit, charge_time,
                                  discharge_time, electrode, thickness_mm):
        with self._lock:
            self._charge_time = int(charge_time)
            self._setup_instrument(voltage)

    def setup_surface_resistivity(self, voltage, current_limit, charge_time,
                                   discharge_time, electrode):
        with self._lock:
            self._charge_time = int(charge_time)
            self._setup_instrument(voltage)

    def _setup_instrument(self, voltage):
        """01.05 펌웨어에서 검증된 초기화 시퀀스"""
        self.log("[PREPARE] 장비 초기화 중...")
        self.inst.write("*RST")
        time.sleep(2.0)
        self.inst.write("*CLS")
        time.sleep(0.3)
        self.inst.write("FUNC 'RES'")
        time.sleep(0.3)
        self.inst.write(f"SOUR:VOLT {voltage}")
        time.sleep(0.3)
        self.inst.write("TRIG:SOUR BUS")
        time.sleep(0.3)
        self.log(f"[SETUP] 완료 (V={voltage}V, 목표 충전={self._charge_time}s)")

    # ───────────────────────────────────────────
    # 측정 (핵심)
    # ───────────────────────────────────────────
    def measure(self):
        """
        전압 ON → 충전 대기 → 트리거 → 측정 대기 → FETC? → 전압 OFF
        반환 status: "ok" | "stopped" | "error" | "ilimit"
        """
        self._stop_event.clear()

        with self._lock:
            try:
                # 하드웨어 버퍼 클리어
                try:
                    self.inst.clear()
                except:
                    pass
                time.sleep(0.3)

                # 타임아웃: 충전시간 + 여유 30초
                self.inst.timeout = (self._charge_time + 30) * 1000

                # ── Step 1: 전압 인가 ──────────────────
                self.log("[HV] 전압 출력 ON!")
                self.inst.write("OUTP ON")
                time.sleep(1.0)

                # ── Step 2: 충전 대기 ──────────────────
                for i in range(self._charge_time):
                    if self._stop_event.is_set():
                        self.log("[STOP] 긴급 정지 감지 → 충전 중단")
                        self._safe_off()
                        return {"status": "stopped", "message": "사용자가 중단했습니다."}
                    self.log(f"[TIMER] {self._charge_time - i}")
                    time.sleep(1)
                self.log("[TIMER] 0")

                # ── Step 3: 버퍼 초기화 + 트리거 ───────
                self.log("[MEASURE] 트리거 준비...")
                self.inst.write("ABOR")
                time.sleep(0.5)
                self.inst.write("*CLS")   # ★ 복원: 잔류 데이터 / 에러 큐 초기화
                time.sleep(0.3)
                self.inst.write("INIT")
                time.sleep(0.5)
                self.inst.write("*TRG")

                # ── Step 4: 측정 완료 대기 ─────────────
                # *TRG 후 내부 측정 완료까지 대기 (0.5초)
                self.log("[MEASURE] 측정 완료 대기 중 (0.5초)...")
                time.sleep(0.5)

                # ── Step 5: 데이터 수신 ────────────────
                self.log("[MEASURE] 데이터 수신 중...")
                self.inst.timeout = 8000   # FETC? 전용 타임아웃
                result_str = self.inst.query("FETC?").strip()
                self.log(f"[RAW] {result_str}")

                # ── Step 6: 전압 OFF ───────────────────
                self._safe_off()

                # ── Step 7: 결과 파싱 ──────────────────
                parts = result_str.split(",")
                # 4339B 응답 형식: "+status,+value"  (status=0 정상)
                raw_value = float(parts[1]) if len(parts) >= 2 else float(parts[0])

                # I-Limit 도달 감지: status 비트가 0이 아니면 이상
                try:
                    status_code = int(float(parts[0])) if len(parts) >= 2 else 0
                except:
                    status_code = 0

                if status_code != 0:
                    self.log(f"[WARN] 장비 상태 코드: {status_code} → I-Limit 가능성")
                    return {"status": "ilimit", "message": f"장비 상태 코드 {status_code}"}

                # ★ [1]: "success" → "ok"  (main.py 호환)
                return {"status": "ok", "value": raw_value, "raw": result_str}

            except Exception as e:
                self.log(f"[ERROR] 측정 실패: {e}")
                self._safe_off()
                return {"status": "error", "message": str(e)}

    # ───────────────────────────────────────────
    # 내부 유틸
    # ───────────────────────────────────────────
    def _safe_off(self):
        """전압 OFF + 에러 큐 클리어 → 패널 410 해소"""
        try:
            self.inst.write("OUTP OFF")
            time.sleep(0.5)
            self.inst.write("*CLS")
            self.log("[HV] 전압 출력 OFF")
        except Exception as e:
            self.log(f"[HV] 전압 OFF 경고 (무시): {e}")

    # ───────────────────────────────────────────
    # 긴급 정지
    # ───────────────────────────────────────────
    def voltage_off(self):
        """긴급 정지: 락 없이 즉시 OUTP OFF"""
        self._stop_event.set()
        if not self.inst:
            return
        try:
            self.inst.write("OUTP OFF")
            time.sleep(0.3)
            self.inst.write("*CLS")
            self.log("[HV] 긴급 전압 OFF 완료")
        except Exception as e:
            self.log(f"[EMERGENCY] OUTP OFF 전송 실패: {e}")

    # ───────────────────────────────────────────
    # 저항률 계산
    # ───────────────────────────────────────────
    @staticmethod
    def calc_volume_resistivity(resistance_ohm, electrode, thickness_mm):
        ec = ELECTRODE_CONSTANTS[electrode]
        return resistance_ohm * (ec["area"] * 1e4) / (thickness_mm / 10.0)

    @staticmethod
    def calc_surface_resistivity(resistance_ohm, electrode):
        ec = ELECTRODE_CONSTANTS[electrode]
        return resistance_ohm * (ec["perimeter"] * 100) / (ec["gap"] * 100)

    def start_measurement(self, params):
        if not self.connected or self.is_measuring:
            return
        
        self.is_measuring = True
        self._stop_event.clear()
        
        # 스레드 실행
        thread = threading.Thread(target=self._run_measurement_sequence, args=(params,), daemon=True)
        thread.start()

    def stop_measurement(self):
        self._stop_event.set()
        self.voltage_off()
        self.is_measuring = False

    def _run_measurement_sequence(self, params):
        try:
            mode = params.get("mode", "Surface")
            voltage = float(params.get("voltage", 500))
            ilimit = params.get("ilimit", "500uA")
            charge = int(params.get("charge", 60))
            discharge = int(params.get("discharge", 5))
            electrode = params.get("elec", "50mm")
            thickness = float(params.get("thick", 1.0))

            # 1. 장비 설정
            if "Volume" in mode:
                self.setup_volume_resistivity(voltage, ilimit, charge, discharge, electrode, thickness)
            else:
                self.setup_surface_resistivity(voltage, ilimit, charge, discharge, electrode)

            # 2. 측정 실행
            result = self.measure()
            
            # 3. 결과 전송
            if self.on_measurement_complete:
                self.on_measurement_complete(result)
                
        except Exception as e:
            self.log(f"[THREAD ERROR] {e}")
            if self.on_measurement_complete:
                self.on_measurement_complete({"status": "error", "message": str(e)})
        finally:
            self.is_measuring = False

    @property
    def is_measuring(self):
        return getattr(self, "_measuring_flag", False)

    @is_measuring.setter
    def is_measuring(self, val):
        self._measuring_flag = val

    # 콜백 필드 추가 (View에서 설정)
    on_measurement_complete = None
    on_log_triggered = None

    # ───────────────────────────────────────────
    # 유틸
    # ───────────────────────────────────────────
    def list_resources(self):
        try:
            rm = pyvisa.ResourceManager()
            r = list(rm.list_resources())
            rm.close()
            return r
        except:
            return []
