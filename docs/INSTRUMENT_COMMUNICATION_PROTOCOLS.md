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
  2. `SYST:REM\r\n` (600ms 후)
  3. `*CLS\r\n` (800ms 후)
  4. `SENS:FUNC "FRES"\r\n` (1000ms 후)
  - Python `connect()`: `*RST` → 0.5초 대기 → `SYST:REM` → `*CLS` → `set_mode("4-Wire")`(=`:FUNC 'FRES'` + `:FRES:RANG:AUTO ON`)
  - 순서(RST→REM→CLS→FRES 설정)는 동일하나, 타이밍 값(JS는 600/800/1000ms 분산, Python은 RST 후 0.5초 일괄 대기)과 정확한 명령 문자열에 약간 차이 있음 (아래 "검증 결과" 참조)
- **폴링 명령(pollCmd)**: `':READ?\r\n'`, pollInterval 500ms — Python `_polling_worker`도 `:READ?` 사용, 0.5초 간격으로 일치
- **응답 파싱 형식**: 정규식 `([+-]?\d+\.?\d*[Ee][+-]?\d+)`로 지수표기 추출, `toExponential(4)`, 단위 `Ω` — Python은 `parts[0]`을 `float()` 후 `f"{val_float:.6E}"`로 포맷 (소수점 자릿수만 4 vs 6으로 다름, 통신 프로토콜과는 무관)
- **buildSettings 명령**:
  - 샘플레이트: `SENS:FRES:NPLC <MIN|1|10>\r\n` (FAST/MED/SLOW) — Python `set_speed`는 `:{p}:NPLC <0.1|1.0|10.0>` (FAST=0.1 vs JS의 `MIN`). NPLC 값 표기가 다름 (JS는 SCPI `MIN` 키워드, Python은 `0.1`)
  - 와이어 모드: `SENS:FUNC "FRES"` 또는 `"RES"` — Python `set_mode`는 `:FUNC 'FRES'`/`'RES'` (작은따옴표 vs 큰따옴표 — SCPI 양쪽 다 허용되므로 기능상 동일)
- **검증 결과**: **대체로 일치**, 단 다음 세부 차이 발견 (코드 수정은 보류, 기록만):
  - onConnect 시퀀스의 정확한 명령 문자열은 동일(`*RST`, `SYST:REM`, `*CLS`, FRES 설정)하나, Python 원본은 `SENS:FUNC "FRES"` 대신 `:FUNC 'FRES'` + `:FRES:RANG:AUTO ON` (오토레인지 명령 추가)을 보냄. JS onConnect에는 오토레인지 설정 명령이 없음.
  - NPLC FAST 설정값이 JS(`MIN`)과 Python(`0.1`)에서 다름.
- **고정 규칙 (변경 금지)**:
  - baudRate=9600, 8-N-1, 모든 명령 종단문자는 `\r\n`
  - onConnect는 반드시 `*RST` → `SYST:REM` → `*CLS` → 4-Wire(FRES) 설정 순서를 유지
  - pollCmd는 `':READ?\r\n'`, 500ms 간격
  - 측정 함수는 `SENS:FUNC "FRES"`(4-wire) / `"RES"`(2-wire)

---

## 3. Mitutoyo VL-50

- **시리얼 설정**: baudRate 9600, dataBits 7, parity even, stopBits 2
  - 출처: `instruments/mitutoyo_vl50.js` line 6 / `Backups/20260518_Final_Standardized/instruments/mitutoyo_vl50/controller.py` (`serial.SEVENBITS`, `PARITY_EVEN`, `STOPBITS_TWO`, baudrate=9600, `dsrdtr=True`, `rtscts=True`) / `Manuals/VL50B_Complete_Manual.md` (`bytesize=serial.SEVENBITS`, `parity=serial.PARITY_EVEN`, baudrate=9600)
- **종단문자**: `\r\n` (CRLF) — JS `onConnect`의 `'CS\r\n'`, Python `send_command`도 `f"{cmd_upper}\r\n"` → 일치
- **연결 초기화 시퀀스**: `onConnect()` → `app.serial.sendCmd('CS\r\n')` (에러 클리어) — Python `connect()`도 `self.send_command("CS")` 호출 → 일치
- **폴링 명령(pollCmd)**: `null` (JS는 폴링 없이 onLine 수신 기반). 단, Python 컨트롤러의 `_polling_loop`는 `GA01\r\n`을 0.3초 간격으로 전송하여 데이터 요청. **JS 모듈에는 `GA01` 폴링 명령 전송 로직이 없음** — `pollCmd: null`이며 JS에서 별도로 `GA01`을 보내는 코드가 보이지 않음.
- **응답 파싱 형식**:
  - JS: 정규식 `([+-]?\d+\.\d+)`로 부동소수점 추출, `toFixed(3)`, 단위 `mm`
  - Python `_process_line`: `line.startswith('G')`이고 콤마(`,`) 포함 시 `line[comma_idx+1:]`을 `float()` 파싱, `{val_float:.5f} mm`. `line.startswith('CH')`는 무시.
  - JS의 정규식 기반 파싱은 Python의 `G...,value` 형식 응답에서도 숫자를 추출할 수 있어 호환되지만, **Python 원본은 `GA01` 요청 후 응답하는 프로토콜**인 반면 JS는 `pollCmd: null`로 요청 없이 수신만 대기 — 이는 장비가 자동 스트리밍 모드일 때만 동작.
- **검증 결과**: **부분 불일치**. 시리얼 설정(7-E-2, 9600)과 종단문자(`\r\n`), `onConnect`의 `CS\r\n`은 일치. 그러나 **원본 Python 컨트롤러는 `GA01\r\n`을 주기적으로 전송(폴링)하여 데이터를 요청**하는 반면, JS 모듈은 `pollCmd: null`로 아무 명령도 보내지 않고 장비가 자동으로 데이터를 보내주기를 기다림. 장비가 Auto-stream(연속 출력) 모드가 아니면 JS에서 데이터가 수신되지 않을 수 있음.
- **고정 규칙 (변경 금지)**:
  - baudRate=9600, dataBits=7, parity=even, stopBits=2 (반드시 7-E-2, 일반적인 8-N-1 아님)
  - 모든 명령 종단문자는 `\r\n`
  - onConnect 시 반드시 `CS\r\n` 전송 (에러 클리어)
  - **(요주의)** GA01 폴링 부재는 사용자 확인 후 별도로 점검 필요 — 임의로 추가/제거 금지

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

> ⚠️ **연결 계층(physical layer) 자체가 미검증/잠재적 불일치 — 최우선 확인 필요**
> - 사용자는 4339B를 **GPIB-to-USB 어댑터**로 연결하며, 과거(Python 버전)에는 **NI-VISA가 설치되어 있어야 동작**했다고 확인함 → 사용 중인 어댑터가 **VISA형(예: Keysight 82357B, NI GPIB-USB-HS)** 일 가능성이 높음. 이런 어댑터는 **가상 COM 포트를 만들지 않고** VISA 리소스(`GPIB0::n::INSTR`)로만 노출됨.
> - 그런데 현재 JS(`agilent_4339b.js`)는 **Web Serial API(`app.serial`, COM 포트)** 로 연결하는 구조 (다른 시리얼 계측기들과 동일한 프레임워크 재사용).
> - **VISA형 어댑터라면 Web Serial API로는 장치가 보이지도, 연결되지도 않음** — NI-VISA 설치 여부와 무관하게 Electron의 Web Serial은 VISA 리소스를 다루지 못함.
> - **사용자 확인: 이 HTML 통합 프로그램에서 4339B를 한 번도 연결해본 적 없음** → 즉 이 모듈은 **실기 검증이 안 된 상태**.
> - **확인 결과 (사용자 장치관리자 확인)**: **NI GPIB-USB-HS** — "기타 장치"에 경고 아이콘(⚠️)으로 표시됨 = **드라이버 미설치 상태**. → **케이스 (B) VISA형 어댑터로 확정**.
>   - 과거 동작했던 이유: NI-VISA 설치 시 함께 설치되는 **NI-488.2 드라이버**가 이 어댑터를 인식시켜 VISA 리소스(`GPIB0::n::INSTR`)로 노출했기 때문. 지금은 그 드라이버가 빠져 "기타 장치"로 인식되지 않음.
>   - **결론**: 현재 JS(`agilent_4339b.js`)의 Web Serial(COM 포트) 방식으로는 **연결 자체가 영구적으로 불가능** — 드라이버를 재설치해도 COM 포트가 생기지 않음.
> - **필요 조치 (구조적 재설계, SCPI 명령 수정과는 별개)**:
>   1. NI-488.2 드라이버(NI-VISA 또는 NI-488.2 단독 패키지) 재설치 → 장치관리자에서 GPIB-USB-HS가 정상 인식되도록.
>   2. Electron `index.js`(메인 프로세스)에 4339B 전용 IPC 브릿지 추가: Node에서 `pyvisa`를 직접 호출할 수 없으므로, ① 기존 `instruments/agilent_4339b/controller.py`(PyVISA)를 child_process로 실행해 stdin/stdout으로 통신하거나, ② Node용 VISA 바인딩(예: `node-ffi` + `visa32.dll`/`visa64.dll`)을 사용.
>   3. `instruments/agilent_4339b.js`의 `app.serial.sendCmd(...)` 호출들을 이 새 IPC 브릿지 호출로 교체 (SCPI 명령 자체는 §아래 시퀀스 불일치 항목 정리 후 확정).
> - 이 작업은 다른 계측기(시리얼)들과 별개의 연결 아키텍처가 필요하므로, **사용자와 우선순위/일정 논의 후 별도 작업으로 진행 권장**.

- **시리얼 설정 (JS)**: baudRate 9600, dataBits 8, parity none, stopBits 1 — `instruments/agilent_4339b.js` line 430. 단, 실제로는 GPIB(`ag_gpib` input, 기본 17번)를 통한 PyVISA 연결 (`instruments/agilent_4339b/controller.py`의 `GPIB0::{addr}::INSTR`) — `serial:{...}`는 WebSerial 폴백/플레이스홀더로 보이며 GPIB 연결에는 직접 사용되지 않음
- **종단문자**: `\r\n` — JS의 모든 `sendCmd` 호출에 `\r\n` 사용. Python controller.py는 PyVISA `write()`/`query()` 사용(PyVISA가 자체 종단문자 처리, 기본 `\n`) — GPIB 계층에서는 종단문자가 PyVISA에 의해 처리되므로 직접 비교 어려움. JS의 `\r\n`은 WebSerial 경유 시 사용되는 값으로 그대로 유지.
- **연결 초기화 시퀀스**: JS 모듈에는 `onConnect` 정의 없음 (`onDisconnect`만 존재, `stopMeas()` 호출). 측정 시작 시(`_doStartCycle`) 매번:
  1. `:SENS:MODE <SURF|VOL>\r\n`
  2. (200ms) `:SOUR:VOLT <voltage>\r\n`
  3. (350ms) `:SENS:CURR:RANG:UPP <ilimCmd>\r\n`
  4. (500ms) `:INIT\r\n`
  - Python `_setup_instrument(voltage)` (controller.py): `*RST` → 2.0초 대기 → `*CLS` → `FUNC 'RES'` → `SOUR:VOLT <voltage>` → `TRIG:SOUR BUS` (각 명령 사이 0.3초 대기)
  - **불일치**: JS는 `*RST`/`*CLS`/`FUNC 'RES'`/`TRIG:SOUR BUS`를 전혀 보내지 않음. 대신 `:SENS:MODE`(SURF/VOL), `:SENS:CURR:RANG:UPP`(전류 한계)를 설정 — Python 원본에는 이 두 명령이 없음. JS와 controller.py는 측정 시퀀스 자체가 상당히 다른 구현(서로 다른 firmware 모드를 가정한 것으로 보임).
- **폴링/측정 명령**:
  - JS: `:MEAS:RES?\r\n` (측정 실행+결과 동시 요청)
  - Python: `ABOR` → 0.5초 → `*CLS` → 0.3초 → `INIT` → 0.5초 → `*TRG` → 0.5초 대기 → `FETC?` (별도 트리거+페치 분리 시퀀스)
  - **불일치**: JS는 `:MEAS:RES?` 단일 명령으로 트리거+측정값 반환을 기대하나, Python 원본은 `INIT`+`*TRG`+`FETC?`의 분리된 시퀀스를 사용. 두 구현이 서로 다른 SCPI 워크플로우를 가정.
- **종료/방전**: JS `doDischarge()` → `:OUTP OFF\r\n`. Python `_safe_off()`도 `OUTP OFF` + `*CLS` → 일치 (단, JS는 `*CLS`를 보내지 않음)
- **응답 파싱 형식**:
  - JS: `/OL|9\.9[0-9]*E\+37/i` 매치 시 OL(9.9e37)로 처리, 그 외 정규식 `([+-]?\d+\.?\d*[Ee][+-]?\d+)`로 추출 — OL_THRESHOLD=9e36
  - Python: `result_str.split(",")` → `parts[1]`(또는 `parts[0]`)을 `float()`. status code(`parts[0]`) 비0이면 `ilimit` 반환
  - JS는 OL을 9.9E+37 패턴으로 식별, Python은 status code 기반 — 응답 포맷 자체가 다름 (`:MEAS:RES?` vs `FETC?`의 응답 형식 차이로 인한 자연스러운 결과)
- **검증 결과**: **불일치 (구현 방식 자체가 다름)**. JS 모듈은 Python `controller.py`(GPIB+PyVISA, INIT/*TRG/FETC? 시퀀스)와 SCPI 명령어 집합·시퀀스가 근본적으로 다른 별도 구현으로 보임 (`:SENS:MODE`, `:SENS:CURR:RANG:UPP`, `:MEAS:RES?` 등은 Python 원본에 없음). 어느 쪽이 "정답"인지는 실제 4339B 펌웨어 응답에 따라 달라지므로, **이 모듈은 Python controller.py를 기준 원본으로 단정하기 어려움** — `Manuals/Agilent_4339B_Manual.md`와 대조한 추가 검증이 필요. 코드 수정 없이 본 차이만 기록.
- **고정 규칙 (변경 금지, 단 위 불일치 검토 후 갱신 필요)**:
  - JS 현재 구현 기준: 측정 시퀀스는 `:SENS:MODE` → `:SOUR:VOLT` → `:SENS:CURR:RANG:UPP` → `:INIT` → (충전 대기) → `:MEAS:RES?` → `:OUTP OFF`
  - 모든 명령 종단문자 `\r\n`
  - I-Limit 자동 escalation 로직(OL 시 `ILIM_STEPS` 순차 상승)은 VOL 모드에서만 적용
  - **(요주의)** Python controller.py와의 시퀀스 차이는 사용자 확인 필요 — 임의 통합 금지

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

- **시리얼 설정**: `instruments/sp2100_logger.js`의 `get serial()` 기준
  - 모델이 `SP-2100`이면 `{baudRate:57600, dataBits:8, parity:'none', stopBits:1}`
  - 모델이 `TL-2200`(기본값)이면 `{baudRate:38400, dataBits:8, parity:'none', stopBits:1}`
  - (참고) 구버전 Python `sp2100_controller.py`의 기본값(9600)은 더 이상 기준이 아님.
- **종단문자**: `\r` (CR only) — `R\r`, `S\r` 모두 CR
- **연결 초기화 시퀀스**: JS `onConnect()` — 명령 전송 없음(모델/보레이트 정보를 로그에만 출력). 프레임워크의 `pollCmd`/`pollInterval` 메커니즘으로 폴링 시작.
- **폴링 명령(pollCmd)**: `'R\r'`, pollInterval 300ms
- **응답 파싱 형식**: JS `parseLine` — 비ASCII 문자 제거 후 정규식 `[-+]?\d+(?:\.\d+)?`로 모든 숫자 추출, 5개 이상이면 `[SP, KP, VAL, AVG, RMS]` 순서로 매핑(위치 기반, "N=15, Val -0.3, SP= 2.2, Avg=0.6, KP=1.7, RMS = 0.3" 형태의 TL-2200 출력 가정). 5개 미만이면 무시.
- **검증 결과**: **JS 구현을 신규 기준으로 확정**. Python 컨트롤러(`instruments/mass_sp2100/sp2100_controller.py`)와의 보레이트/연결시퀀스/파싱방식 차이는 더 이상 "버그"가 아니라 의도된 신규 설계임. Python 컨트롤러는 참고용으로만 보존.
- **고정 규칙 (변경 금지)**:
  - 종단문자는 `\r` (CR only)
  - JS `pollCmd`는 `'R\r'`, interval 300ms
  - 파싱은 위치 기반 5-필드(`SP,KP,VAL,AVG,RMS` 순서, 5개 미만이면 무시)
  - 모델별 보레이트: SP-2100=57600bps, TL-2200(기본)=38400bps, 8-N-1
  - 단일 체크된 행이 있을 때 새 측정값으로 덮어쓰기(overwrite) 규칙 유지
  - onConnect에서 명시적 명령 전송 없음 (S\r 등 Python식 스트림 유도 로직을 추가하지 말 것)

---

## 종합 요약 (불일치/원본 미발견 목록)

| 계측기 | 상태 | 핵심 이슈 |
|---|---|---|
| Hioki 3540 | 일치 | onConnect의 AUTO/SMP 동기화 누락(경미) |
| Keithley 2700 | 대체로 일치 | RANG:AUTO ON 누락, NPLC FAST 값 표기차(MIN vs 0.1) |
| Mitutoyo VL-50 | 부분 불일치 | GA01 폴링 명령이 JS에 없음(pollCmd:null) |
| DAQ-6510 | 불일치 | controller.py `ROUT:SCAN`(legacy) vs JS `ROUT:SCAN:LIST`; JS `daq_delay` 미사용; RANG:AUTO ON 누락 |
| Agilent 4339B | ❌ 연결 불가 (구조적) | NI GPIB-USB-HS(VISA형) 확인됨. 현재 Web Serial 구조로는 연결 자체 불가능 → IPC 브릿지(PyVISA child_process 또는 visa32.dll 바인딩) 신규 구축 필요. SCPI 시퀀스도 별개로 불일치 |
| PT-2000 | 원본 없음 | WebHID 신규 구현, 비교 대상 없음 |
| LT-1000 | 원본 없음(내부 일치) | git history 없음, lt1000/index.js와 통합모듈은 상호 일치 |
| SP-2100/TL-2200 | JS 신규 기준 확정 | 신규 HTML/JS 구현이 기준, Python 컨트롤러는 구버전 참고용 |
