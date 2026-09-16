# 계측기 통신 프로토콜 기준 문서 (검증됨)

> ⚠️ **경고**: 이 문서는 각 계측기의 검증된 통신 프로토콜을 기록한 것으로, 계측기 평가(측정) 로직 수정 시
> 본 문서에 명시된 통신 파라미터(보레이트, 종단문자, 명령어, 초기화 시퀀스 등)를 절대 임의로 변경하지 말 것.
> 변경이 필요한 경우 반드시 사용자 확인 후 이 문서도 함께 갱신할 것.

---

## 1. Hioki 3540 (mΩ HiTESTER)

- **시리얼 설정**: baudRate 9600, dataBits 8, parity none, stopBits 1
  - 출처: `instruments/hioki_3540.js` line 8 / `instruments/hioki_3540/controller.py` (`serial.EIGHTBITS`, `PARITY_NONE`, `STOPBITS_ONE`, baudrate=9600) / `Manuals/Hioki_3540_Manual.md` ("Baud Rate: 9600 bps (Fixed, cannot be changed)")
- **종단문자**: `\r` (CR only) — JS와 Python 컨트롤러 모두 `\r`만 사용
- **연결 초기화 시퀀스**: JS에는 `onConnect`가 없음. Python 컨트롤러의 `connect()`는 `AUTO 1\r`(레인지 자동) → `SMP <code>\r`(샘플링 속도) 순으로 동기화하지만, JS 모듈에는 이 초기화 호출이 없음.
- **폴링 명령(pollCmd)**: `'RMES\r'`, pollInterval 400ms — Python `read_command = "RMES"` + `\r`, POLL_INTERVAL_SEC=0.4와 일치.
- **응답 파싱 형식**:
  - `OF` 포함 → Over Flow / `----` 포함 → Current Error / `ERR` 포함 → Cmd Error
  - 정규식 `([+-]?\d+\.?\d*[Ee][+-]?\d+)` 로 지수표기 숫자 추출, `toPrecision(5)`, 단위 `Ω`
  - Python 컨트롤러의 `value_pattern` 정규식과 OF/----/ERR 분기 로직과 동일
- **buildSettings 명령**: `SMP 1\r`/`SMP 0\r` (FAST/SLOW), `AUTO 1\r` 또는 `AUTO 0\r` + `RNG <code>\r` (레인지) — Python `set_sampling_speed`/`set_range`와 명령어 형식 일치
- **검증 결과**: **일치**. 시리얼 설정, pollCmd, 종단문자(`\r`), 파싱 로직, range/speed 명령 포맷 모두 원본 컨트롤러 및 매뉴얼과 동일. 단, JS에는 Python의 연결 시 `AUTO 1` / `SMP` 동기화(`connect()`의 초기 레인지·속도 설정)가 없음 — 기능 차이일 뿐 통신 프로토콜 자체의 불일치는 아님 (참고용으로만 기록).
- **고정 규칙 (변경 금지)**:
  - baudRate=9600, 8-N-1 (Hioki 3540은 보레이트 고정, 변경 불가)
  - 모든 명령/폴링은 `\r` 종단문자 사용 (`\r\n` 아님)
  - pollCmd는 반드시 `'RMES\r'`
  - 응답 파싱 시 `OF`/`----`/`ERR` 우선순위 분기를 RMES 정상값 파싱보다 먼저 검사

---

## 2. Keithley 2700

- **시리얼 설정**: baudRate 9600, dataBits 8, parity none, stopBits 1
  - 출처: `instruments/keithley_2700.js` line 8 / `Backups/20260518_Final_Standardized/instruments/keithley_2700/controller.py` (`serial.EIGHTBITS`, `PARITY_NONE`, `STOPBITS_ONE`, baudrate=9600)
- **종단문자**: `\r\n` (CRLF) — JS의 모든 `sendCmd`와 pollCmd가 `\r\n` 사용. Python `send_command`도 `(cmd + "\r\n")` 사용 → 일치
- **연결 초기화 시퀀스 (onConnect)**:
  1. `*RST\r\n` (즉시)
  2. `*CLS\r\n` (1400ms 후)
  3. `SYST:REM\r\n` (1800ms 후)
  4. `*CLS\r\n` (2100ms 후)
  5. 실행 시점에 선택된 측정 방식에 따라 `SENS:FUNC "<FRES|RES>"\r\n` (2500ms 후)
  6. 실행 시점의 측정 방식에 맞춰 `SENS:<FRES|RES>:RANG:AUTO ON\r\n` (2700ms 후)
  7. 실행 시점에 선택된 측정 방식·속도에 따라 `SENS:<FRES|RES>:NPLC <MIN|1|10>\r\n` (2850ms 후)
  8. `*CLS\r\n` (3050ms 후)
  9. 초기화가 끝난 3200ms 후부터 `READ?` 폴링 타이머 시작
  - Python `connect()`: `*RST` → 0.5초 대기 → `SYST:REM` → `*CLS` → `set_mode("4-Wire")`(=`:FUNC 'FRES'` + `:FRES:RANG:AUTO ON`)
  - JS는 장비의 느린 `*RST` 완료 시간을 고려해 명령을 분산하고, 저장된 2/4-Wire 및 속도 설정을 복원함.
  - 따라서 화면에서 MED가 선택돼 있으면 연결할 때 `SENS:<FRES|RES>:NPLC 1`을 다시 적용함. FAST/SLOW도 같은 방식으로 현재 선택값을 다시 적용함.
  - 초기화 도중 사용자가 속도나 2/4-Wire를 바꿔도, 예약 시점의 오래된 값이 아니라 각 명령 실행 시점의 최신 선택값을 사용함.
  - 연결 초기화에서는 `REL`/`NULL` 명령을 전송하지 않으며, `*RST` 이후에도 상대값 측정을 자동으로 켜지 않음.
- **폴링 명령(pollCmd)**: `':READ?\r\n'`, pollInterval 500ms — Python `_polling_worker`도 `:READ?` 사용, 0.5초 간격으로 일치
- **응답 파싱 형식**: 정규식 `([+-]?\d+\.?\d*[Ee][+-]?\d+)`로 지수표기 추출, `toExponential(4)`, 단위 `Ω` — Python은 `parts[0]`을 `float()` 후 `f"{val_float:.6E}"`로 포맷 (소수점 자릿수만 4 vs 6으로 다름, 통신 프로토콜과는 무관)
- **buildSettings 명령**:
  - 샘플레이트: 현재 측정 함수에 맞춰 `SENS:<FRES|RES>:NPLC <MIN|1|10>\r\n` (FAST/MED/SLOW) — Python `set_speed`는 `:{p}:NPLC <0.1|1.0|10.0>` (FAST=0.1 vs JS의 `MIN`). NPLC 값 표기가 다름 (JS는 SCPI `MIN` 키워드, Python은 `0.1`)
  - 와이어 모드: `SENS:FUNC "FRES"` 또는 `"RES"` — Python `set_mode`는 `:FUNC 'FRES'`/`'RES'` (작은따옴표 vs 큰따옴표 — SCPI 양쪽 다 허용되므로 기능상 동일)
- **검증 결과**: **대체로 일치**, 단 다음 세부 차이가 있음:
  - JS도 연결 시 선택된 측정 함수의 Auto Range를 명시적으로 활성화함.
  - 초기화 명령 사이에 `READ?`가 끼어들지 않도록 폴링 시작을 3200ms 지연함.
  - NPLC FAST 설정값이 JS(`MIN`)과 Python(`0.1`)에서 다름.
- **고정 규칙 (변경 금지)**:
  - baudRate=9600, 8-N-1, 모든 명령 종단문자는 `\r\n`
  - onConnect는 반드시 `*RST` 완료 후 원격 모드·측정 함수·Auto Range·NPLC를 순차 적용
  - pollCmd는 `':READ?\r\n'`, 500ms 간격
  - 측정 함수는 `SENS:FUNC "FRES"`(4-wire) / `"RES"`(2-wire)

---

## 3. Mitutoyo VL-50

- **시리얼 설정**: baudRate 9600, dataBits 7, parity even, stopBits 2
  - 출처: `instruments/mitutoyo_vl50.js` line 6 / `Backups/20260518_Final_Standardized/instruments/mitutoyo_vl50/controller.py` (`serial.SEVENBITS`, `PARITY_EVEN`, `STOPBITS_TWO`, baudrate=9600, `dsrdtr=True`, `rtscts=True`) / `Manuals/VL50B_Complete_Manual.md` (`bytesize=serial.SEVENBITS`, `parity=serial.PARITY_EVEN`, baudrate=9600)
- **종단문자**: `\r\n` (CRLF) — JS `onConnect`의 `'CS\r\n'`, Python `send_command`도 `f"{cmd_upper}\r\n"` → 일치
- **연결 초기화 시퀀스**: `onConnect()` → `app.serial.sendCmd('CS\r\n')` (에러 클리어) — Python `connect()`도 `self.send_command("CS")` 호출 → 일치
- **폴링 명령(pollCmd)**: `'GA01\r\n'`, pollInterval 300ms — Python 컨트롤러의 `_polling_loop`도 `GA01\r\n`을 0.3초 간격으로 전송하여 데이터를 요청하므로 일치.
- **응답 파싱 형식**:
  - JS: 정규식 `([+-]?\d+\.\d+)`로 부동소수점 추출, `toFixed(5)`, 단위 `mm`
  - Python `_process_line`: `line.startswith('G')`이고 콤마(`,`) 포함 시 `line[comma_idx+1:]`을 `float()` 파싱, `{val_float:.5f} mm`. `line.startswith('CH')`는 무시.
  - JS의 정규식 기반 파싱은 Python의 `G...,value` 형식 응답에서도 숫자를 추출할 수 있으며, 두 구현 모두 `GA01` 요청 후 응답을 받는 방식임.
- **검증 결과**: **일치**. 시리얼 설정(7-E-2, 9600), 종단문자(`\r\n`), `onConnect`의 `CS\r\n`, `GA01` 300ms 폴링 및 소수점 5자리 표시가 현재 구현과 일치.
- **고정 규칙 (변경 금지)**:
  - baudRate=9600, dataBits=7, parity=even, stopBits=2 (반드시 7-E-2, 일반적인 8-N-1 아님)
  - 모든 명령 종단문자는 `\r\n`
  - onConnect 시 반드시 `CS\r\n` 전송 (에러 클리어)
  - pollCmd는 반드시 `'GA01\r\n'`, pollInterval은 300ms 유지

---

## 4. DAQ-6510

- **시리얼 설정 (현재 JS)**: baudRate 9600, dataBits 8, parity none, stopBits 1 — `instruments/daq_6510.js` line 450
  - `Manuals/Keithley_DAQ6510_Complete_Manual.md` §1.2: Baud 9600(기본), 8 data bits, 1 stop bit, parity none, flow control none, termination CR(`\r`) 또는 LF(`\n`) — **일치**
  - 단, 이 모듈은 USB(VISA) 연결을 사용하며(`portSelect`에 `USB0::...::INSTR` VISA 주소), `serial:{...}`는 WebSerial fallback 설정으로 보임. 실제 연결은 Python 측 `controller.py`의 PyVISA `rm.open_resource(addr)` 통해 이루어짐.
- **종단문자**: `\r\n` (JS 모든 명령) / Python `controller.py`는 ASRL/COM 연결 시 `daq.read_termination = '\r'`로 설정 — JS(`\r\n`)와 Python 컨트롤러(`\r`) 간 종단문자 표기가 다르나, DAQ6510은 `\r` 또는 `\n` 모두 허용하므로 `\r\n` 전송도 문제 없음 (CR이 종단으로 인식되고 후속 LF는 무시됨)
- **연결 초기화 시퀀스 (start() 함수, onConnect 아님 — 측정 시작 시 실행)**:
  1. `*RST\r\n` (즉시)
  2. `SYST:REM\r\n` (800ms 후)
  3. (1500ms 후) `SENS:FUNC "<FRES|RES>", (@ch_list)\r\n`
  4. FRES인 경우 (1750ms): `SENS:FRES:OCOM ON, (@ch_list)\r\n`
  5. (1900ms): `SENS:<FUNC>:NPLC 1, (@ch_list)\r\n`
  6. (2100ms): `ROUT:SCAN:LIST (@ch_list)\r\n`
  7. (2450/2600/2750ms): `SYST:ERR?\r\n` ×3 (에러 큐 드레인)
  8. (3000ms): 폴링 시작, `:READ?\r\n` 전송 (interval에 따라 1000ms 또는 180000ms)
  - **stop()**: `ROUT:OPEN:ALL\r\n`
- **Python controller.py (`_daq_task`) 시퀀스**:
  1. `*RST` → 0.5초 대기
  2. `SENS:FUNC "<FRES|RES>", (@ch_list)`
  3. FRES인 경우: `SENS:FRES:OCOM ON, (@ch_list)`
  4. `SENS:<FUNC>:NPLC 1.0, (@ch_list)`
  5. `SENS:<FUNC>:RANG:AUTO ON, (@ch_list)` *(JS에는 이 명령이 없음 — Auto Range 명시 설정 누락)*
  6. `ROUT:SCAN (@ch_list)` *(매뉴얼 권장 명령은 `ROUT:SCAN:LIST`, JS는 최신 커밋(885fdc9)에서 `ROUT:SCAN:LIST`로 수정됨, controller.py는 여전히 구버전 `ROUT:SCAN` 사용 — **불일치**)*
  7. `ch_delay > 0`인 경우: `ROUT:CHAN:DELay <delay>, (@ch_list)`
  8. 루프: `READ?` 쿼리
  9. 종료 시: `SYST:LOC` + `ROUT:OPEN (@ch_list)`
- **폴링 명령(pollCmd)**: 명시적 `pollCmd` 필드 없음 (custom viewType). `:READ?\r\n`을 setInterval로 전송 (realtime: 1000ms / full3m: 180000ms)
- **응답 파싱 형식**: 콤마 구분 값들을 `([+-]?\d+\.?\d*[Ee][+-]?\d+)` 정규식으로 각각 파싱. `Math.abs(v) >= 1e30` → `Infinity`("OL" 표시). `SYST:ERR?` 응답 형식(`code,"msg"`)도 별도 파싱하여 0이 아니면 시스템 로그에 에러 출력.
- **검증 결과 (최근 5개 커밋 의도와의 일치 여부)**:
  - ✅ "Use ROUT:CHAN:DELay instead of ROUT:SCAN:DELay" — JS/controller.py 어디에도 `ROUT:SCAN:DELay`는 남아있지 않음. controller.py에는 `ROUT:CHAN:DELay`가 존재(7번 단계). **JS 모듈에는 채널 딜레이 명령(`daq_delay` UI input은 존재하나 `ROUT:CHAN:DELay` 전송 코드 없음)** — 사이드바에 `daq_delay` input이 있지만 `start()` 함수에서 이를 사용/전송하지 않음. → **불일치 (UI 입력값 미사용)**
  - ✅ "Implement native scan ROUT:SCAN → 정확히는 JS는 `ROUT:SCAN:LIST` (885fdc9에서 ROUT:SCAN에서 변경)" — JS는 매뉴얼 §2.3 권장 명령(`ROUT:SCAN:LIST`)과 일치. **그러나 controller.py(PyVISA 경로)는 여전히 `ROUT:SCAN (@ch_list)`(legacy 2700 형식)을 사용 — JS와 controller.py 간 불일치**
  - ✅ "Restore channel configuration list parameters... 4-wire pairing" — JS의 `SENS:FRES:OCOM ON, (@ch_list)` 및 4-wire 채널 충돌 경고 로직 존재, controller.py도 OCOM 설정 존재 → 일치
  - ✅ "Remove read-only ROUT:TERM REAR" — JS, controller.py 어디에도 `ROUT:TERM`이 없음 → 일치 (제거됨)
  - ✅ "Configure DMM settings globally for native mode" — `SENS:FUNC`, `SENS:FRES:OCOM`, `SENS:<FUNC>:NPLC` 전역(채널리스트 포함) 설정이 JS/controller.py 모두 존재 → 일치
  - ⚠️ 추가 불일치: controller.py에는 `SENS:<FUNC>:RANG:AUTO ON`(오토레인지 명시) 명령이 있으나 JS `start()`에는 없음(JS 주석은 "Range는 의도적으로 Auto로 둔다"고 설명하지만 실제로 `RANG:AUTO ON` 명령을 보내지 않음 — 장비 기본값에 의존).
  - ⚠️ JS `daq_delay` 입력 필드(채널 딜레이, 기본값 2)가 `start()`에서 전혀 사용되지 않음 — `ROUT:CHAN:DELay` 명령이 JS에서 누락됨.
- **고정 규칙 (변경 금지)**:
  - baudRate=9600, 8-N-1, termination CR/LF 모두 허용 (JS는 `\r\n` 사용 유지)
  - 시작 시퀀스 순서 고정: `*RST` → `SYST:REM` → `SENS:FUNC` → (FRES면 `OCOM ON`) → `NPLC 1` → `ROUT:SCAN:LIST` → `SYST:ERR?` ×3
  - 채널 스캔 명령은 반드시 `ROUT:SCAN:LIST (@ch_list)` (legacy `ROUT:SCAN`/`ROUT:SCAN:LSEL` 사용 금지 — DAQ6510에서 -113 에러 유발)
  - 종료 시 `ROUT:OPEN:ALL\r\n` 전송 (legacy `ROUT:SCAN:LSEL NONE` 금지)
  - 4-Wire(FRES) 모드에서 11~20번 채널은 자동 페어링 채널이므로 사용자가 직접 추가 시 경고 필요
  - **(검토 필요)** controller.py of `ROUT:SCAN`을 `ROUT:SCAN:LIST`로, JS의 `daq_delay` 미사용 문제를 사용자 확인 후 일치시킬 것

---

## 5. Agilent 4339B

> **연결 계층**
> - 주 연결은 **NI GPIB-USB-HS + NI-488.2/NI-VISA + PyVISA 브리지**이다. `core.js`의 VISA 연결은
>   `/api/visa/connect|write|query|read|disconnect`를 사용하며, `server.py`와 EXE 내장 서버에 같은 API가 구현돼 있다.
> - `serial: {9600, 8-N-1}`은 Web Serial/ASRL 폴백 설정이다. GPIB 리소스는 COM 포트가 아니라
>   `GPIB0::<address>::INSTR` 형식으로 선택한다(기본 주소 17).
> - 개발 서버와 EXE 내장 서버는 모두 VISA 타임아웃을 120초로 두고, GPIB의 read/write termination을 LF로 통일한다.
> - 2026-08-04 실기 검사에서 `*TRG` 후 장비가 측정값을 자동으로 GPIB 출력 큐에 올리는 동작을 확인했다.
>   이 값을 읽기 전에 `FETC?`를 보내면 `-410,"Query INTERRUPTED"`가 발생하므로 VISA 직접 읽기를 사용한다.

- **종단문자**: 모듈의 명령 문자열은 `\r\n`을 사용한다. VISA 경로에서는 PyVISA가 설정된 write/read termination으로 처리한다.
- **측정 시작 설정 시퀀스**:
  1. `*RST` 후 2.2초 대기
  2. `*CLS`
  3. `FUNC 'RES'`
  4. `SOUR:VOLT <voltage>`
  5. `SOUR:CURR:LIM <0.5|1|2|5|10>MA`
  6. `TRIG:SOUR BUS`
  7. `OUTP ON` 후 충전 시간 대기
- **공식 I-Limit 조합 제한** (`SOURce:CURRent:LIMit`):

  | I-Limit | 허용 시험 전압 |
  |---:|---:|
  | 0.5 mA (기본값) | 0~1000 V |
  | 1 mA | 0~1000 V |
  | 2 mA | 0~500 V |
  | 5 mA | 0~250 V |
  | 10 mA | 0~100 V |

  UI는 전압에 맞지 않는 선택지를 비활성화하고, 저장된 조합이 유효하지 않으면 해당 전압의 최대 허용값으로 자동 조정한다.
  16117B Low Noise Test Leads 사용 시에는 장비 매뉴얼에 따라 0.5 mA만 허용된다. 현재 앱의 50 mm 전극 구성은 16008B 셀 기준이다.
- **측정 명령**: `ABOR` → 0.5초 → `*CLS` → 0.3초 → `INIT` → 0.5초 → `*TRG` → 0.5초 → VISA `read()`.
  실장비는 `*TRG` 후 약 107ms에 상태 바이트의 MAV(0x10)를 세우고 `<status>,<data>`를 출력 큐에 넣었다.
  VISA 경로는 `/api/visa/read`로 새 명령 없이 해당 응답을 직접 읽은 뒤에만 결과 기록과 `OUTP OFF`/`*CLS`를 실행한다.
  `*TRG`와 응답 읽기 사이에 `FETC?`, `*OPC?`, `SYST:ERR?` 같은 쿼리를 보내면 대기 중인 측정 응답을 끊어
  `-410,"Query INTERRUPTED"`가 발생한다. 직접 읽기가 실패하거나 타임아웃되면 세션을 clear한다.
  Web Serial 폴백은 직접 VISA read API를 사용할 수 없으므로 기존 `FETC?` 전송 후 수신 스트림 대기를 유지한다.
- **종료/방전**: `OUTP OFF` → 0.5초 → `*CLS`.
- **중지/연결 해제**: 초기화·트리거·응답 대기용 예약 타이머를 모두 취소한다. 연결 해제 훅은
  전송 경로가 닫히기 전에 `OUTP OFF` 완료를 기다리므로, 이전 측정의 지연 명령이 재연결 뒤 섞이지 않는다.
- **응답 파싱 형식**: 트리거 출력의 `<status>,<data>`와 구형 Python 구현이 허용하던 단일 숫자 응답을 파싱한다.
  status는 `0=Normal`, `1=Overload`, `2=No-Contact`, `4=Over-Current(I-Limit)`로 구분하며, `9.9E+37`은 OL로 처리한다.
  VISA/통신 실패는 측정 OL과 다른 상태이므로 데이터 행을 만들지 않고 화면과 시스템 로그에 `GPIB ERR`로 표시한다.
- **검증 결과**:
  - 기존 `*TRG` 후 `FETC?` 방식: 측정값은 수신되지만 직후 오류 큐에 `-410`이 남는 현상을 실기 재현.
  - `*TRG` 후 MAV 확인 및 직접 `read()` 방식: 실제 측정값 수신, 직후와 `OUTP OFF` 후 모두 `+0,"No error"` 실기 확인.
  - `SOUR:CURR:LIM` 실제 적용 및 전압별 자동 제한은 공식 매뉴얼 기준 소스 반영 완료, **고전압 실기 재검증 필요**.
- **고정 규칙 (변경 금지)**:
  - 출력 ON 전에 전압과 I-Limit을 모두 설정한다.
  - 전압별 I-Limit 최대값을 초과하는 조합을 장비로 전송하지 않는다.
  - 모든 종료·중지·연결 해제 경로에서 `OUTP OFF`를 우선 전송한다.
  - 중지·연결 해제 시 아직 실행되지 않은 초기화/측정 타이머와 응답 폴링을 모두 취소한다.
  - 측정 응답의 status 4만 I-Limit(Over-Current)으로 해석하고 status 1/2와 구분한다.
  - VISA/GPIB에서는 `*TRG` 후 측정 응답을 직접 읽기 전까지 어떤 명령이나 쿼리도 전송하지 않는다.
  - VISA read/query 실패를 OL 측정값으로 저장하지 않는다.

---

## 6. PT-2000 Probe Tack Tester

- **연결 방식**: WebHID (시리얼 아님). VID=`0x04D8`, PID=`0xF47E` (Microchip mTouch2)
  - 출처: `instruments/pt2000_probe_tack.js` 헤더 주석 및 `VID`/`PID` 상수
- **원본 검색 결과**: git 히스토리상 이 모듈은 커밋 `05254db`("Add PT-2000 / SP-2100 instrument modules...")에서 신규로 추가됨. `git log --all -- "*pt2000*" "*pt-2000*" "*PT2000*"`로 검색한 결과 더 이전 구현(이전 Python controller 등)은 발견되지 않음 → **신규 구현, 원본 없음**.
- **프로토콜 요약 (자체 정의, 비교 대상 없음)**:
  - Poll: `0x50`('P') 64바이트 리포트, 250ms 간격 + 1500ms 무응답 시 워치독 재전송
  - 데이터 준비 신호: 응답 `[0x86, len, 0x51('Q'), ...]`
  - 커브 다운로드: `0x68`('h') 시작 → `0x5E`('^') 반복 요청, 응답 `[0x86, len, 0x5E, ...]`로 청크 수신, `\r` 구분 부동소수점 값들
  - 결과 저장: `0x55`(Min) `0x56`(Peak) `0x57`(Avg) `0x58`(Variance) `0x59`(StdDev) `0x5a`(Work) `0x63`(완료) 토큰 전송
  - Proceed(probe clean 확인): `0x62`
  - 응답 파싱(`parseForce`): `b[0]===0x86`, 데이터는 `b[2..]`에서 `0x0d`(CR) 전까지 ASCII, 맨 앞 `'P'` 제거 후 `parseFloat`
- **검증 결과**: 원본 미발견 — git 커밋 메시지에 "결과 공식(Min/Max/Avg/Variance/StdDev/Work, abort thresholds)이 장비 개발 매뉴얼과 정확히 일치"라고 명시되어 있으나, 별도의 개발 매뉴얼 파일은 본 작업에서 식별되지 않음.
- **고정 규칙 (변경 금지)**:
  - VID=`0x04D8`, PID=`0xF47E` (장치 식별자)
  - Poll 바이트 `0x50`, 다운로드 시작 `0x68`, 청크 요청 `0x5E`, Proceed `0x62`
  - 결과 저장 토큰 순서: `0x55`(min)→`0x56`(peak)→`0x57`(avg)→`0x58`(var)→`0x59`(stdev)→`0x5a`(work)→`0x63`(done)
  - ABORT 기준: `vals.length < 1000` OR `peak < 1.0gf` (코드 상수 `ABORT_MIN_POINTS`/`ABORT_PEAK_MIN`)
  - PROCEED_MIN_MS = 20000ms (probe clean 대기 최소 시간)

---

## 7. LT-1000 Loop Tack Tester

- **시리얼 설정**: baudRate 9600, dataBits 8, stopBits 1, parity none, flowControl none
  - 출처: `instruments/lt1000_loop_tack.js` line 650 / `lt1000/index.js` line 20 (`SERIAL_CFG`) — 두 구현 동일
- **원본 검색 결과**: `git log --all -- "*lt1000*" "*LT-1000*" "*LT1000*"` 결과 없음(빈 출력) → 이전 표준구현이 git history에 없음. 단, 워킹트리에 `lt1000/index.js`(standalone 웹페이지, untracked `??`)와 `instruments/lt1000_loop_tack.js`(통합 모듈, untracked `??`)가 동시에 존재하며, **두 파일의 핵심 로직(상수, 파싱, 메트릭 계산)이 거의 동일** → `lt1000/index.js`를 사실상의 "원본/참조 구현"으로 간주하여 비교.
- **종단문자/프로토콜**: 능동 명령 없음 (passive receive). 장비가 ASCII 부동소수점을 줄 단위로 전송, 800ms 무수신(`EOT_SILENCE`)을 전송 종료로 판단.
- **연결 초기화 시퀀스 (`onConnect`)**:
  - `instruments/lt1000_loop_tack.js`: `app.serial.port?.setSignals?.({dataTerminalReady:true, requestToSend:true})` (DTR/RTS HIGH 설정) → 디스플레이 초기화 → 연결 가이드 모달 표시
  - `lt1000/index.js`: `doConnect()`에서 동일하게 `port.setSignals({dataTerminalReady:true, requestToSend:true})` 호출 → 일치
- **폴링 명령(pollCmd)**: 없음 (passive). `pollCmd` 필드 자체가 정의되지 않음 — 수신 전용
- **응답 파싱 형식**:
  - 모든 수신 라인을 `rxBuffer`에 누적, 800ms 무수신 후 `onEndOfTransmission()`
  - `raw.split(/[\s,\r\n]+/)`로 토큰화 → `parseFloat`로 모든 숫자 추출
  - `splitHeaderAndCurve`: 처음 20개 값 중 3개 연속 `<0.1`이 나오는 지점을 헤더/커브 경계로 판단
  - 헤더 첫 값(testNum)이 20 이상이면 메모리 풀 경고 모달 표시
  - `computeMetrics`: SAMPLE_RATE=400Hz, SPEED_MM_S=5.08(12in/min), Work = `Σmax(0,f) * 9.81e-6 * DX_MM * 1000`(mJ), 실패모드 판정은 peak 인덱스 비율(<0.3 Snap / <0.6 표준 / 그 외 Creep)
  - `lt1000/index.js`와 `instruments/lt1000_loop_tack.js`의 상수(SAMPLE_RATE, DX_MM, EOT_SILENCE=800, MIN_POINTS=100, MIN_PEAK_GF=2.0) 및 계산식 모두 동일
- **검증 결과**: **일치** (두 구현 간). git history에 더 이전 표준 구현은 없으므로 "신규 구현"으로 간주하되, `lt1000/index.js`(독립 웹페이지)와 `instruments/lt1000_loop_tack.js`(통합 모듈) 간 통신 파라미터·파싱 로직·메트릭 계산이 모두 동일함을 확인.
- **고정 규칙 (변경 금지)**:
  - SERIAL_CFG: `{baudRate:9600, dataBits:8, stopBits:1, parity:'none', flowControl:'none'}`
  - onConnect 시 반드시 DTR=true, RTS=true 신호 설정
  - EOT_SILENCE=800ms, MIN_POINTS=100, MIN_PEAK_GF=2.0gf, SAMPLE_RATE=400Hz, SPEED_MM_S=5.08
  - 헤더/커브 분리 로직(`ZERO_THRESH=0.1`, `ZERO_RUN=3`, 처음 20개 값 내에서만 탐색) 변경 금지
  - 메모리 풀 경고 임계값: testNum >= 20

---

## 8. SP-2100 / TL-2200 (mass_sp2100 / sp2100_logger.js)

> **기준 변경(사용자 확정)**: 이 계측기는 신규 HTML/JS(`instruments/sp2100_logger.js`) 구현을 **기준(원본)** 으로 채택한다. 기존 `instruments/mass_sp2100/sp2100_controller.py`는 구버전 참고자료일 뿐이며, 두 구현이 다를 경우 **JS 쪽이 항상 옳다**. Python 컨트롤러와의 차이는 "불일치"가 아니라 "JS가 신규 표준이고 Python이 구버전"으로 간주한다.

- **시리얼 설정**: 현재 소스는 SP-2100=57600, TL-2200=38400, 8-N-1을 선택한다. 그러나 2026-09-03 실제 연결 장비는 COM5/38400에서만 시험 Raw 블록이 확인됐고 57600 `R\r` 요청은 0 byte였다. 따라서 이 SP-2100 변형은 38400을 사용하며, 향후 모듈에 장비별 baud 선택 또는 안전 자동 검출이 필요하다. 코드 변경 전까지 사용자가 TL-2200/38400 설정으로 원시 캡처한 결과를 SP 측정값으로 오인하지 않도록 주의한다.
- **종단문자**: `\r` (CR only) — `R\r`, `S\r` 모두 CR
- **연결 초기화 시퀀스**: JS `onConnect()` — 명령 전송 없음(모델/보레이트 정보를 로그에만 출력). 프레임워크의 `pollCmd`/`pollInterval` 메커니즘으로 폴링 시작.
- **폴링 명령(pollCmd)**: `'R\r'`, pollInterval 300ms
- **응답 파싱 형식**: SP-2100은 `"AVG"` 또는 `"PEAK"` 라벨이 있는 ASCII 응답만 측정 결과로 인정하고 필드를 라벨명으로 추출한다. TL-2200은 `TL-22[O0]+` 토큰이 있는 CSV 형식만 인정한다. 라벨 없는 설정/핸드셰이크/바이너리 블록은 측정 결과로 기록하지 않는다. 세부 규칙은 `docs/SP2100_PROTOCOL_REFERENCE.md`가 SSOT다.
- **Raw 실기 결과(2026-09-03)**: 38400/8-N-1에서 실제 시험 중 3,719-byte 및 3,462-byte 바이너리 블록과 61-byte 요약 후보를 수집했다. 단일 `R\r` 요청에서도 3,502-byte 블록이 재현됐다. 데이터는 높은 엔트로피의 독점 형식이며 ASCII 라벨이 없고 8/16-bit LE/BE signed/unsigned 후보는 모두 잡음이었다. Raw 바이트 수집은 가능하지만 힘/시간 디코딩은 미확인이다. `docs/SP2100_RAW_CAPTURE_ANALYSIS_20260903.md` 참고.
- **고정 규칙 (변경 금지)**:
  - 종단문자는 `\r` (CR only)
  - JS `pollCmd`는 `'R\r'`, interval 300ms
  - SP-2100은 라벨 기반, TL-2200은 모델 토큰 기반 파싱을 유지한다. 숫자 개수만으로 측정값을 판단하지 않는다.
  - 실제 장비별 baud가 다를 수 있으므로 2026-09-03 확인 장비는 38400이라는 실측을 보존한다. 자동 검출 구현 전 보레이트를 임의로 단일값으로 확정하지 않는다.
  - 단일 체크된 행이 있을 때 새 측정값으로 덮어쓰기(overwrite) 규칙 유지
  - `S\r`은 기계 동작/Run을 시작할 가능성이 있으므로 사용자 명시 승인과 안전 정지 경로 없이 전송하지 않는다.

---

## 9. Keithley SourceMeter 2400

> **신규 통합 기준**: `instruments/keithley_2400.js`와 Keithley 공식 2400 Series SourceMeter User's Manual(2400S-900-01, Sep 2011)을 기준으로 한다. 별도 시제품 폴더의 `:SYST:FRES`와 `:SYST:REM` 명령은 기준이 아니며 통합 모듈에서 사용하지 않는다.

- **전송 방식**: Web Serial 기반 RS-232 또는 NI GPIB-USB-HS + NI-488.2/NI-VISA + PyVISA 브리지. GPIB 리소스는 `GPIB0::<address>::INSTR` 형식으로 연결 화면에 표시한다.
- **COM 포트 검색**: Windows 장치 목록의 `COMn`을 VISA `ASRLn::INSTR`와 함께 검색해 화면에는 `COMn (RS-232)`로 표시한다. NI-VISA가 해당 ASRL 리소스를 `list_resources()`에서 누락해도 선택할 수 있으며, Web Serial 장치 선택 항목도 VISA/GPIB 목록과 관계없이 항상 유지한다.
- **시리얼 설정**: 9600 baud, 8 data bits, parity none, 1 stop bit, flow control none
- **케이블**: 실제 RS-232 전압 레벨을 지원하는 USB-RS232 어댑터 + Straight-through DB-9. Null-modem과 TTL UART 케이블은 사용하지 않는다.
- **프로그램 송신 종단**: `\r` (CR only). 장비는 수신 명령을 CR에서 처리한다.
- **ASRL/VISA 종단**: 장비가 명령을 수신하는 write termination은 항상 `\r`로 고정한다. 장비가 보내는 응답 종단은 전면 설정에 따라 CR/CR+LF/LF/LF+CR일 수 있으므로 Keithley 2400 모듈만 연결 시 read termination을 LF→CR 순서로 자동 탐지한다. 각 후보의 첫 명령은 반드시 `:OUTP OFF`이며, 250 ms 후 `:OUTP?`가 `0`/`OFF`를 반환한 경우에만 채택한다. 탐지 성공 후 잔여 CR/LF 바이트를 비우고 해당 read termination을 세션 동안 유지한다. 다른 ASRL 계측기에는 기존 CR read/write 설정을 유지한다.
- **GPIB 종단**: VISA 브리지가 명령 문자열의 CR/LF를 정리한 뒤 LF write/read termination으로 전송·수신한다. 측정 명령과 파싱·안전 제한은 RS-232와 동일하다.
- **VISA 안전 연결 예외**: 일반 VISA 연결의 서버 선행 `*IDN?`을 2400에는 사용하지 않는다. GPIB는 모듈의 아래 초기화 시퀀스가 `:OUTP OFF`를 첫 장비 명령으로 보낸다. ASRL 자동 종단 탐지는 서버가 후보마다 `:OUTP OFF`와 OFF 확인만 먼저 수행하고, 탐지 완료 후 모듈이 동일한 전체 초기화 시퀀스를 다시 실행한다.
- **연결 초기화 시퀀스**:
  1. `:OUTP OFF\r` - 연결 직후 출력 차단
  2. 250 ms 후 `:OUTP?\r` - 실제 OFF 상태 검증 (최대 4초 대기). 장비 응답은 `0`/`1`뿐 아니라 RS-232 설정에 따라 `OFF`/`ON` 텍스트도 안전하게 해석한다.
  3. `*IDN?\r` - 응답에 `KEITHLEY`와 `2400`이 모두 있는지 확인
  4. `*CLS\r`
  5. `:SYST:RSEN ON|OFF\r` - 저장된 4/2-wire 적용(최초 기본 4-wire)
  6. `:SYST:RSEN?\r` - 실제 적용값 검증
  7. `:FORM:ELEM VOLT,CURR,TIME,STAT\r`
  8. `:SYST:ERR?\r` - 오류 큐가 0인지 확인
- **2/4-wire**: `:SYST:RSEN ON`은 4-wire Remote Sense, `OFF`는 2-wire Local Sense. Sense 전환 전에는 항상 `:OUTP OFF`를 전송하고, 전환 후 쿼리로 검증한다.
- **Source/Measure 설정**:
  - OUTPUT OFF 확인 후 `:SENS:FUNC:OFF:ALL`, `:SENS:FUNC:CONC ON`으로 이전 측정 기능(특히 자동 Ohms)을 제거한다. Source 설정 후 `:SENS:FUNC "VOLT","CURR"`로 두 항목을 모두 실측하고 `:SENS:FUNC?`가 VOLT/CURR 두 기능만 반환하는지 확인한다. `:FORM:ELEM`은 반환 열만 선택하므로 실측 기능을 대신하지 않는다.
  - Source V: `:SOUR:FUNC VOLT`, `:SOUR:VOLT:MODE FIX`, `:SOUR:VOLT:RANG`, `:SOUR:VOLT:LEV`, Compliance는 `:SENS:CURR:PROT`, 전류 측정 Auto Range ON.
  - Source I: `:SOUR:FUNC CURR`, `:SOUR:CURR:MODE FIX`, `:SOUR:CURR:RANG`, `:SOUR:CURR:LEV`, Compliance는 `:SENS:VOLT:PROT`, 전압 측정 Auto Range ON. 인가하는 항목의 실측 레인지는 장비의 Source 레인지를 따른다.
  - 측정 속도: VOLT와 CURR 양쪽에 `:SENS:<CURR|VOLT>:NPLC 0.1|1|10` 적용. 출력 시작 직전에도 `:SYST:RSEN?`으로 2/4-wire를 재확인한다.
  - `:SOUR:CLE:AUTO OFF` 후 `:SOUR:CLE:AUTO? = 0`을 확인해 샘플 사이에도 DC 출력을 유지한다. 이전 자동 출력 OFF 설정 때문에 매 측정마다 DUT가 재인가되는 현상을 방지하며, 정상 종료·오류·사용자 중지의 명시적 OUTPUT OFF는 유지한다.
  - `:ARM:SOUR IMM`, `:ARM:COUN 1`, `:TRIG:SOUR IMM`, `:TRIG:COUN 1`, `:FORM:DATA ASC`로 READ?당 ASCII 한 레코드를 받는다.
  - Source V 보호: `min(210, max(20, |Source V| + 10))` 이상인 공식 장비 OVP 단계 20/40/60/80/100/120/160 V를 자동 적용하고, 160 V 초과는 장비 명령상 `NONE`(210 V 전체 범위)을 사용한다. 화면에는 실제 장비 적용값만 표시한다. 예: 1 V/10 V → 20 V, 100 V → 120 V, 200 V → 210 V 전체 범위. 상태 워드 bit 4가 설정되면 즉시 `OUTPUT OFF`하고 OVP 결과로 기록한다.
- **측정 쿼리와 파싱**: `:READ?\r`; 응답은 `VOLT,CURR,TIME,STAT` 정확히 4개 숫자 필드이며 빈 필드·다중 레코드·잘못된 상태 워드는 거부한다. 저항은 실측 `V/I`, 전력은 실측 `V*I`로 계산한다. `±9.9E37` 계열은 Over Flow로 저장하며 정상값으로 바꾸지 않는다. 정상 수신 원문도 `[2400 READ]` 로그로 남긴다. 그래프는 무효값 구간을 연결하지 않으며 단일 유효점은 점으로 표시한다.
- **Compliance 판정**: 24-bit 상태 워드의 bit 3(`1 << 3`)이 1이면 실제 Compliance. 즉시 `:OUTP OFF`를 전송하고 평가를 중단한다.
- **종료 동기화**: 시작 요청은 측정 완료와 `:OUTP OFF` 검증까지 하나의 비동기 흐름으로 기다린다. 연결 해제 시에는 실행·Pending Query 상태를 먼저 취소한 뒤 마지막 `:OUTP OFF`를 전송하여 종료 처리와 OFF 검증 쿼리가 중복되지 않게 한다. 공통 `SerialController`는 `TextEncoderStream.pipeTo()` 완료와 writer lock 해제를 기다린 뒤 `port.close()`를 호출해야 하며, 닫기 실패를 숨긴 채 화면만 연결 해제로 바꾸지 않는다.
- **소프트웨어 안전 영역(Model 2400 공식 Source Overrange 및 Source/Sink 동작 영역 기준)**:
  - 공식 nominal range는 200 V/1 A이며 Source programming overrange가 105%이므로 장비 기술 한계는 `|V| ≤ 210 V`, `|I| ≤ 1.05 A`이다. 그러나 210 V에서는 +10 V 프로그램 OVP 여유가 없으므로 앱의 평가 한계는 전압 인가와 Voltage Compliance 모두 `|V| ≤ 200 V`로 제한한다.
  - Source V: `|V| ≤ 21 V`이면 Current Compliance `≤ 1.05 A`, `21 V < |V| ≤ 200 V`이면 `≤ 0.105 A`
  - Source I: `|I| ≤ 0.105 A`이면 Voltage Compliance `≤ 200 V`, `0.105 A < |I| ≤ 1.05 A`이면 `≤ 21 V`
  - 모든 모드에서 `|Source × Compliance| ≤ 22 W`. 21 V × 1.05 A처럼 반올림된 코너값이 22 W를 넘으면 프로그램은 Compliance를 `22 / |Source|` 이하로 더 낮춘다.
  - Current Compliance 최소 1 nA, Voltage Compliance 최소 0.2 mV(최소 측정 레인지의 0.1% 기준)
  - 전기 입력은 HTML `min/max`, 포커스 이탈 시 자동 보정, 시작 직전 재검사의 3단계로 제한한다. 사용자가 인가값·Compliance·Sweep·사이클 단계에서 범위를 초과하면 `장비 스펙 초과` 팝업으로 프로그램 전압 ±200 V, 전류 ±1.05 A, 최대 22 W, 21 V 초과 시 최대 0.105 A, 210 V를 제한하는 OVP 여유 사유와 입력값→자동 조정값을 함께 알린다. 이전 버전에서 저장된 범위 초과 설정은 로드할 때 안전 범위로 정규화한다.
  - Sweep은 시작점과 종료점뿐 아니라 생성되는 모든 포인트에 같은 검증을 적용한다.
  - 사이클은 모든 단계의 Source·Compliance 조합과 유지시간을 시작 전에 각각 검증한다. 반복 횟수는 1~1000회, 측정 간격은 0.2~3600초, 단계 유지시간은 0.2~86400초만 허용한다.
- **출력 안전 규칙**:
  - 연결, 설정 변경, 정상 종료, 사용자 중지, Compliance, 통신 오류, 화면 이탈/연결 해제의 모든 경로에서 OUTPUT OFF를 우선한다. 통신이 유지되는 시작/정지 경로는 `:OUTP?`로 ON/OFF 상태까지 확인하며, 확인할 수 없으면 UI에 `OUTPUT ?`와 안전 오류를 표시한다.
  - 30 V 이상이 될 수 있는 조건은 설정 단계부터 최대 예상 전압, Compliance/자동 OVP와 접촉 금지·절연 지그/인터락·OUTPUT OFF/방전 확인 주의사항을 계속 표시한다. 단일·시간·Sweep·사이클의 모든 설정점을 검사하며, 출력 시작 시에도 DUT 정격·극성·배선·비상 차단을 확인하는 체크박스를 다시 거쳐야 한다.
  - 사이클 단계 전환은 출력이 켜진 상태에서 Source를 먼저 0으로 내린 후 새 Compliance를 적용하고, 그 다음 새 Source 값을 적용한다. 각 단계 전환 뒤 오류 큐를 확인하며 정상 완료·중지·오류 시 최종 OUTPUT OFF를 검증한다.
  - 배터리, 외부 전원 연결 DUT, 대용량 커패시터, 의도적인 Sink 운전은 현재 지원 범위 밖이다.
- **지원 평가**: 단일 포인트, 고정 조건 시간 기록, 프로그램이 한 점씩 직렬 실행하는 소프트웨어 I-V Sweep, Source·Compliance·유지시간을 단계별로 지정하는 반복 사이클. 쿼리는 한 번에 하나만 대기하며 겹치지 않는다. 설정 UI는 Source I에서 `R ≤ Voltage Compliance / Source I`, Source V에서 `R ≥ Source V / Current Compliance` 이론 참고값을 초보자 문장으로 실시간 표시하며 측정값이나 안전 제한에는 사용하지 않는다. 같은 카드에 `0~21 V → 최대 약 1.05 A`, `21 V 초과~200 V → 최대 약 0.105 A` 두 구간 표를 표시하고 현재 전압 구간과 실제 22 W 계산 결과를 강조한다. 그래프는 중앙 데이터 테이블 위에서 전압·전류·저항을 독립 Y축으로 그리며 항목별 체크박스로 표시 여부를 제어한다. 결과 미선택 시 최신 평가를 표시하고 체크박스로 하나 또는 여러 평가를 선택하면 선택 결과를 평가별 색상으로 겹쳐 비교한다. 항목은 전압 실선, 전류 파선, 저항 점선으로 구분하며 결과 범례와 표 선택 행의 색상선도 그래프 색상과 일치시킨다. 화면 표는 평가 1회당 한 행으로 묶어 월/일, 수정 가능한 제품명, 최대 `|V|`, 최대 `|I|`, 부호를 포함한 Raw 전류 산술평균, 최대 `|R|`, 측정 수와 평가 시간을 표시한다. 내부 Raw 샘플은 보존하며, 선택 평가 또는 전체 평가를 `assets/keithley_2400_export_template.xlsx` 기반 XLSX로 내보낸다. 내보낼 때 템플릿의 기존 샘플 데이터는 삭제되고 선택 결과만 기록된다. 저장 시점의 프로그램 언어가 한국어면 `대시보드` 시트와 한국어 제목·표·Raw Data 헤더를, 영문이면 `Dashboard` 시트와 영문 제목·표·Raw Data 헤더를 생성하며, `_ChartData` 수식과 통합문서 정의 이름도 해당 시트명을 참조한다. 1번 대시보드는 상단의 항목 체크 셀, 샘플별 색상선+샘플명 범례 셀, Excel 기본 결합 산점도 차트, 하단의 평가별 샘플 체크 목록 순서이며, 샘플별 색상·전압 실선·전류 파선·저항 점선을 사용한다. Excel 결합 차트에서 보조축 계열의 범례 숨김이 무시될 수 있으므로 차트의 기본 범례는 제거하고 샘플당 하나의 범례 셀만 사용한다. 2번 Raw Data는 평가별 4열 블록을 A:D/F:I/K:N 순서로 오른쪽에 추가한다. 샘플 및 항목 체크 셀과 숨김 `_ChartData` 수식이 Raw Data 숫자 셀에 연결되므로 Excel에서 선택 상태나 Raw Data를 바꾸면 차트가 다시 계산된다.
- **검증 상태 (2026-08-26~28)**: COM4/FTDI RS-232에서 Model 2400(S/N 1162685)으로 2-Wire↔4-Wire, Source V/I, 단일·시간·Sweep, 실제 Compliance 자동 OFF, 비상 OFF와 연결 해제 후 COM 반환을 검증했다. 2026-08-28에는 장비 응답 종단이 LF인 상태에서 `ASRL4::INSTR` 연결을 다시 수행해 서버가 LF를 자동 검출하고, `OUTPUT OFF` 확인 → IDN → Sense 적용/확인 → 오류 큐 0의 전체 초기화를 통과해 UI가 준비 상태가 되는 것을 확인했다. 이어 `GPIB0::2::INSTR`에서 같은 장비를 식별하고, 서버 선행 IDN 없이 첫 명령 `:OUTP OFF` → `:OUTP? = 0` → `*IDN?` 순서를 확인했다. 통합 UI에서 Source V 0.1 V/1 mA, 4-Wire, 1 NPLC 단일 측정으로 원시 응답 `+1.000000E-01,+1.384179E-10,+7.798027E+02,+4.215812E+06`을 수신해 0.1000 V, 1.38e-10 A, 약 722 MΩ, Compliance 없음으로 표시·기록했고 그래프 렌더링도 확인했다. 같은 조건의 0.2초 간격/0.6초 시간 평가 3건과 0→0.05→0.1 V 3-point Software Sweep도 모두 OK로 기록됐다. 추가로 0.05→0.10 V, 1 mA Compliance, 단계당 0.2초, 1회 사이클을 실행해 2개 단계 기록, 중앙 그래프 표시, 최종 `OUTPUT OFF`를 확인했고, 별도 0.05 V 사이클 결과에서 제품명을 수정한 뒤 테마 재구성 후에도 수정값이 유지됨을 확인했다. 2026-08-27에는 사용자 제공 템플릿에 서로 길이가 다른 평가 3건을 삽입해 대시보드/Raw Data/숨김 `_ChartData` 3시트 XLSX를 실제 생성했다. 2026-08-28에는 실제 Excel에서 결합 차트 보조축 계열의 범례 삭제가 무시되어 `Current`/`Resistance` 항목이 다시 노출되는 현상을 확인했다. 기본 차트 범례를 제거하고 대시보드 셀에 샘플별 색상선+샘플명만 한 번씩 표시하도록 수정한 뒤, 9 V 가상 평가 5건으로 XLSX를 재생성해 범례 5개, V/I/R 계열 15개, Raw Data 연결 수식, 차트 시작 행과 수식 오류 부재를 재검증했다. 각 평가 종료 후 OFF 검증과 UI 연결 해제 후 GPIB 리소스 반환을 통과했다. 대상은 개방에 가까운 고저항 상태였으므로 GPIB의 실제 Compliance 유도와 낮은 저항 더미 부하·전면 표시값 일치 비교는 별도 검증이 필요하다.

---

## 종합 요약 (불일치/원본 미발견 목록)

| 계측기 | 상태 | 핵심 이슈 |
|---|---|---|
| Hioki 3540 | 일치 | onConnect의 AUTO/SMP 동기화 누락(경미) |
| Keithley 2700 | 대체로 일치 | Auto Range·현재 2/4-Wire·NPLC 연결 시 재적용, FAST 값 표기차(MIN vs 0.1) |
| Keithley 2400 | RS-232 및 GPIB 저에너지 검증 완료 | GPIB 안전 초기화, 단일·시간·Sweep·사이클, 제품명 수정, 중앙 그래프, 정상 OFF, 오류 큐, 재연결 확인. GPIB 실제 Compliance와 낮은 저항 더미 부하·전면 표시 비교는 별도 필요 |
| Mitutoyo VL-50 | 일치 | GA01 300ms 폴링 및 소수점 5자리 표시 적용 |
| DAQ-6510 | 불일치 | controller.py `ROUT:SCAN`(legacy) vs JS `ROUT:SCAN:LIST`; JS `daq_delay` 미사용; RANG:AUTO ON 누락 |
| Agilent 4339B | 직접 읽기 실기 검증 완료 | NI GPIB-USB-HS/PyVISA 브리지 구현. `*TRG` 후 VISA 직접 읽기로 측정값 수신 및 `-410` 미발생 확인. 전압별 I-Limit은 고전압 실기 재검증 필요 |
| PT-2000 | 원본 없음 | WebHID 신규 구현, 비교 대상 없음 |
| LT-1000 | 원본 없음(내부 일치) | git history 없음, lt1000/index.js와 통합모듈은 상호 일치 |
| SP-2100/TL-2200 | JS 신규 기준 확정 | 신규 HTML/JS 구현이 기준, Python 컨트롤러는 구버전 참고용 |
