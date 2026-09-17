# 3M Instrument Logger — 인수인계 문서 (AGENTS.md)

> 이 문서는 다른 환경/계정에서 이 폴더만 열어도 작업을 이어갈 수 있도록
> 지금까지의 작업 내용·아키텍처·규칙·미해결 과제를 정리한 것입니다.

## 1. 프로젝트 개요

- **무엇**: 여러 계측기(저항계, 거리계, 박리/인장 시험기, 오븐 등)를 브라우저에서
  Web Serial API로 직접 연결해 측정값을 표시·기록·CSV 내보내기 하는 통합 웹 앱.
- **실행 방법**: ES Module을 쓰므로 `file://`로 열면 CORS로 빈 페이지가 됨.
  반드시 로컬 서버로 열어야 함.
  ```
  cd "3M Instrument Logger"
  python -m http.server 8000
  # 브라우저(Chrome/Edge, Web Serial 지원)에서 http://localhost:8000/index.html
  ```
- **핵심 파일**
  - `index.html` — 앱 HTML 셸
  - `index.js` — 계측기 import + INSTRUMENTS 레지스트리 + 부트 (~40줄, 진입점)
  - `core.js` — 공통 엔진 (T 번역, StateMachine, SerialController, EditableGrid, BoxPlot, App 클래스 등) — `export { App, _dateStr }`
  - `index.css` — 스타일
  - `instruments/*.js` — 계측기별 모듈 (아래 "계측기 모듈 구조" 참고)
  - `instruments/_utils.js` — 공통 헬퍼 (`fmt`, `buildToggleRow`, `syslogPanelHTML`, `dateStr` 등)
  - `standalone.html` — standalone/EXE 배포용 HTML 셸 (`standalone_entry.js` 로드)
  - `build/build_standalone.py` — 특정 계측기만 추출해 `dist/<이름>/` 폴더 생성
  - `build/package_exe.py` — pywebview + PyInstaller로 EXE 패키징
  - `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md` — 계측기별 통신 프로토콜 검증 문서 (SSOT)
  - `docs/SP2100_PROTOCOL_REFERENCE.md` — SP-2100/TL-2200 파싱 규칙 SSOT
  - `docs/manuals/` — 계측기별 사용자 매뉴얼 (MD, 2026-07-04 신규 — PST-3202는 초보자용 상세판)
  - `instruments/*/`, `instruments/*.py` — 구버전 PyInstaller(Electron 이전) 데스크톱
    구현체. **참고용일 뿐, 현재 통합 작업의 기준이 아님** (단, SP-2100은 예외 — 아래 참고)

## 2. 계측기 모듈 구조 (instruments/*.js)

각 모듈은 `export default { ... }` 로 다음을 정의:
- `serial`: `{ baudRate, dataBits, parity, stopBits }` (getter로 동적 설정 가능)
- `pollCmd` / `pollInterval`: 주기적으로 보낼 명령 (능동형 장비)
- `parseValue(line)` 또는 `onLine(line)`: 수신 라인 파싱
- `onConnect()` / `onDisconnect()`: 연결 시 초기화 명령 시퀀스
- `onByte(b)` (선택): 원시 바이트 단위 콜백 — SP-2100 파형 캡처용으로 새로 추가됨
- `buildSidebar/buildCenter/buildRightPanel`: `viewType: 'custom'`인 경우 직접 UI 구성
- `buildSettings(area)`: `viewType: 'grid'`인 경우 사이드바 추가 설정

`core.js`의 `SerialController`가 시리얼 입출력을 담당하고, `App`이 현재 활성
계측기 모듈의 `onLine`/`onByte`/`onConnect` 등을 호출.

### 2-1. App 클래스 구조 변경 (core.js 분리)
- `App(instruments = {})` — 생성자가 INSTRUMENTS 레지스트리를 파라미터로 받음.
  내부에서 `this._instruments`로 저장하며, 전역 변수 `INSTRUMENTS`를 더 이상 참조하지 않음.
- `index.js`가 `import { App } from './core.js'`로 App을 가져와 `new App(INSTRUMENTS)` 실행.
- `standalone_entry.js`(빌드 스크립트가 자동 생성)도 같은 방식으로 선택된 계측기만 등록.

### 2-2. SerialController 변경 (SP-2100 파형 캡처)
기존에는 `TextDecoderStream`으로 바로 텍스트 라인만 추출했으나, SP-2100 파형
캡처를 위해 **원시 바이트도 함께 전달**하도록 변경:
```js
// core.js SerialController
this.onByte = null;            // 신규: 매 수신 바이트마다 호출
// _loop()에서 port.readable을 직접 getReader()로 읽고
// - this.onByte?.(b) 를 바이트마다 호출
// - TextDecoder로 누적 디코딩 후 \r\n 단위로 onLine 호출 (기존 동작 유지)
```
`App` 생성자에서 `this.serial.onByte = b => this.instr?.onByte?.(b)` 로 연결됨.
**다른 계측기 모듈은 `onByte`를 구현하지 않으면 영향 없음** (옵셔널).

## 3. 계측기별 현황 (자세한 내용은 docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md)

| 계측기 | 파일 | 상태 | 비고 |
|---|---|---|---|
| Hioki 3540 | hioki_3540.js | ✅ | 기본 그리드 뷰 |
| Keithley 2700 | keithley_2700.js | ✅ 동작 확인 | 9.90e+37(오버레인지) → "Over Flow" 표시, `valid:false`로 자동기록 상태머신 정상 동작하도록 수정함 |
| Keithley 2400 | keithley_2400.js | ✅ RS-232 및 GPIB 저에너지 검증 완료 | Web Serial RS-232 및 VISA ASRL/GPIB. ASRL 응답 종단 LF/CR 안전 자동 검출, GPIB 안전 첫 명령, 단일·시간·Sweep, 표·그래프, 정상 OFF, 오류 큐, 연결 해제·리소스 재검색 확인. 장비 기술 한계는 210 V이나 +10 V OVP 여유 확보를 위해 앱의 전압 인가/Voltage Compliance는 ±200 V로 제한. 참고 계산 카드는 초보자용 저항 문장과 `0~21 V/21 V 초과~200 V` 2구간 최대 전류 표·현재 구간 강조·22 W 실제 허용값을 표시. Source V는 `|설정|+10 V` 이상인 다음 장비 지원 OVP 단계만 자동 적용·표시하고, 상태 bit 4에서 OUTPUT OFF. 30 V 이상 설정은 최대 예상 전압·Compliance/자동 OVP 및 절연·인터락·OUTPUT OFF/방전 주의사항을 설정 단계부터 표시. XLSX는 저장 시점 UI 언어에 따라 한국어 `대시보드`/영문 `Dashboard`와 해당 언어의 표·Raw Data 헤더를 생성. GPIB 실제 Compliance와 낮은 저항 더미 부하/전면 표시 비교 필요 |
| Mitutoyo VL-50 | mitutoyo_vl50.js | ✅ 동작 확인 | `pollCmd: 'GA01\r\n', pollInterval: 300` 필수 (없으면 응답 없음). 표시 소수점 5자리(`toFixed(5)`) |
| SP-2100 / TL-2200 | sp2100_logger.js | ✅ SSOT 기준 | 아래 4번 항목 참고 — 가장 많이 작업됨 |
| Agilent 4339B | agilent_4339b.js | 🔧 실기 테스트 필요 | SCPI 시퀀스 Python 단독 프로그램 기준으로 전면 재작성(-213 수정). 샘플명 인라인 편집, 그룹별 수염차트(Box & Whisker) 구현 완료. 실기 검증 필요. GPIB-USB-HS는 PyVISA IPC 브리지 필요(별도 과제) |
| DAQ-6510 | daq_6510.js | 🔧 실기 테스트 필요 | 수동 릴레이 제어(ROUT:OPEN:ALL→ROUT:CLOS→READ?), Front/Rear 토글, 3-컬럼 디스플레이, 동적 X축 그래프 구현 완료. ROUT:SCAN:CRE 폐기(2859 오류). 실기 테스트 필요 |
| PT-2000 Probe Tack | pt2000_probe_tack.js | 🔧 작업 중 | |
| LT-1000 Loop Tack | lt1000_loop_tack.js | 🔧 작업 중 | |
| Photo Editor | photo_editor.js | ✅ 신규 웹 포팅 | 비-시리얼 Tool. AI Photo Editor 잔여 표기 일원화 완료. 아래 4-1 항목 참고 |
| PST-3202 | pst3202.js | 🔧 실기 테스트 필요 | GW Instek 3채널 DC 전원공급기. 아래 4-2 항목 참고 |
| Epson PRIFIA OK900P | epson_ok900p.js | ✅ 실기 검증 완료 | 360 DPI 1-bit 라벨 프린터. Windows Spooler API 연동, 가로(Landscape) 및 24mm 테이프 물리 여백 대칭 센터 정렬, 1D/2D 바코드, 엑셀 배치 인쇄 지원. 아래 4-3 항목 참고 |
| Etching Design | etching_design.js | ✅ 완성 및 검증 완료 | 정밀 에칭 패턴 CAD & 레이아웃 도구 (0.01mm 정밀도). TYPE 1/2/3 프리셋, 방향성 및 중앙 시편 개별 방향 오버라이드, 혼합 배치 최적화, DWG/DXF 내보내기 UI, 실행 취소/다시 실행, 가로/세로 맞춤, 동적 타입/여백/모서리 관리, 실물 컷팅 슬릿 및 0.5mm 마이크로 조인트 브릿지 연동. SVG/PDF 생성 모듈은 있으나 현재 사용자 툴바에 미연결. 단위 테스트 통과 |
| App Updater | updater.js, updater_backend.py | ✅ 구축 및 실기 검증 완료 | GitHub Private 저장소(`gochujangs13/Instrument-Logger`) 기반 무중단 자동 업데이트. 0~100% 게이지, 100% 완료 카드, 3초 카운트다운 자동 재시작 및 `taskkill` 기반 Windows 프로세스 파일 잠금 해제 자가 교체 엔진 완비 |

### 2026-09-18 GitHub 공식 릴리즈 배포 완료 (v1.0.0-rc.6.4 — 6.3 버전 업데이트 테스트 타깃용)

- **배경 및 조치 내역**:
  - 사용자 환경(v1.0.0-rc.6.3)에서 독립 팝업 자동 업데이트 워크플로우 실기 검증을 위한 신규 타깃 릴리즈 배포.
  - 최신 EXE `dist/3M_Instrument_Logger.exe` (143.38MB, 150,339,739 바이트, SHA256 `1CEEDBD1A516EFA35861F2F9F33B8454278AF43B3F86F731C0FEEBB451358F3B`) 빌드 완료.
  - GitHub Private Release `v1.0.0-rc.6.4` 공식 생성 및 에셋 업로드 완료 (Release ID: `391097946`, Asset ID: `571277446`).
  - 6.3 버전에서 실행 시 `v1.0.0-rc.6.4` 업데이트 감지 및 독립 팝업 다운로드 ➔ 교체 ➔ 자동 재실행 테스트 가능.

### 2026-09-18 GitHub 공식 릴리즈 배포 완료 (v1.0.0-rc.6.3 — 실기 자동 업데이트 테스트용)

- **배경 및 조치 내역**:
  - 독립 팝업창(PowerShell WPF) 기반 자동 업데이트 실기 검증을 위한 신규 릴리즈 배포.
  - 최신 EXE `dist/3M_Instrument_Logger.exe` (143.38MB, 150,339,992 바이트, SHA256 `7D0424B2EFBB7BB58F83622FADE033F152D9862FE39EBD5E9B696DBFD6907FAA`) 빌드 완료.
  - GitHub Private Release `v1.0.0-rc.6.3` 공식 생성 및 에셋 업로드 완료 (Release ID: `391095361`, Asset ID: `571267416`).
  - v1.0.0-rc.6.2 또는 이전 버전에서 실행 시 `v1.0.0-rc.6.3` 업데이트 감지 및 독립 팝업 자동 교체·재실행 검증 가능.

### 2026-09-18 Club Expense 영구 제거 및 GitHub 공식 릴리즈 배포 완료 (v1.0.0-rc.6.2)

- **배경 및 조치 내역**:
  - 과거 `index.js`에서만 제거되고 `build/build_standalone.py`, `core.js`, `instruments/club_expense.js`, `assets/club_expense.png`에 남아있던 잔여 요소를 완전 영구 삭제.
  - `dist/*ClubExpense*` 폴더 정리 및 정규 13종(계측기 10종 + 소프트웨어 3종: Photo Editor, Epson PRIFIA OK900P, Etching Design) 런처 구성 확립.
  - 최신 EXE `dist/3M_Instrument_Logger.exe` (143.37MB, 150,339,187 바이트, SHA256 `45535FAE5D170ACE432877381089D4A8DD24569F1EB025B421713B4899FCAA22`) 빌드 완료.
  - GitHub Private Release `v1.0.0-rc.6.2` 공식 생성 및 에셋 업로드 완료 (Release ID: `391075651`, Asset ID: `571191450`).

### 2026-09-18 독립 팝업창(Standalone Updater) 기반 무중단 자가 교체·자동 재실행 시스템 구축 (v1.0.0-rc.6.1+)

- **배경 및 사용자 요구사항**:
  - 기존 방식은 3M 통합 프로그램이 켜져 있는 상태에서 내부적으로 재시작을 시도하다 보니, 프로그램 종료 후 새 프로그램이 켜지지 않거나 백그라운드 프로세스 잔여로 인해 Windows 파일 잠금(`Access Denied`)이 발생하는 문제가 있었음.
  - 사용자의 제안: *"업데이트 진행할 때 프로그램과는 별도의 팝업창이 단독으로 실행되고 3M 통합 프로그램은 종료되며, 다운로드 및 기존 파일 교체, 자동 재실행 후 '완료되었습니다' 표시 및 업데이트 팝업은 종료"*되는 완전 독립형 업데이트 아키텍처로 전면 개편.

- **핵심 아키텍처 및 동작 프로세스**:
  1. **독립 팝업창(PowerShell WPF) 단독 실행**:
     - 사용자가 '지금 업데이트' 클릭 시, 백엔드(`updater_backend.py`)가 `%TEMP%\3M_Updater.ps1`을 생성하고 Windows 기본 내장 컴포넌트(PowerShell 5.1 + WPF)를 독립 프로세스(`DETACHED_PROCESS`)로 즉시 기동.
     - 파이썬 런타임이 설치되지 않은 고객사/현장 PC에서도 100% 무설치 네이티브 구동 보장.
     - 3M 다크 테마 디자인(`0f172a`, `#1e293b`, 3M 레드 로고 배지, Segoe UI) 일치.
  2. **3M 메인 프로그램 즉시 안전 종료**:
     - 독립 팝업창이 뜨는 즉시 메인 프로그램이 `os._exit(0)`로 완전히 닫힘.
     - `3M_Instrument_Logger.exe`의 Windows 프로세스 파일 잠금이 100% 즉각 해제됨.
  3. **독립 팝업창 내 5단계 자동 워크플로우**:
     - **1단계 (프로세스 확인)**: 메인 프로그램 PID 완전 종료 감지 (필요 시 `Stop-Process -Force`).
     - **2단계 (다운로드)**: GitHub Private S3 릴리즈 직접 스트리밍 다운로드 (0% ~ 100% 실시간 게이지, 속도 `MB/s`, 잔여 용량 표시).
     - **3단계 (파일 교체)**: 최신 패키지를 타깃 `3M_Instrument_Logger.exe`로 안전 교체 (`Copy-Item -Force` 재시도 루프).
     - **4단계 (자동 재실행)**: 원래 작업 폴더 컨텍스트에서 최신 버전 `3M_Instrument_Logger.exe`를 `Start-Process`로 기동.
     - **5단계 (완료 및 자동 종료)**:
       - 에메랄드 그린 완료 카드: `🎉 최신 버전(v1.0.0-rc.6.1) 업데이트가 완료되었습니다!`
       - 실시간 3초 카운트다운 타이머 (`확인 및 닫기 (3s)` ➔ `(2s)` ➔ `(1s)`).
       - 사용자가 버튼을 클릭하거나 3초 경과 시 업데이트 팝업창이 스스로 닫히며 최신 프로그램으로 매끄럽게 전환.

- **수정 및 연동 파일**:
  - `updater_backend.py`: `get_standalone_updater_ps1_content()`, `launch_standalone_updater()` 구현 및 `apply_update_and_restart()` 위임.
  - `scripts/updater_gui.ps1`: 독립 실행용 PowerShell WPF 스크립트 (UTF-8 BOM 보장).
  - `updater.js`: `startDownloadFlow()`를 독립 팝업창 연동 모드로 전환.
  - `server.py` & `build/package_exe.py`: `/api/update/apply` body 파싱 및 위임.
  - `dist/3M_Instrument_Logger.exe`: 최신 통합 빌드 완료 (150.8 MB).
  - GitHub Release `v1.0.0-rc.6.1`: 신규 바이너리 업로드 완료 (Asset ID: 571160419).

- **검증**:
  - `verify_project.py` 전체 저장소 검증 100% PASS (JS 33개, 계측기 15개, Python 26개, HTTP 19개).
  - 실제 GitHub S3 스트리밍 다운로드 및 파일 교체/재실행/3초 자동 닫힘 실기 테스트 통과.

### 2026-09-17 GitHub Private 자동 업데이트 시스템 구축, 100% 완료 팝업 및 자동 재시작 프로세스 구현 완료 (v1.0.0-rc.6.1)

- **배경 및 개요**:
  - 클라우드 저장소(GitHub Private Repository: `gochujangs13/Instrument-Logger`)와 연동하여, 프로그램 실행 시 백그라운드에서 신규 버전을 자동 감지하고 원클릭으로 0~100% 게이지 다운로드 후 안전하게 자가 교체·재실행하는 시스템 전면 구축.
  - 최신 릴리즈 태그: `v1.0.0-rc.6.1` (에셋: `3M_Instrument_Logger.exe`, 150.8MB, 150,828,569 바이트).
  - 상세 릴리즈 문서: `docs/RELEASE_STATUS_20260917.md` 참조.

- **100% 완료 팝업창 및 자동 재시작 UI/UX (`updater.js`)**:
  - 실제 다운로드 진행률이 100%까지 끊김 없이 차오르도록 구현.
  - 100% 도달 시 에메랄드 그린 빛나는 100% 바(`updater-progress-done`) 및 축하 헤더 `🎉 v1.0.0-rc.6.1 업데이트 준비 완료`.
  - 상단 안내 카드 (`updater-completion-card`):
    > `🎉 새 버전 업데이트가 100% 준비되었습니다!`  
    > `🔄 3초 후 프로그램을 안전하게 종료하고 최신 버전으로 자동 재시작합니다... (3)`
  - 실시간 3초 카운트다운 타이머 (3초 ➔ 2초 ➔ 1초 ➔ 재시작 실행) 및 즉시 재시작 버튼 `[🚀 지금 바로 재시작 (3s)]` 제공.
  - 카운트다운 완료 또는 버튼 클릭 시: `🚀 프로그램을 안전하게 종료하고 최신 버전으로 교체 재실행 중입니다...` 로 상태 전환 후 백엔드 자가 교체 스크립트 가동.

- **Windows 프로세스 잠금 완벽 해제 및 자가 교체 엔진 (`updater_backend.py`)**:
  - PyInstaller `--onefile` 구동 시 부트로더 부모 프로세스와 파이썬 자식 프로세스 2개가 동시 실행되는데, 기존 스크립트가 단일 PID만 체크하여 Windows 파일 잠금(`WinError 32: Access Denied`)이 발생하던 문제를 해결.
  - 자가 교체 배치 스크립트(`3M_Instrument_Logger_updater.bat`)에서 `taskkill /f /im "!EXE_NAME!"`으로 관련 프로세스를 확실히 종료 후 `copy /y`를 수행.
  - 재실행 시 `start "" /D "!TARGET_DIR!" "!TARGET!"`를 호출하여 EXE가 위치한 본래 폴더 컨텍스트에서 새 버전이 완벽하게 실행되도록 보장.

- **인증 및 통신 안정화 (`updater_backend.py`)**:
  - GitHub Private Asset 스트리밍 다운로드 시 S3 리다이렉트 인증 헤더 분리 (`_S3SafeRedirectHandler`로 400 Bad Request 방지).
  - 사내 프록시/보안망 환경의 SSL 인증서 통신 에러를 방지하기 위해 `ssl._create_unverified_context()` Fallback 탑재.
  - Windows Credential Manager(`git:https://github.com`) 토큰 자동 탐색 탑재 (`advapi32.CredReadW`).
  - 다중 뎁스 버전 비교기(`is_newer_version('1.0.0-rc.6.1', '1.0.0-rc.6') == True`) 구현.

- **업데이트 범위 및 신규 카드 확장 가이드 (인수인계 규약)**:
  - **업데이트 가능한 범위 (100% 완전 지원)**:
    1. 모든 웹 리소스 (`index.html`, `index.css`, `core.js`, `instruments/*.js`, `assets/` 등).
    2. 파이썬 서버 로직 (`server.py`, `updater_backend.py`, 신규 API 라우트 등).
    3. **신규 계측기/도구 카드 추가**: `instruments/신규장비.js` 작성 후 `index.js` 및 `build_standalone.py`에 등록하고 버전을 올려 배포하면, 기존 설치된 EXE가 새 버전을 다운받아 신규 카드가 포함된 프로그램으로 100% 완전 업데이트됨.
  - **주의 사항 (업데이트 시 유의점)**:
    1. C-레벨 네이티브 바이너리나 신규 Python 라이브러리가 추가되는 경우에도 PyInstaller가 단일 통 EXE(`3M_Instrument_Logger.exe`) 전체를 교체하므로 완전히 반영됨.
    2. 단, GitHub Release의 에셋 파일명은 항상 `3M_Instrument_Logger.exe`로 유지되어야 함.

- **명칭 일원화 (`Photo Editor`)**:
  - `AI Photo Editor` / `AIPhotoEditor` 잔여 표기를 `Photo Editor` / `PhotoEditor`로 완전 통일 (`index.js`, `build_standalone.py`, `make_report_ppt.py`).

- **검증 및 산출물**:
  - `verify_project.py` 전체 저장소 무결성 검증 100% PASS (JS 33개, 계측기 15개, Python 24개, HTTP 19개).
  - 브라우저 실기 검증 완료: `updater_completion_100_percent_1789628387900.png`.
  - 배포 릴리즈: GitHub `gochujangs13/Instrument-Logger` Release `v1.0.0-rc.6.1` (Asset ID: 569677471).
  - 테스트용 베이스 EXE: `dist/3M_Instrument_Logger.exe` (v1.0.0-rc.6) 빌드 완료.

### 2026-09-14 Etching Design 자동 배치 의미 명확화 및 선택 시편 브릿지 가공 미리보기

- `수량 고정`/`자동 계산` 명칭을 `열·행 직접 입력`/`원판 맞춤 자동 배치`로 변경했다. 자동 배치는 원판·여백·시편·가로/세로 간격으로 열과 행을 다시 계산하며, 비활성 열/행 입력칸에도 실제 계산값을 즉시 표시한다.
- 현장 용어를 정정했다. 15×6mm 등 시편 본체를 `브릿지`, 원판과 브릿지를 연결하는 좌·우 금속부를 `지지대`로 표시한다. `브릿지 정중앙` 가공은 좌·우 지지대가 아니라 시편 본체 중심에 홀/홈 1개를 생성한다. 15×6mm 브릿지의 중심은 본체 로컬 좌표 `(7.5mm, 3mm)`다.
- 위치 목록에서 `브릿지-지지대 연결부`와 `원판-지지대 연결부`를 제거하고 `브릿지 4포인트(네 모서리)`를 추가했다. 4포인트는 본체 가장자리에서 기본 1mm 안쪽에 홀 4개 또는 사각형 4개를 생성하며, 형상이 큰 경우 외곽선을 넘지 않도록 자동 안전 보정한다.
- 이후 `브릿지 2포인트(좌·우 대칭)`도 추가했다. 입력 기준은 가장자리 여백이 아니라 형상 중심 간 거리다. 2포인트는 `pointDistanceX`로 좌 홀/사각형 중심부터 우측 중심까지 거리를 지정한다. 4포인트는 `pointDistanceX`와 `pointDistanceY`로 좌↔우 및 상↔하 중심 간 거리를 독립 지정한다. 전체 형상은 브릿지 중심을 기준으로 대칭 배치하며 UI, 캔버스, DXF/DWG가 같은 좌표 함수를 사용한다.
- 2026-09-14 현장 TrueView 확인에서 번들 `acad-ts`가 직접 쓴 `AC1021` DWG가 `Drawing file is not valid`로 거부됐다. 헤더/자체 파서 테스트는 Autodesk 호환 검증으로 사용하지 않는다.
- DWG 버튼은 검증된 DXF를 `/api/cad/convert-dwg`로 보내 설치된 ODA File Converter의 `ACAD2007 / DWG / Audit` 변환 결과만 저장한다. ODA가 없거나 결과 헤더가 `AC1021`이 아니면 저장을 차단한다. ODA 실행 파일은 라이선스 때문에 EXE에 포함하지 않는다.
- TYPE 1/2/3/CUSTOM의 브릿지 위·아래 에칭 거리(`gaps.verticalGap`, `connectorWidth`) 기본값을 모두 1mm로 통일하고 단일·혼합 UI에서 0.1mm 단위로 수정 가능하게 했다.
- 원판 가로·세로 치수는 `3m_etching_plate_dimensions_v1` localStorage 키로 저장한다. 단일/혼합 모드와 프리셋 변경 시 같은 치수를 유지하고, 브라우저 재실행 또는 `.etching` 프로젝트 로드 후에도 복원한다.
- **작업 상태:** Etching 형상과 DXF는 완료. Autodesk 호환 DWG는 ODA File Converter 설치 후 TrueView/Inventor 현장 검증이 필요하다. 최신 빌드 정보는 `docs/RELEASE_STATUS_20260914.md`를 기준으로 한다.
- 브릿지 홀/홈 설정을 편집용 Draft와 제조 적용값(`appliedFeature`)으로 분리했다. Draft는 캔버스에서 클릭한 시편 하나에만 미리 보이고, `해당 타입 전체 적용` 확인 후 같은 타입의 전체 시편과 DXF/DWG 제조 형상에 반영된다.
- 기존 `.etching` 프로젝트에 `appliedFeature`가 없으면 과거 `feature`를 제조 적용값으로 자동 이관해 기존 홀/홈 형상을 보존한다.
- `tests/test_etching_auto_layout_and_feature_preview.mjs`를 추가하고 브릿지/CAD/고정수량 회귀 테스트를 갱신했다. EXE는 이번 작업에서 빌드하지 않았다.

### 2026-09-14 Etching Design 모드 토글(단일/혼합) 버튼 반영 및 캔버스 스코프 무결성·평가용 브릿지 관통 홀 구현 완료

- **단일 디자인 / 혼합 배치 모드 토글 버튼 즉시 반영 및 스코프 안정화 (`EtchingDesignModule`)**:
  - `renderCanvas()` 내부의 `geom`, `isLight`, `pw`, `ph`, `ox`, `oy`, `toScreenX`, `toScreenY` 변수를 `try ... finally` 블록 외부(함수 스코프)로 선언하여, 툴팁 및 마우스 인터랙션 시 발생하던 `ReferenceError: geom is not defined` 에러 원천 제거.
  - 캔버스 렌더링 내 시편 상·하부 관통 슬릿 높이 변수 `topSlitH`, `botSlitH` 완전 복구 및 2D 캔버스 컨텍스트 상태 보호를 위한 `try { ... } finally { _ctx.restore(); }` 구조 도입으로 누적 스케일/변환 오염에 따른 계단형('ㄱ'자) 잘림 잔상 현상 완전 해결.
  - 모듈 export 객체를 명시적 상수 `const EtchingDesignModule = { ... }`로 구조화하고, 모드 토글 버튼 이벤트 리스너(`#etchModeSingle`, `#etchModeMixed`)에서 `EtchingDesignModule.buildSidebar(el)`를 직접 호출하도록 확립하여 자바스크립트 `this` 컨텍스트 유실로 인한 버튼 미반영 문제 완전 해결.
  - 모드 토글 버튼 인라인 스타일에서 비활성 버튼의 텍스트 색상을 `color:var(--text-dim)`으로 명시하고 활성 버튼은 선명한 파란색(`background:var(--accent,#3b82f6);color:#fff;font-weight:700;`)으로 시각적 피드백 보장.
- **평가용 브릿지 관통 홀 및 컬럼 러너 금속 여백 유지**:
  - 시편 본체에 연결되는 0.8mm 평가용 고정 탭(Holding Tab) 상에 관통 홀/직사각형 홈/상·하 대칭 노치가 정확히 위치하도록 좌표 계산 확립 (`cad_builder.js`, `etching_design.js`).
  - 컬럼 간 3mm 간격 중 브릿지가 전체 간격을 먹지 않고 0.8mm만 연결되도록 클램핑(`effBridgeL`)하여 중앙의 세로 러너 금속 프레임이 손실 없이 유지되도록 연동.
- **단위 테스트 및 실기 검증**:
  - `tests/test_etching_bridge_features.mjs`: 5/5 종합 테스트 100% 통과.
  - `scripts/verify_manufacturing_export.mjs`: 11/11 종합 제조 DXF/DWG 검증 100% 통과.
  - `tests/test_etching_geometry.mjs`: 20/20 기본 단위 테스트 100% 통과.
  - 브라우저 실기 검증 완료 (`etching_mixed_mode_active_1789340042790.png`, `etching_single_mode_active_1789340052284.png`): '단일 디자인' 및 '혼합 배치' 버튼 상호 전환 시 파란색 활성화 배지 즉시 반영 및 사이드바/캔버스/결과 패널 완전 동기화 확인.

### 2026-09-14 Etching Design 브릿지(고정 탭) 치수·위치별 홀(Hole) 및 직사각형 홈(Slot/Notch) 가공 및 타입별 일괄 적용 구현

- **브릿지(Holding Tab / Micro-joint) 가공 형태 다양화**:
  - 기존의 단순 솔리드 금속 브릿지 구조에서 탈피하여, 시편 파단 및 정밀 분리를 위해 브릿지 상에 사용자가 원하는 치수와 위치로 **원형 관통 홀(Hole)** 또는 **직사각형 홈(Slot/Notch)**을 가공할 수 있도록 엔진 및 UI 전면 구현.
  - 가공 형태: `[없음 (솔리드)]`, `[원형 관통 홀 (Hole)]`, `[직사각형 홈 (Slot/Notch)]`.
- **정밀 치수 및 다축 위치 제어**:
  - 원형 홀: 직경 $\varnothing$ (mm) 직접 입력 (0.05 ~ 2.0 mm).
  - 직사각형 홈: 가로 폭 $W$ (0.05 ~ 3.0 mm) 및 세로 높이 $H$ (0.05 ~ 2.0 mm) 독립 입력.
  - 가로 (X) 위치: `[브릿지 중앙]`, `[시편 연결부]`, `[러너 연결부]`, `[직접 입력 (mm)]` (시편 기준 오프셋 거리).
  - 세로 (Y) 위치: `[브릿지 중앙 관통]`, `[상단 노치]`, `[하단 노치]`, `[상·하 대칭 노치]`. 특히 `상·하 대칭 노치(Dual Notch)`는 에칭 후 절곡 시 미세 넥(Neck)만 남아 손쉽게 시편을 떼어낼 수 있는 실무 최적화 형상.
- **타입별 독립 설정 및 100% 일괄 적용**:
  - 혼합 배치 모드의 각 시편 타입 카드(TYPE 1, TYPE 2, TYPE 3...) 내부에 독립된 `고정 탭 / 브릿지 가공` 패널 배치.
  - 특정 시편 타입(예: TYPE 1)에서 설정하면 해당 타입에 속한 모든 시편(수십~수백 개)의 좌/우 브릿지에 100% 자동 일괄 적용.
  - `[⚡ 모든 타입 동일 적용]` 편의 버튼을 제공하여 한 타입의 브릿지 가공 스펙을 전체 시편 타입으로 즉시 복사 가능.
  - 단일 디자인 모드(Single Mode)의 고정 탭 섹션에도 동일한 브릿지 가공 패널 연동.
- **실물 2D 캔버스 백라이트 및 AutoCAD DXF/DWG 완벽 연동**:
  - 캔버스 렌더링(`renderCanvas`): 브릿지 금속 위에 순백색 백라이트 관통 슬릿(`slitFill` `#ffffff`)으로 홀/노치를 그리고 외곽 스트로크를 주어 실시간 시각적 검증 제공.
  - CAD 모델(`cad_builder.js`):
    - 원형 홀: AutoCAD 표준 `0\nCIRCLE` 엔티티를 `ETCH_REMOVE` 레이어로 생성.
    - 직사각형 홈: 4점 닫힌 폴리라인 `0\nLWPOLYLINE (70=1)`을 `ETCH_REMOVE` 레이어로 생성.
    - AutoCAD 및 Laser/Etching CAM 가공 시 결함 없는 완벽한 폐곡선(Closed Contour) 출력 보장.
- **단위 테스트 및 실기 검증**:
  - `tests/test_etching_bridge_features.mjs` 신규 작성 (5개 종합 테스트 100% PASS):
    1. 원형 홀 가공 위치(중앙, 시편, 러너, 커스텀) 기하학 수학 검증
    2. 직사각형 홈 및 상·하 대칭 노치 기하학 수학 검증
    3. 혼합 배치 타입별 일괄 적용 및 타 타입 격리 검증 (TYPE 1만 80개 서클 생성, TYPE 2 0개 유지)
    4. `state.applyTabFeatureToAllTypes` 전체 타입 동기화 검증
    5. CAD 지오메트리 0 오류 검증, DXF/DWG 정상 출력 검증
  - 기존 20개 기본 단위 테스트, 26개 제조 테스트, 6개 브릿지/제거 테스트, `verify_project.py` 전체 저장소 검증 100% PASS.
  - 브라우저 실기 검증 완료 (`etching_symmetric_notch_done_1789336017704.png` 확인): TYPE 1 원형 관통 홀 및 TYPE 2 상·하 대칭 노치 실시간 렌더링 및 사이드바 설정 확인.

### 2026-09-14 Etching Design 혼합 배치 모서리 개별 설정 전용화 및 수량(열/행) 매치 기반 배분 비율 자동 계산 구현

- **모서리 일괄 설정 제거 및 타입별 개별 설정 전용화**:
  - 실무상 의미가 없고 혼선을 주던 혼합 배치 사이드바의 "모서리 일괄 설정 (전체 타입 적용)" 패널을 영구 제거.
  - 각 시편 타입 카드(TYPE 1, TYPE 2, TYPE 3...) 내부에 위치한 독립된 모서리 형태 드롭다운(`직각`, `라운드`, `모따기`)과 반경/크기(mm) 입력란을 통해서만 각 타입별로 정밀하게 개별 설정하도록 확립.
- **배분 비율(%) 기입 폐지 및 수량(열/행) 매치 기반 배분 비율 자동 계산**:
  - 좌측 시편 타입 카드 헤더 바로 밑에 남아있던 배분 비율 슬라이더(`range`) 및 `%` 직접 입력란을 영구 삭제하여, 시편 카드에서는 수량(열/행)과 규격 및 브릿지 가공만 직관적으로 입력하도록 정돈.
  - 실제 시편 생산 수량에 기반한 `자동 계산 배분 비율 XX.X%`는 우측 '타입별 세부 분석' 패널 카드에서만 단독 표시되도록 일치화 완료.
  - 사용자가 퍼센트(%)를 임의로 맞추기 어렵던 목표 비율 슬라이더 및 `%` 직접 기입 입력란, 수량고정/자동계산 토글 버튼을 전면 제거.
  - 각 시편 타입 카드에 직관적인 `열 수 (가로)` (`cols`) 및 `행 수 (세로)` (`rows`) 직접 입력 컨트롤 배치.
  - 사용자가 열과 행으로 원하는 수량을 매치(예: 6열×10행=60개)하면, 전체 생산 시편 수량 대비 해당 시편의 비율이 `📊 자동 계산 배분 비율: XX.X% (N개)` 배지로 실시간 자동 계산되어 표시.
  - 입력 시 사이드바 전체를 다시 그리지 않고 배지 DOM 텍스트만 실시간 갱신(`updateMixedSidebarBadges`)하여 키보드 입력 포커스가 끊기지 않고 원활하게 연속 수정 가능.
  - 기하 엔진(`geometry.js`)에서 각 타입의 수량(`cols * rows`)을 기반으로 `actualRatio`와 `targetRatio`를 정확히 산출하고, 우측 계산 결과 패널(`updateCalculationPanel`) 세부 분석에도 `자동 계산 배분 비율` 및 `수량`으로 일치화.
- **모서리 라운드(Fillet R) 관통 슬릿 렌더링 완전 수정**:
  - `renderCanvas`에서 직전 브릿지 렌더링으로 인해 `_ctx.fillStyle = runnerFill`(어두운 금속색)로 남아있던 상태에서 모서리 관통 슬릿을 사각형으로 칠해 둥근 모서리 뒤에 사각 잔여물이 튀어나오던 버그 완전 해결.
  - `showEtchRemove && cr > 0 && s.cornerType !== 'sharp'`에서 `_ctx.fillStyle = slitFill` (`#ffffff`)을 명시하고, 최대 반경(`maxR`)으로 안전 클램핑하여 시편 둥근 모서리 뒤가 완벽한 순백색 백라이트 관통 슬릿으로 연결되도록 개선.
- **단위 테스트 및 실기 검증**:
  - `test_etching_geometry.mjs` 20개 단위 테스트 100% PASS.
  - `scripts/test_etching_mixed_fixed_count.mjs` 5개 단위 테스트 100% PASS.
  - `scripts/test_etching_manufacturing_export.mjs` 26개 제조 테스트 100% PASS.
  - `scripts/test_etch_remove_geometry.mjs` 6개 브릿지/제거 테스트 100% PASS.
  - `verify_project.py` 전체 저장소 무결성 검증 100% PASS (JS 32개, 계측기 15개, Python 19개, HTTP 19개).
  - 브라우저 실기 검증 완료 (`etching_mixed_mode_verified_1789335049834.png` 확인): 일괄 모서리 패널/슬라이더 제거, 열/행 입력 시 포커스 유지 및 배분 비율 실시간 자동 갱신 확인.

### 2026-09-10 Etching Design 브릿지(ETCH_BRIDGE) 및 닫힌 에칭 제거 영역(ETCH_REMOVE Closed LWPOLYLINE) 전면 구현

- **브릿지(METAL KEEP)와 에칭 제거 영역(ETCH REMOVE)의 물리적 분리**:
  - Sample, Frame, Separator, Bridge는 남는 금속(Metal Keep)으로 설정.
  - Bridge 주변 및 Bridge와 Bridge 사이 공간은 단순한 '빈 공간'이 아닌 명시적인 `ETCH_REMOVE` Closed LWPOLYLINE(닫힌 폴리라인) Geometry로 생성.
  - AutoCAD에서 단일 클릭으로 선택 가능하며, AutoCAD 네이티브 `HATCH` 테스트 시 브릿지 상하 제거 영역이 각각 독립적으로 채워지도록 보장.
- **다중 브릿지(Bridge Count >= 1) 및 Gap 계산 엔진 (`calculateBridgesAndGaps`)**:
  - `calculateBridgesAndGaps(y0, h, count, width)` 함수 구현.
  - 중앙 1개 브릿지 (예: $H=6.0\text{mm}, W=0.5\text{mm}$): 상단 2.75mm 에칭 제거 + 중앙 0.5mm 금속 브릿지 + 하단 2.75mm 에칭 제거.
  - 2개 이상 브릿지 지원: Top Gap, Bridge 1, Middle Gap, Bridge 2, Bottom Gap... 형태의 독립된 폐곡선(Closed Contour) 생성.
- **제조 레이어 표준화 (AutoCAD ACI 호환)**:
  - `ETCH_SAMPLE`: 시편 절단선 (브릿지 연결부는 절단선 없이 개방되어 금속 일체형 유지)
  - `ETCH_FRAME`: 외곽 금속 프레임
  - `ETCH_SEPARATOR`: 열 간 분리 금속 러너
  - `ETCH_BRIDGE`: 금속 브릿지 상/하 절단 경계선
  - `ETCH_REMOVE`: 에칭 제거 영역 (Closed `LWPOLYLINE`, `70=1`, Color 30 오렌지)
- **AutoCAD DXF & Binary DWG Export 연동**:
  - DXF: `0\nLWPOLYLINE\n8\nETCH_REMOVE\n90\n4\n70\n1\n` (Closed = YES) 출력.
  - DWG: `@wecandobetter/dwg-writer`의 `LwPolyline` 엔티티 생성 시 `poly.isClosed = Boolean(ent.closed)` 및 `LwPolylineVertex` 연동.
  - 형상 검증 엔진(`validateCadGeometry`): 모든 `ETCH_REMOVE` 엔티티의 `closed === true` 강제 검증.
- **웹 앱 프리뷰 표시 옵션 추가**:
  - 캔버스 하단 플로팅 툴바에 `[☑ 금속 브릿지]` (`chk-bridges`), `[☑ 에칭 제거 영역]` (`chk-etch-remove`) 토글 체크박스 추가.
  - 상태 관리(`state.js`)의 `view.showBridges`, `view.showEtchRemove`와 반응형 바인딩.
  - 다국어(i18n): 한국어/영어 146개 키 1:1 매칭 완료.
- **단위 테스트 및 실기 검증**:
  - `scripts/test_etch_remove_geometry.mjs` (6개 전용 단위 테스트 100% PASS).
  - `scripts/test_etching_manufacturing_export.mjs` (26개 제조 테스트 100% PASS).
  - 브라우저 실기 UI 캡처 및 CAD SVG 매크로/전체 도면 검증 완료.

### 2026-09-10 Etching Design 제조용 DWG/DXF Export 전면 개편 및 CAD 제조 검증 엔진 연동

- **제조 형상(Manufacturing Geometry)과 검토/가이드(Preview/Guide)의 완전 분리**:
  - 단일 Source of Truth (`cad_builder.js`) 아키텍처 구축.
  - 내보내기 모드를 `MANUFACTURING` (기본값)과 `REVIEW_DRAWING`으로 이원화.
  - 제조용 모드(`MANUFACTURING`):
    - 시편 절단선(`ETCH_SAMPLE`), 외곽 프레임(`ETCH_FRAME`), 러너 절단선(`ETCH_SEPARATOR`), 탭 브릿지(`ETCH_TAB`), 물리적 구획선(`ETCH_BOUNDARY`), 원판 외곽선/툴링 홀(`PLATE_OUTLINE`)만 출력.
    - 방향 화살표(`GUIDE_ORIENTATION`), 치수선(`GUIDE_DIMENSION`), 치수/설명 텍스트(`GUIDE_TEXT`), 가이드 격자(`GUIDE_GRID`)를 CAD 파일에서 100% 원천 배제.
  - 검토용 모드(`REVIEW_DRAWING`): 치수선, 텍스트, 화살표를 `GUIDE_*` 레이어로 분리 출력.
- **실물 마이크로 조인트 탭(0.5mm Metal Bridge) 및 개방형 절단선 구조**:
  - 기존의 닫힌 사각형 심볼/마커 형태의 탭 출력을 영구 폐기.
  - 시편 좌/우 절단선에서 탭 구간(`tabY1` ~ `tabY2`, 0.5mm)을 미절단(Open) 상태로 비워두고, 탭 상하 절단선(`ETCH_TAB`)만 생성하여 시편과 러너/프레임이 실제 0.5mm 두께의 금속 브릿지로 완벽하게 이어지도록 구현.
  - 세퍼레이터(수직 러너) 역시 닫힌 박스로 탭 입구를 가로막지 않고, 탭 구간을 건너뛰는 절단선으로 결합하여 단일 연속 금속 바디 형성.
- **코너 가공 실제 CAD 엔티티 반영**:
  - `FILLET (라운드)`: 직선 세그먼트 근사가 아닌 AutoCAD 표준 `ARC` 엔티티(중심, 반지름, 시작/끝 각도)로 직접 생성.
  - `CHAMFER (모따기)`: 45° 대각선 `LINE` 엔티티로 생성.
- **중복선·0길이선 완전 제거(Geometry Cleanup Engine)**:
  - `cleanupGeometry(entities, tol=0.001)`: 0길이 선분 제거, 공선(Collinear) 상에서 맞닿거나 겹치는 선분 자동 병합, 중복 Arc/Circle/Line 제거로 에칭 CAM 변환 시 이중 절단 방지.
- **CAD Geometry Validation 엔진 연동**:
  - `validateCadGeometry`: 1 unit = 1 mm 스케일, 원판 범위 초과(Plate Overflow), 중복선 0건, 0길이 0건, 제조 모드 내 Guide 엔티티 0건 검증. 오류 시 내보내기를 안전 차단.
- **상단 툴바 내보내기 모드 선택기 UI**:
  - 상단 툴바에 `[● 제조용 (Manufacturing) ▾] | [📐 DWG] [📐 DXF]` 세렉트 박스 추가.
- **단위 테스트 및 실기 검증**:
  - `scripts/generate_test_cad.mjs` (AutoCAD DIST/DIM 검증용 100x100mm, 20x10mm, R1, C1, Ø10mm 테스트 도면) 생성.
  - `scripts/test_etching_manufacturing_export.mjs` (26대 제조 조건 100% PASS), 전체 20개 기본 단위 테스트, 7개 부속 테스트 스위트, `verify_project.py` 100% PASS. 브라우저 실기 스크린샷 검증 완료.

### 2026-09-10 Etching Design 혼합 배치 수동 여백 입력 및 원판 잔여 공간 자동 채우기 최적화

- **혼합 배치(Mixed Mode) 수동 여백 입력 컨트롤 연동**:
  - 사이드바 "전체 원판 규격" 섹션에 단일 모드와 동일한 고대비 세그먼트 토글 버튼(`[자동 중앙 정렬] | [수동 여백 설정]`) 추가.
  - `수동 여백 설정` 선택 시 `좌/우 여백 (mm)` (`etchMixedMarginLR`) 및 `상/하 여백 (mm)` (`etchMixedMarginTB`) 입력란 노출.
  - 사용자가 좌/우 여백(예: 10mm, 5mm)을 입력하면 가용 폭(`availW`)이 즉시 확장되고 캔버스 시작 좌표(`startX`)가 사용자가 입력한 좌측 여백 위치로 정확히 정렬.
- **원판 잔여 공간 자동 채우기 최적화 엔진 (Step 2-2 Dynamic Space Fill)**:
  - 기존에는 목표 비율 차이가 개선되지 않는 경우 여유 공간이 남아도 추가 컬럼 배분을 중단하던 한계를 개선.
  - 가용 폭(`availW`) 또는 가용 높이(`availH`) 내에 시편이 들어갈 공간이 남아있다면, 목표 비율과의 최소 자승 오차(`sum of squared errors`)를 최소화하는 타입에 추가 컬럼/행을 자동 배분하여 원판 공간을 최대로 채우도록 최적화.
  - 실기 검증 결과: 420×197mm 원판에서 좌/우 여백 10mm 입력 시 총 시편 생산 수량이 288개 → 330개로 대폭 증가(+42개), 면적 수율이 50.59% → 62.07%(+11.48%)로 극대화됨을 확인.
- **테스트 및 검증**:
  - `scripts/test_etching_mixed_margins.mjs` (5개 단위 테스트) 및 전체 테스트 스위트, `verify_project.py` 100% PASS. 브라우저 실기 스크린샷 검증 완료.

### 2026-09-10 Etching Design 전체 UI/UX 정밀 개편 (중복·겹침 제거, 무의미한 줄바꿈 방지, 버튼 직관적 재배치)

- **상단 엔지니어링 툴바 단일 행 고정 및 4단 논리 그룹화**:
  - `flex-wrap: nowrap; overflow-x: auto; white-space: nowrap` 적용으로 화면 폭에 관계없이 단일 행 정렬 보장 (`PNG` 단독 2행 추락 현상 완전 해결).
  - 버튼군을 4대 영역(프로젝트: 새 프로젝트/불러오기/저장, 이력: 취소/복원, CAD 내보내기: DWG/DXF, 뷰 줌: -/100%/+/맞춤)으로 세로 구분선(`border-right`)과 함께 직관적 재배치. SVG/PDF 생성 함수는 있지만 이 커밋의 툴바 버튼에서 아직 호출하지 않는다.
- **사이드바 여백·줄바꿈·중복 텍스트 제거**:
  - 혼합 배치 원판 규격 아래 장황한 설명 배너 제거.
  - `[⚡ 3개 균등 배분]` 및 `[📐 시편 방향 ▾]` 버튼을 2열 그리드로 정렬하여 한눈에 들어오도록 개선.
  - 시편 타입 카드 내의 중복 치수 텍스트(`시편: 15×6mm`) 제거.
  - 타입 간 여백 카드 라벨을 `↕ TYPE 1 ↔ TYPE 2 여백`으로 간소화하고 `white-space: nowrap`을 적용하여 1개 행으로 정돈.
  - 드롭다운 선택 메뉴 텍스트를 한국어 모드에서 영문 기호 없이 순수 한글(`직각`, `라운드`, `모따기`)로 정돈하고, 언어 설정을 영어로 변경 시에만 영문 표준 CAD 명칭(`Sharp (90°)`, `Fillet (R)`, `Chamfer (C)`)으로 전환되도록 언어별 완전 분리.
- **단일 배치(Single Mode) 여백/배치 모드 세그먼트 버튼 전환**:
  - 구형 브라우저 네이티브 라디오 버튼을 고대비 세그먼트 토글 버튼(`[자동 중앙 정렬] | [수동 여백]`, `[수량 고정] | [자동 계산]`)으로 현대화.
- **우측 계산 결과 패널 중복 치수 정돈 & 실기 검증**:
  - 타입별 카드 헤더의 중복 치수를 세련된 녹색 수량 배지(`147 개`)로 대체하고 목표 비율, 실제 비율, 배열 격자(`21×7`), 시편 크기(`15×6mm`)로 일목요연하게 계층화.
  - 전체 단위 테스트 및 프로젝트 무결성 검증 100% 통과, 실기 브라우저 스크린샷 검증 완료.

### 2026-09-10 Etching Design 사이드바 드롭다운·동적 타입 관리·실물 관통 슬릿/0.5mm 탭 고정 브릿지

- **사이드바 버튼 넘침 해결 & 방향 맞춤 드롭다운**:
  - `[📐 가로 방향 자동 맞춤]` 버튼의 280px 사이드바 넘침 현상을 수정하고, 클릭 시 "가로 긴 방향 자동 맞춤 (W ≥ H)"과 "세로 긴 방향 자동 맞춤 (H ≥ W)"을 선택할 수 있는 테마 대응 고대비 드롭다운 메뉴로 전환.
- **동적 시편 타입 추가 및 순서 변경**:
  - `[➕ 새 시편 타입 추가]` 버튼으로 TYPE 4, TYPE 5...를 동적 추가(추가 시 전체 비율 100% 자동 균등 분할).
  - 각 타입 헤더에 `[▲]`, `[▼]`, `[🗑️]` 버튼을 제공해 원판 상의 배치 순서(좌→우 열 순서) 이동 및 삭제(나머지 비율 100% 재정규화) 지원.
- **실제 샘플 컷팅 형상 렌더링 (외곽 관통 슬릿 & 0.5mm 마이크로 조인트 탭)**:
  - 실물 사진(백라이트 테이블 에칭) 기반: 시편 치수 주변에 투명 관통 슬릿(흰색 `#ffffff`)이 뚫리고, 시편 좌/우 중앙에 0.5mm 두께의 미세 브릿지(Holding Tab)만 남아 수직 런너에 부착된 형상을 캔버스에 렌더링.
  - AutoCAD 1:1 DXF 및 SVG 내보내기 시에도 0.5mm 탭 구간을 건너뛰는 6개 분할 컷팅선(`cutSegments`)을 연동하여 가공기에서 0.5mm 브릿지가 미절단 상태로 보존되도록 구현.
- **다국어(i18n)**: 한국어/영어 115개 키 1:1 매칭 완료.

### 2026-09-10 Etching Design 모서리 가공 (라운드/필렛 R, 모따기 C) 및 전체 일괄/타입별 개별 수정

- **모서리 가공 형태 및 치수 지원**:
  - `라운드 / 필렛 (Fillet R)`: 4개 모서리를 R 반경으로 둥글게 원호 가공.
  - `모따기 / 챔퍼 (Chamfer C)`: 4개 모서리를 C 치수로 $45^\circ$ 대각선 가공.
  - `직각 / 없음 (Sharp 90°)`: 기본 직각 가공 ($R=0$).
  - 안전 클램핑($R \le \min(W, H)/2$, $R \le (H - tw)/2 - 0.05$)으로 0.5mm 마이크로 조인트 탭과의 간섭을 방지.
- **전체 타입 일괄 적용 (Batch Apply)**:
  - 혼합 배치 사이드바 상단에 `[⚡ 모서리 일괄 설정 (전체 타입 적용)]` 컨트롤 추가.
  - 모서리 형태 및 크기(mm)를 입력하고 `[✓ 전체 타입 모서리 일괄 적용]`을 클릭하면 모든 시편 타입(TYPE 1, TYPE 2, TYPE 3...)에 한 번에 동일하게 적용.
- **타입별 개별 치수 수정**:
  - 각 타입별 카드 내부에 독립된 모서리 형태 드롭다운 및 R/C mm 입력란 제공.
  - TYPE 1은 R=1.0mm 필렛, TYPE 2는 C=1.5mm 챔퍼, TYPE 3은 직각 등 타입별로 자유롭게 개별 수정 지원.
- **실물 2D 캔버스 & CAD 내보내기 연동**:
  - 캔버스에서 `createSpecimenPath`를 통해 라운드/필렛 및 챔퍼 모서리를 실시간 렌더링하고, 외곽 백라이트 컷팅 슬릿이 모서리를 감싸도록 표현.
  - AutoCAD 1:1 DXF 내보내기 시 원호 및 대각선 분할 컷팅선(`cutSegments`)을 연동하여 레이저/에칭 가공기에서 정확히 가공되도록 구현. SVG에서도 `rx/ry` 및 다각형 경로 적용.
  - 라운드/챔퍼 적용 시 시편 모서리 외곽 4개 코너 영역(`[sx, sy, cr, cr]` 등)에 백라이트 컷팅 슬릿(`slitFill` `#ffffff`)을 연동하여, 기존에 사각 모서리 금속 바탕이 남아있던 현상 완전 해결.
- **다국어(i18n)**: 한국어/영어 124개 키 100% 매칭 완료.

### 2026-09-10 Etching Design 시편 간 수평 뼈대(커넥터) 완전 제거 및 실물 관통 슬릿 일치화

- **상하 시편 간 금속 뼈대(Dark Metal Frame) 제거 및 관통 슬릿 연동**:
  - 실물 백라이트 에칭 원판 사진(10×50mm SUS316L) 분석: 열(Column) 사이에는 0.5mm 마이크로 조인트 탭이 연결되는 수직 런너(러너 프레임)가 존재하지만, 동일 열 내 상하 인접한 시편과 시편 사이에는 어떠한 수평 금속 뼈대도 존재하지 않으며 상하 간격 전체가 관통 슬릿(White Through-Cut Void)으로 뚫려 있음.
  - 기존 캔버스 렌더러가 상하 슬릿 높이 `hSlit`을 최대 1.2mm로 고정하여 시편 간 간격(`vGap`)이 클 때 가운데에 원판 금속 바탕색(`#1c222c`)이 뼈대처럼 노출되던 문제를 전면 개편.
  - 상하 슬릿이 `vGap / 2 + 0.05mm`씩 분담 오버랩하여 시편과 시편 사이를 100% 빈틈없는 흰색 백라이트 관통 슬릿으로 채우도록 수식 수정 완료.
- **CAD 지오메트리 엔진 수평 커넥터 생성 제거 (`connectors = []`)**:
  - `calculateSingleTypeGeometry` 및 `calculateMixedDesignGeometry`에서 허위 수평 커넥터 생성을 영구 폐기하고 `connectors = []`로 반환. AutoCAD 1:1 DXF `CONNECTOR` 레이어, SVG, PDF 내보내기 시에도 시편 사이 가로 선분이 생성되지 않도록 동기화.
  - `sampleObj`에 `vGap`, `hGap`, `totalRows`, `totalCols`를 명시적으로 전달하여 기하학적 일관성 확보.
- **TYPE 2 기본 세로 간격 최적화 & 사이드바 라벨 개선**:
  - `presets.js`: TYPE 2 기본 세로 간격을 실물 사진 규격에 맞추어 1.2mm로 조정.
  - 사이드바 라벨을 혼동을 주던 `연결부 / 세로 간격`에서 `시편 세로 간격 (mm)` (영문 `Sample V-Gap (mm)`)으로 직관화.
- **테스트 통과**: 20개 단위 테스트 100% PASS, 분할 방향 테스트 PASS, 코너 피처 테스트 PASS, verify_project.py PASS. 실기 브라우저 검증 완료.

### 2026-09-10 Etching Design 혼합 배치 가로 구획 분할 (상 / 중 / 하 행 분할) 지원

- **구획 분할 방식 토글 (Split Direction: 'vertical' vs 'horizontal')**:
  - 사이드바 "전체 원판 규격"에 `[세로 분할 (좌 / 우)]` 및 `[가로 분할 (상 / 하)]` 세그먼트 버튼 추가.
  - 클릭 시 `state.setSplitDirection('horizontal' | 'vertical')` 호출 및 Undo/Redo(Ctrl+Z / Ctrl+Y) 스택 완벽 연동.
- **가로 행 분할 최적화 기하 엔진 (`calculateMixedDesignGeometry`)**:
  - `splitDirection === 'horizontal'`:
    - 원판 가용 높이($\text{availH}$)를 목표 비율(%)에 맞추어 상단(TYPE 1) / 중단(TYPE 2) / 하단(TYPE 3)으로 행(Rows) 자동 최적화 및 배분.
    - 가용 폭($\text{availW}$)을 가득 채우는 열(Cols) 계산으로 전체 시트 점유율 극대화.
    - 타입 사이에 가로 방향 마젠타 구획 경계선(`boundaries`, $W=\text{plateW}, H=5\text{mm}$) 자동 생성 및 2D 캔버스, DXF, SVG, PDF 내보내기 100% 호환.
- **타입 카드 위치 배지 연동**:
  - 가로 분할 시: TYPE 1 `[상단]`, TYPE 2 `[중단]`, TYPE 3 `[하단]` 동적 배지 표시.
  - 세로 분할 시: TYPE 1 `[좌측]`, TYPE 2 `[중단]`, TYPE 3 `[우측]` 동적 배지 표시.
  - `[▲]`, `[▼]` 이동 버튼으로 배치 순서 즉시 변경 가능.
- **다국어(i18n)**: 한국어/영어 134개 키 1:1 매칭 완료 (누락 0건).

### 2026-09-10 Etching Design 타입 간 여백(치수) 입력 및 개별/전체 설정 지원

- **타입 간 여백 치수 직접 입력 (Inter-Type Boundary Gap Dimension)**:
  - 혼합 배치(Mixed Mode)에서 서로 다른 시편 타입 사이에 들어가는 여백을 사용자가 원하는 mm 치수로 직접 입력할 수 있도록 구현.
  - **전체 기본 여백**: 사이드바 "전체 원판 규격"의 `타입 간 기본 여백 (mm)` (영문 `Default Gap Between Types (mm)`)으로 전체 타입에 기본 적용할 간격 설정.
  - **타입별 개별 여백 카드**: "타입별 배분 비율 및 시편 크기" 섹션에서 인접한 타입 카드 사이에 핑크 점선 카드(`[ ↕/↔ TYPE 1 ↔ TYPE 2 여백: [ 12.0 ] mm ]`)를 제공하여, 인접한 타입 쌍마다 독립적인 간격 치수(mm)를 자유롭게 개별 지정 가능.
- **실시간 2D 캔버스 & 치수 라벨 렌더링**:
  - 캔버스의 구획선(마젠타 밴드) 폭이 입력한 mm 치수에 맞추어 실시간으로 정밀 확장/축소.
  - 가로 분할 시: 마젠타 밴드 중앙에 `↕ TYPE 1 ↔ TYPE 2: 12.0 mm` 치수 텍스트 표시.
  - 세로 분할 시: 수직 밴드 방향에 맞추어 90° 회전된 `↔ TYPE 1 ↔ TYPE 2: 12.0 mm` 치수 텍스트 정밀 표시.
- **CAD 내보내기 & 상태 관리(Undo/Redo)**:
  - `boundaryWidths` 배열을 `state.js`에 통합하여 실행 취소/다시 실행(Ctrl+Z / Ctrl+Y) 및 프로젝트 직렬화(`.etching`) 100% 보존.
  - AutoCAD 1:1 DXF `BOUNDARY` 레이어, SVG `<rect class="boundary-strip">`, PDF 내보내기 시에도 변경된 개별 mm 치수가 정확히 1:1 반영.
- **다국어(i18n) 및 테스트**:
  - 한국어/영어 135개 키 1:1 매칭 완료 (`scripts/test_etching_i18n.mjs` PASS).
  - 전용 단위 테스트 `scripts/test_etching_custom_gaps.mjs` (6개 항목) 및 20개 기본 단위 테스트, 분할 방향 테스트, 코너 피처 테스트, `verify_project.py` 100% 통과. 실기 브라우저 검증 완료.

### 2026-09-08 Epson OK900P 테이프 폭 변경 시 디자인 비례 조정

- 기존 `setTapeWidth()`는 작은 테이프에서 요소 높이와 Y 위치만 잘라 맞추고 텍스트 pt·가로 크기·요소 간격은 유지해, 24mm 디자인을 9mm로 바꾸면 글자가 겹쳤다.
- `rescaleElementsForTapeWidth()`를 추가해 이전/새 테이프의 실제 인쇄 가능 폭(`maxPrint`) 비율로 텍스트 크기·요소 X/Y/W/H·바코드·QR·이미지를 함께 축소/확대한다. 상단 인쇄 가능 영역을 기준으로 위치를 옮기고 최종 요소는 새 인쇄 가능 높이 안으로 제한한다.
- 화면 미리보기의 최소 글자 크기를 9px에서 2px로 낮춰 작은 테이프의 실제 축소 비율이 보이게 했다. 360 DPI 출력은 같은 `element.size`를 사용하므로 화면과 출력에 동일하게 반영된다.
- `scripts/test_ok900p_tape_scaling.mjs` 계산 테스트와 실제 브라우저에서 24mm → 9mm → 24mm 전환을 확인했다. 9mm에서 라벨 길이는 70mm → 34mm, 9pt → 약 3.162pt로 줄고 겹침이 사라졌으며, 24mm 복귀 시 원래 크기로 복원됐다. EXE는 미빌드.

### 2026-09-08 Epson OK900P 프린터 검색 실패 수정

- 증상: Windows에 `EPSON OK900P`가 설치돼 있었지만 HTML 화면은 `프린터 검색 중...` 및 드라이버 미인식으로 표시했다.
- 원인: `/api/printers`가 `PrinterController`를 import할 때 `PIL`이 없는 개발 서버 Python 3.14에서 import 자체가 실패해, Windows 인쇄 대기열을 조회하기 전 오류가 났다. UI도 `{ok:false}` 응답을 처리하지 않아 선택 상자를 계속 검색 중으로 남겼다.
- 수정: `epson_ok900p` 패키지의 렌더러 import를 선택 의존성으로 만들고, PrinterController에 pywin32/Pillow 없이 Winspool `EnumPrintersW`를 직접 읽는 검색 전용 보조 경로를 추가했다. `{ok:false}` 응답에서는 검색 중 문구를 선택 안내와 실제 오류로 교체한다. 인쇄는 기존 Pillow/pywin32 렌더·스풀러 경로를 유지한다.
- 검증: `/api/printers`가 `EPSON OK900P`, OneNote, Microsoft Print to PDF, Fax를 반환하고 자동 감지값이 `EPSON OK900P`임을 확인했다. 브라우저에서도 `EPSON OK900P ★`와 `정상 연결됨` 표시를 확인했다. 인쇄 작업은 보내지 않았다.

### 2026-09-08 Epson OK900P 경고 표지 줄바꿈 잘림 수정

- 증상: `⚠️ 경고 & 보관함 표지 (36mm)` 템플릿의 `HIGH VOLTAGE INSIDE\n관계자 외 조작 금지`가 미리보기에서 첫 줄 위 빈 줄 때문에 아래로 밀려 일부가 요소 영역에서 잘렸다.
- 수정: multi-line 텍스트를 렌더링하는 HTML의 템플릿 리터럴 들여쓰기·줄바꿈을 제거하고 텍스트 자체만 요소 안에 넣었다. 사용자 텍스트는 HTML 이스케이프 처리한다.
- 검증: 실행 중인 브라우저에서 경고 템플릿을 새로 불러와 두 줄 전체가 36mm 라벨 안에 표시됨을 확인했다. 인쇄 작업은 보내지 않았다.

### 2026-09-08 Epson OK900P 선택 삭제·되돌리기

- 캔버스에서 선택한 요소는 `Delete` 키로 삭제한다. 텍스트 입력·숫자 입력·선택 메뉴에 포커스가 있을 때는 브라우저의 일반 입력 동작을 보존하고 삭제하지 않는다.
- 오른쪽 속성 패널의 삭제 버튼은 모두 제거했다. 삭제는 키보드 Delete 또는 상단 도구막대의 삭제 버튼으로 수행한다.
- 상단 도구막대에 `↶ 되돌리기` 버튼과 Ctrl+Z 단축키를 추가했다. 최근 50개의 디자인 상태(요소, 선택, 테이프/길이/여백/배경 설정)를 보관하며 삭제·추가·복제·속성 변경·테이프 변경·정렬·템플릿 불러오기를 되돌린다.
- 드래그·리사이즈는 실제 위치나 크기가 바뀐 경우에만 되돌리기 이력을 추가한다. 단순 클릭·선택에는 이력이 추가되지 않는다.
- 브라우저에서 제목 텍스트 선택 → Delete → `↶ 되돌리기` 복원까지 확인했다. 인쇄 작업은 보내지 않았다.

### 2026-09-08 Epson OK900P 시리얼 카운터 예시

- 시리얼 카운터가 켜진 텍스트의 설정 패널에 `출력 예시`를 추가했다. 시작값·증가폭·자릿수로 계산한 연속 3개 번호를 표시한다. 예: `1 / 1 / 3자리` → `001 → 002 → 003`.
- 시작값·증가폭·자릿수를 바꾸면 속성 패널을 다시 그려 예시도 즉시 갱신한다. 브라우저에서 시리얼 텍스트를 선택해 예시 표시를 확인했다.

### 2026-09-08 Epson OK900P 캔버스 자유 회전·배경 선택 제거

- 인쇄 결과에 반영되지 않는 중앙 도구막대의 테이프 배경색 선택을 제거했다. 실제 OK900P 출력은 360 DPI 1-bit 흑백이다.
- 속성 패널의 0°/90°/180°/270° 고정 회전 버튼을 제거했다. 선택한 요소의 위쪽 파란 `⟳` 핸들을 마우스로 드래그하면 1° 단위의 임의 각도로 회전한다.
- 회전은 화면 미리보기와 360 DPI 출력 렌더러 양쪽의 기존 `rotation` 값을 사용하며, 되돌리기 이력에도 포함된다. 브라우저에서 자유 회전 후 `↶ 되돌리기`로 원래 각도를 복원하는 것을 확인했다.

### 2026-09-08 Epson OK900P 시리얼 종료값 범위 인쇄

- 시리얼 카운터에 `종료값` 입력을 추가했다. 시리얼이 켜져 있으면 인쇄 매수는 번호당 복사 수이고, 실제 전송 횟수는 `시작값~종료값` 범위의 번호 수 × 인쇄 매수다.
- 예: 시작 1, 종료 5, 증가폭 1, 3자리, 인쇄 매수 1이면 `001`~`005` 라벨 5장을 순차 생성·전송한다. 인쇄 매수 2면 번호마다 2장씩 총 10장이다.
- 범위는 증가폭에 맞는 번호만 포함하며, 종료값이 시작값보다 작거나 한 번에 999개를 넘으면 전송하지 않고 오류를 표시한다. 기존 시리얼 데이터에 종료값이 없으면 시작값과 같게 해 기존 단일 인쇄 동작을 유지한다.
- `serialPrintPlan()` 단위 테스트(1~5, 증가폭 1/2, 잘못된 역방향 범위, 999개 초과)를 통과했고 브라우저에서 종료값 5 → 총 5장 표시를 확인했다. 실제 인쇄 작업은 보내지 않았다.

### 2026-09-08 Epson OK900P 화면 줌 제거

- 화면 미리보기만 바꾸고 실제 출력에는 영향을 주지 않는 `줌 / - / + / 100%` 도구막대를 제거했다. 기본 뷰어 배율은 100%로 고정한다.

### 2026-09-08 Epson OK900P HTML 인쇄 런타임 설치

- HTML 개발 서버의 실제 OK900P 인쇄 API는 Pillow와 pywin32를 필요로 한다. `C:\Python314\python.exe` 사용자 패키지 환경에 `Pillow 12.3.0`, `pywin32 312`를 설치했다.
- 서버는 사용자 패키지 경로를 읽는 일반 Windows 권한으로 재실행해야 한다. 해당 환경에서 `from PIL import Image`, win32print/win32ui/win32gui/win32con/ImageWin import와 `EPSON OK900P` 프린터 자동 감지를 확인했다.
- 실제 인쇄 명령은 이 설치 검증에서 보내지 않았다.

### 2026-09-08 Epson OK900P 드래그 다중 선택·일괄 편집

- 캔버스 빈 곳에서 마우스를 드래그하면 선택 사각형과 겹치는 요소를 모두 선택한다. 다중 선택은 밝은 파란 테두리로 표시되고 첫 선택 요소에만 회전 핸들이 나타난다.
- 다중 선택 시 오른쪽 패널은 선택 개수와 일괄 편집 패널로 바뀐다. 텍스트 요소에는 글자 크기·가운데 정렬을, 모든 요소에는 회전각도·삭제를 한 번에 적용한다.
- Delete 키와 상단 삭제도 다중 선택 전체에 적용되며, 기존 되돌리기 이력으로 복구된다. 선택 사각형, 3개 요소 일괄 가운데 정렬, 일괄 삭제·되돌리기 복원을 브라우저에서 확인했다.

## 4. SP-2100 / TL-2200 — 이번 세션 핵심 작업

### 배경
- 사용자가 **단독(standalone) 원본 HTML**
  (`C:\Users\0op64\Documents\카카오톡 받은 파일\sp-2100\sp2100_logger.html`)을
  제공, "통합 앱의 SP-2100 화면을 이 단독 프로그램과 동일하게 전면 재구성"하기로 결정.
- `instruments/sp2100_logger.js`가 현재 기준(SSOT)이며, 파싱 규칙은
  `docs/SP2100_PROTOCOL_REFERENCE.md`에 문서화됨 — **향후 수정 시 반드시 이 문서의
  규칙을 따를 것** (라벨 기반 파싱, 임의 "숫자 N개=측정값" 같은 단순화 금지).

### 적용된 변경 사항
1. **파싱 및 중복 커밋 차단 (`onLine` vs `processFrame`)**:
   - `onLine()`은 로그만 기록하고, 측정 데이터 등록(커밋)은 파형이 완전히 조합되는 `processFrame()`에서만 단일 수행하여 1회 측정 시 2개 행이 중복 등록되던 문제 완전 해결. 1.5초 이내 동일 AVG/KP 중복 가드 탑재.
2. **TL-2200 신호 역공학 및 파형 왜곡 해결**:
   - **8비트 음수 델타 복원**: `b & 0x7F` 마스킹을 제거하고 8비트(Latin1) 전체 보존. `0xBA~0xFE` (186~254)가 음수 델타(`-(b - 185)`)임을 규명하여 힘을 인가/제거할 때 파형이 정상적으로 하강·반영되도록 수정.
   - **Delay 라인 누락 방지**: 헤더 CSV 시퀀스 번호와의 오매칭을 방지하기 위해 `TL-22` 라인 스킵 및 `\d{3,6}` 정규식을 적용하여 Delay(978개) + Avg(4882개) 총 5,860여 개 전체 파형 프레임 순차 조립.
3. **측정 기록 테이블 & 단일 행 덮어쓰기**:
   - 테이블 순서: `체크 | # | 제품명(인라인 편집) | AVG(소수점2자리) | SP | KP | VAL | RMS`
   - 체크박스를 1개만 체크하고 재측정 시 기존 행에 새 결과를 덮어쓰기(`[덮어쓰기]` 로직).
4. **마우스 드래그 구간 분석 (Web UI)**:
   - 힘-시간 캔버스 위에서 마우스 드래그 시 하늘색 음영 하이라이트 + 상단 통계 배지(구간 시간, 평균, 최소, 최대, 포인트 수) 실시간 산출.
5. **대시보드 및 Raw Data 동적 XLSX 내보내기 (`instruments/sp2100_xlsx.js`)**:
   - 기존 CSV 저장을 폐기하고 **`XLSX 저장`** 기능으로 전면 교체.
   - **Sheet 1 (`대시보드`)**:
     - 상단: Excel 네이티브 Scatter 차트 (데이터 포인트 크기를 1/3인 `size: 2`, 선 두께 `1.0pt`로 슬림화).
     - 요약표: 첫 번째 열에 `TRUE` 대신 유니코드 체크박스(`☑`) 및 드롭다운(`☑`, `☐`) 목록 연동.
     - **📍 구간 분석 컨트롤 바**: 시작 시간(s)과 종료 시간(s) 입력란 구비. 요약표에 `=AVERAGEIFS`, `=MINIFS`, `=MAXIFS` 수식을 탑재하여 사용자가 시간을 바꾸면 해당 구간의 평균·최소·최대가 엑셀에서 실시간 자동 재계산됨.
   - **Sheet 2 (`Raw Data`)**:
     - 시료별 시험 조건 헤더 + 전체 시간/힘 원시 시계열 데이터 정리.
   - **Sheet 3 (`_ChartData`, 숨김)**:
     - `=IF(OR($A="☑", $A=TRUE, ...), Raw, NA())` 수식으로 대시보드 체크박스와 차트 표시를 실시간 동적 바인딩.
   - 상세 기술 문서는 [`docs/SP2100_TL2200_INTEGRATION_MANUAL.md`](docs/SP2100_TL2200_INTEGRATION_MANUAL.md) 참고.
6. **파형 그래프 다중 구간 드래그 선택 및 테이블 적용/복구 (2026-09-08)**:
   - **다중 구간 선택 (`S.waveSegments`)**: 마우스 드래그로 복수의 파형 구간(Segment #1, #2, ...)을 지정 가능. `Shift` 키를 누른 상태로 드래그하거나 상단 툴바의 `+ 다중 추가` 버튼을 켜면 기존 구간을 유지한 채 새 구간이 누적됨. 단순 클릭 시 단일 모드에서는 초기화, 개별 구간 칩의 `✕` 버튼으로 특정 구간만 삭제 가능.
   - **통합 평균 및 구간별 통계**: 각 구간의 개별 평균(g) 칩 표시 및, 구간들이 겹치더라도 샘플 인덱스를 `Set`으로 결합하여 중복 샘플 왜곡 없이 전체 선택 포인트의 `통합 평균(Combined AVG)`, 최소, 최대, 총 포인트 수를 캔버스 배지 및 툴바에 실시간 산출.
   - **데이터 테이블 적용 (`✓ 행에 적용`)**: 적용 버튼 클릭 시 현재 선택/활성 행의 `AVG`, `KP`, `VAL`에 선택 구간의 통계값을 즉시 반영하고 행 번호 옆에 주황색 `수정 ↺` 배지 표시. 상단 대형 LED 디스플레이 및 AVG 분포 차트도 실시간 연동.
   - **원본 데이터 복구 (`↺ 원본 복구`)**: 장비에서 최초 수신된 원본 측정값(`rec._orig`)을 영구 보존하여, 툴바의 `↺ 원본 복구` 또는 테이블 행의 `수정 ↺` 버튼을 누르면 언제든지 장비 공식 원본값으로 100% 복구됨.
7. **다중 구간 선택 툴바 텍스트 및 배지 명도·가독성 개선 (2026-09-08)**:
   - 라이트 모드(`body.light`) 및 다크 모드에 맞춰 `.sp-wave-toolbar`, `.sp-seg-chip`, `.sp-comb-avg-wrap`, `.sp-apply-btn` 등의 배경 및 텍스트 색상을 고대비로 세분화.
   - 캔버스 내 플로팅 통계 배지도 테마에 따른 명확한 테두리 및 텍스트 색상을 적용해 모든 구간 칩과 통계 수치가 선명하게 보이도록 개선.
8. **우측 불필요 여백 제거 및 2열 전체 폭 확장 레이아웃 (2026-09-08)**:
   - 우측 패널이 필요 없는 계측기(SP-2100, K2400 등)에서 CSS Grid의 3번째 트랙(`--right-w`)이 남아 화면 우측에 약 340px의 빈 여백이 생기던 레이아웃 문제 해결.
   - `#layout.sp2100-layout-no-right`를 통해 `grid-template-columns: var(--sidebar-w) minmax(0, 1fr) !important`를 명시하고 `#rightpanel`을 완전 제거하여 중앙 영역(`#center`)이 창 우측 끝까지 자연스럽고 넓게 확장되도록 조치.

## 4-1. Photo Editor (신규 웹 포팅)

### 배경
- 기존 `instruments/ai_photo_editor/` (CustomTkinter + PyTorch/YOLO 데스크톱 앱)의
  기능을 통합 웹 앱으로 포팅. **YOLO 학습 기능(`ui_train.py`, `ui_yolo_train.py`,
  `yolo_dataset/`, `feature_brain.pkl`)은 사용자 요청에 따라 완전히 제외** —
  테스트가 잘 안 되어 제거 결정.
- `instruments/photo_editor.js` (신규 파일, `viewType: 'custom'`)로 구현,
  `index.js`의 `INSTRUMENTS`에 등록. 기존 `DESKTOP_TOOLS`의 `desktop-only`
  placeholder 항목은 제거됨.

### 구현 내용
- **Step1 (편집)**
  - 파일 업로드(파일 선택 + 드래그앤드롭), 좌측 파일 목록(썸네일/삭제/전체삭제)
  - 캔버스 기반 이미지 뷰어: 휠 줌(0.05~40×), 우클릭/중클릭 드래그 팬,
    회전 슬라이더(-15°~15°, ±0.1° 스텝 버튼)
  - 회전은 `rotatedCanvas(f)`로 PIL `rotate(expand=True)`와 유사하게 오프스크린
    캔버스에 바운딩박스 확장 렌더링 (회전된 이미지 좌표계 기준으로 크롭 좌표 저장)
  - 크롭 영역: 드래그로 새로 그리기 / 이동 / 4모서리 핸들로 리사이즈,
    영역 밖은 반투명 음영 처리
  - "크롭 자동 맞춤": 선택된 사진의 크롭 영역을 템플릿으로 삼아, 0.2배 축소
    그레이스케일에서 SAD(절대차합) 기반 브루트포스 매칭으로 다른 사진들의
    크롭 위치를 자동 추정 (점수가 나쁘면 상대 위치 기반 fallback)
  - 출력 크기(`out_w`/`out_h`, 인치, 기본 1.5) + 한 열 개수(`perRow`, 기본 6)를
    `localStorage` (`ai_photo_editor_settings` 키)에 저장
- **Step2 (미리보기/내보내기)**
  - `outPx() = {w: outW*96, h: outH*96}` (96dpi) 크기로 크롭 영역을 캔버스에
    렌더링, `perRow` 기준 그리드 배치 (`col = i / perRow`, `row = i % perRow`),
    각 열 상단에 `#N` 헤더
  - 썸네일 클릭 → 보정 모달(회전 슬라이더 + 실시간 미리보기, "보정 완료")
  - "엑셀로 내보내기": `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm`을
    동적 import하여 ExcelJS로 `.xlsx` 생성, 각 셀에 크롭된 PNG(base64)를
    `addImage`로 삽입, 컬럼 너비/행 높이를 출력 픽셀 크기에 맞춰 설정
    (`colWidth = ow/7+2`, `rowHeightPt = oh*0.75`)

### 알려진 제약 / 후속 작업 후보
- SAD 템플릿 매칭은 순수 JS 브루트포스라 사진 수/해상도가 많으면 느릴 수 있음
  (파일당 비동기 양보로 UI 블로킹은 방지).
- ExcelJS는 CDN(`+esm`)에서 동적 로드 — 오프라인 환경에서는 내보내기 실패.
  필요 시 로컬 vendor 파일로 교체 검토.
- 아직 실제 브라우저에서 전체 플로우(업로드→크롭→자동맞춤→Step2→엑셀) 실기
  테스트는 미완료.

#### 🔴 2026-07-15: 엑셀/JPEG(zip) 내보내기가 EXE에서 조용히 저장되지 않던 문제 수정 (`instruments/photo_editor.js`)
- **배경**: 사용자 질문 "photo editor 에서 사진 엑셀로 내보내기 하면 파일 어디에 저장되?"에서 출발해
  조사한 결과, `exportExcel()`/`exportJpegs()` 둘 다 `Blob` + `<a download>` 클릭이라는 순수
  브라우저 다운로드 방식만 사용하고 있었음(앱의 자체 `/api/save-file`·`/api/export` 백엔드는
  전혀 호출하지 않음 — grep으로 확인). pywebview(EXE 런처, `build/package_exe.py`) 6.2.1의
  다운로드 관련 기본 설정을 직접 확인한 결과 `ALLOW_DOWNLOADS: False`가 기본값 — 즉 **EXE에서는
  다운로드 자체가 조용히 차단되어 있어, 두 버튼 다 눌러도 아무 파일도 생성되지 않았을 가능성이
  높았음**. 사용자가 "저번에 이 문제때문에 혹시나해서 jpg 저장도 추가 버튼 만들었었는데"라고
  언급한 그 버튼(`exportJpegs`)도 실제로는 엑셀 버튼과 동일한 다운로드 메커니즘이라 우회책이
  되지 못하고 있었음.
- **해결 방향**: pywebview 설정을 켜는 대신(브라우저 다운로드 설정에 계속 의존하게 되어 근본
  해결이 아님), PST-3202 Raw Data 내보내기가 이미 쓰고 있는 검증된 서버 저장 경로
  (`fetch('/api/export', {headers:{'X-Filename':...}, body:...})`)를 그대로 재사용 —
  `server.py`(개발 서버)·`build/package_exe.py`(EXE 내장 서버) 양쪽에 이미 동일한 `/api/export`
  라우트가 구현돼 있어(EXE에서는 `os.path.dirname(sys.executable)` 폴더에, 개발 서버에서는
  스크립트 위치에 저장) 신규 서버 코드 추가 없이 그대로 적용 가능했음.
- **구현**:
  - `saveExportFile(filename, data, mimeType)` 공용 헬퍼 신설 — `/api/export`로 먼저 저장을
    시도하고, 성공 시 저장 경로를 안내하는 alert(`ai_saved_to`) 표시. **실패 시(예: 순수
    `python -m http.server`처럼 `/api/export` 라우트 자체가 없는 환경)에만** 기존 방식대로
    `Blob`+`<a download>`로 폴백하고, 이 경우 브라우저 다운로드 폴더에 저장됐음을 명시하는
    alert(`ai_saved_fallback`)를 표시 — "저장했다고 나오는데 실제로는 어디에도 없다"는
    상황이 다시는 생기지 않도록 항상 결과를 명확히 알림.
  - `exportExcel()`/`exportJpegs()`의 기존 `Blob`+`<a download>` 코드를
    `await saveExportFile(...)` 호출로 교체.
  - `_exportStamp()` 헬퍼로 파일명에 `YYYYMMDD_HHMMSS` 스탬프 부여(PST-3202 내보내기와 동일
    형식) — "당일 날짜로" 요청을 만족하면서도, 같은 날 여러 번 내보내도 이전 파일을 덮어쓰지
    않도록 시각까지 포함(날짜만 쓰면 재내보내기 시 조용히 덮어써지는 데이터 유실 위험이 있어
    한 단계 더 안전하게 처리).
  - `core.js`에 `ai_saved_to`(`{path}`)/`ai_saved_fallback`(`{name}`) i18n 키 추가(ko/en).
- **검증**: 헤드리스 브라우저로 실제 `server.py`(포트 8000)를 띄운 뒤, TEMP-DEBUG로 노출한
  `saveExportFile`을 직접 호출 — (1) 정상 경로: 실제 `/api/export`에 저장되어 프로젝트 루트에
  파일이 생성됨을 파일시스템에서 직접 확인(`TEST_EXPORT_20260715_140601.xlsx` 생성 및 내용
  일치 확인), (2) 폴백 경로: `fetch`를 몽키패치해 `/api/export` 실패를 강제 재현 →
  `<a download>` 경로로 넘어가 올바른 파일명으로 폴백 다운로드가 트리거됨을 확인(헤드리스
  환경에서 실제 다운로드 협상이 무한 대기하는 부작용이 있어 `HTMLAnchorElement.prototype.click`을
  몽키패치해 다운로드 트리거 여부만 검증). 두 시나리오 모두 통과 후 테스트 파일·TEMP-DEBUG
  export 제거, 파일 읽기 전용 속성 복원.
- **⚠️ EXE 미빌드**: 소스(`instruments/photo_editor.js`, `core.js`)에만 반영됨 — dist 동기화 및
  `dist/3M_Instrument_Logger.exe` 재빌드는 사용자 확인 후 진행 예정.

## 4-2. PST-3202 (GW Instek 3채널 DC 전원공급기)

### 기본 정보
- **파일**: `instruments/pst3202.js` (통합 앱), `C:\Users\0op64\.gemini\antigravity\scratch\PST-3202\index.html` (단독 프로그램 SSOT)
- **통신**: 9600 8N1, SCPI 명령, `\n` 종료
- **채널 사양**: CH1/CH2 최대 32V/2A, CH3 최대 6V/5A
- **viewType**: `'custom'` — `buildSidebar`, `buildCenter`, `buildRightPanel` 직접 구현

### 2026-07-03 완료 작업

#### CSS 클래스 불일치 수정 (`index.css`)
- JS가 `pst-sel`을 사용하는데 CSS에 `.pst-ch-card.selected` → `.pst-ch-card.pst-sel`로 수정 (4곳)
- JS가 `pst-v`/`pst-i`를 사용하는데 CSS에 `.v`/`.i` → `.pst-led-val.pst-v`, `.pst-led-val.pst-i`로 수정

#### `initTabLock()` 호출 타이밍 수정 (`pst3202.js`)
- 기존: `init()` 내부에서 호출 → DOM에 모달이 없는 상태라 탭락 미작동
- 수정: `buildCenter()` 끝에서 `el.innerHTML` 설정 후 호출

#### OVP 버튼 반응 없음 수정 (`pst3202.js`)
- 원인: `setOVP()`가 브라우저 `prompt()`를 사용 → pywebview/일부 환경에서 완전 차단
- 수정: `pstOvpModal` 커스텀 모달로 교체 (`applyOvp()`, `closeOvpModal()`, `_ovpCh` 상태 추가)

#### 불필요한 폴링 차단 (`pst3202.js`, `PST-3202/index.html`)
- 출력 OFF 상태에서도 항상 폴링하던 문제 수정
- `doPoll()`에 `|| !S.outputActive` 조건 추가 → 출력이 꺼져 있으면 폴링 생략

#### CH1↔CH2 동기화 토글 (`pst3202.js`, `index.css`)
- **배경**: 독립 모드에서 CH1·CH2에 동일 전압/전류를 설정하여 2개 샘플을 동시 평가하려는 용도
- **병렬 트래킹 주의**: 병렬/직렬 트래킹은 전류/전압을 물리적으로 결합 → 독립 샘플 2개 동시 측정 불가. 이 용도에는 반드시 독립 모드(Track = 0) + 동기화 토글을 사용할 것
- **UI**: CH1 카드와 CH2 카드 사이에 52px 폭 동기화 컬럼 배치 (`pst-sync-col`)
  - 동기화 ON: 흘러내리는 점 애니메이션(`pst-flow` 키프레임, 0s/0.3s/0.6s 지연 3점)
  - 독립 모드(Track=0)에서만 표시, 병렬/직렬 전환 시 자동 해제
- **동작**: CH1 Vset/Iset 변경 시 CH2도 동일값으로 즉시 복사 (`setV`/`setI` 내 `ch===1 && S.syncCh1Ch2 && S.trackMode===0` 조건)
- `setSyncCh1Ch2(on)` 함수 export

#### 병렬/직렬 트래킹 안내 툴팁 (`pst3202.js`)
- 병렬/직렬 라디오 레이블에 `⚠️` 추가 + `title` 속성으로 물리 배선 요구 및 독립 측정 불가 안내

#### OCP·OVP 툴팁 (`pst3202.js`)
- OCP 보호 라벨에 `title` 속성 추가 (과전류 자동 차단 설명)
- OVP 설정 버튼에 `title` 속성 추가 (임계 전압 초과 시 출력 차단 설명)

#### 그래프 제목 변경 (`pst3202.js`)
- "실시간 모니터링" → "📈 실시간 그래프"

#### CH2 그래프 표시 버그 수정 (`pst3202.js`)
- 원인: `activeGraphChannels()`가 `S.selectedCh`를 무조건 포함해 "사용 안함" 채널도 그래프에 표시됨
- 수정: `isChUsed(ch)` 헬퍼 추가, `activeGraphChannels()` 및 `isChannelActive()`에서 사용 토글 여부 우선 확인

#### 시스템 로그 UI 수정 (`index.css`)
- 모서리 직각 → 둥근 테두리: `border-top` → 전체 `border` + `border-radius:var(--radius)` + `overflow:hidden`
- 내부 어두운 배경 복원: `.pst-syslog`에 `background:var(--syslog-bg)` 추가

#### 자동 정지 토글 크기 확대 (`pst3202.js`, `index.css`)
- `pst-toggle-sw-lg` 클래스 추가 (48×26px, 기존 36×20px 대비 확대)

#### 라이트 테마 대응 — 그래프 배경·테두리 (`pst3202.js`, `PST-3202/index.html`)
- **핵심 함정**: `core.js`는 `document.body.classList.toggle('light', ...)` 방식으로 테마를 적용.
  `document.documentElement.dataset.theme === 'light'` 는 **절대 true가 되지 않음** (잘못된 감지).
- **올바른 감지**: `document.body.classList.contains('light')`
- `drawGraph()` 내 `isLight` 변수를 올바른 방식으로 수정
- 테마별 색상 객체 `T`(통합 앱) / `TC`(단독 프로그램): bg/grid/border/axis 4가지 색상 분기
- 테마 변경 시 그래프 자동 갱신: 테마 변경 → `_rebuildInstrumentSidebar()` → `onRebuild()` → `drawGraph()` 순으로 호출됨

#### 라이트 테마 대응 — LED 디스플레이 배경 (`index.css`, `PST-3202/index.html`)
- LED 디스플레이는 라이트 테마에서도 의도적으로 어두운 배경 유지 (계측기 디스플레이 느낌)
- **잘못된 선택자**: `:root[data-theme="light"]` → **올바른 선택자**: `body.light`
- 통합 앱: `body.light .pst-led-display { background: #12202e; }`
- 단독 프로그램: `body.light .led-display { background: #12202e; }`

#### 3채널 동기화 — CH1↔CH2↔CH3 (`pst3202.js`, `index.css`)
- **배경**: 독립 모드에서 CH1·CH2 동기화 ON 상태에서 CH3까지 동기화하여 3채널 동일 설정 평가 목적
- **상수**: `CH3_SYNC_MAX_I = 2` — CH3 물리 사양은 5A지만 3채널 동기화 시 2A로 제한 (안전)
- **상태**: `S.syncCh3: false` — CH1↔CH2 동기화 ON 상태에서만 표시 (`pstSyncCh3Row`)
- **`_effMaxV(ch)`**: CH3 동기화 ON 상태에서 CH1 편집 시 최대 전압을 `CH_MAX_V[3]`(6V)으로 반환, 그 외에는 `CH_MAX_V[ch]` 반환
- **`setSyncCh3(on)` 동작**:
  - ON: CH1의 현재 V/I를 CH3에 복사(전압 6V 캡, 전류 2A 캡), CH3 입력 잠금 (`pst-sync-lock`)
  - CH1 전압이 6V 초과 상태에서 ON 시: CH1·CH2·CH3 모두 6V로 즉시 클램프
  - `pstCh3Spec` 스펙 레이블 → `"0–6 V / 0–2 A (동기화)"`로 변경
  - `setSyncCh1Ch2` OFF 시 CH3 동기화도 자동 해제
- **사이클 편집기 적용**: `renderEditor()` → `_effMaxV(ch)` 사용 → CH3 동기화 ON 상태에서 전압 범위 레이블이 `(0–6V)`로 표시되고 입력값도 자동 클램프

#### 고정값 입력 실시간 검증 (`pst3202.js`, `index.css`)
- **`validateFixedField(ch, field)` 함수**: V/I 입력칸에 `oninput` 이벤트로 연결
  - 물리 최댓값 초과 시: 값을 즉시 최댓값으로 자동 조정 + 파란색 `↩ 최대 NV로 자동 조정됨` 메시지
  - CH3 동기화 ON + CH1 전압이 6V 초과 시: 파란색 `↩ 3채널 최대 전압(6V)으로 조정됩니다` 메시지 (Enter 시 `setV`에서 실제 클램프)
  - 0 미만 입력 시: 빨간색 `⚠ 0V/0A 이상 입력` 경고
  - 정상 범위: 메시지 제거
- **`pst-fix-warn` CSS** (`index.css`): `font-size:10px; color:#f87171; min-height:12px; white-space:nowrap`
  - V/I 입력칸 바로 아래 `<span id="pstFixWarnV{ch}">` / `<span id="pstFixWarnI{ch}>` 배치
- **`setV` / `setI` 변경**: alert 대신 자동 클램프 — 물리 최댓값 초과 시 값을 최댓값으로 수정 후 진행

#### 전류 입력 소수점 3자리 표준화 (`pst3202.js`)
- `setI()`, `setSyncCh1Ch2()`, `setSyncCh3()` 모두에서 전류 input 표시를 `val.toFixed(3)`으로 정규화
- 예: 입력 `2` → 표시 `2.000` (CH3와 동일 형식 통일)

#### 평가 목록 파일 내보내기/가져오기 — 다른 컴퓨터로 데이터 이동 (`pst3202.js`, `core.js`, 2026-07-05)
- **배경**: 측정 완료 시 `saveEvalRecords()`가 서버 옆 `PST3202_eval_data.json`에 자동 저장되지만
  (기존 기능, `server.py`/`package_exe.py`의 `/api/evaldata` 핸들러), 이 파일을 다른 컴퓨터로
  옮겨서 불러오는 UI가 없었음 — 사용자 요청으로 신규 추가.
- **내보내기(`exportEvalListFile`)**: 현재 `S.evalRecords` 전체를 `PST3202_records_<타임스탬프>.json`
  으로 브라우저 다운로드 (blob + `<a download>`, 서버 API 불필요 — 순수 클라이언트 사이드)
- **가져오기(`importEvalListFile` → 숨김 `<input type=file>` → `handleImportFile`)**:
  - `FileReader`로 JSON 파싱 → 배열 형식 검증, 실패 시 `pst_import_invalid` 경고
  - **병합 방식**: 기존 목록에 추가(치환 아님) — 사용자가 명시적으로 요청한 동작
  - **중복 제거**: `timestamp` 필드가 기존 레코드와 정확히 일치하면 건너뜀 (같은 날 같은 시간대
    동일 평가로 간주). 새로 추가되는 레코드는 `id`를 로컬 `S.nextEvalId`로 재할당(원본 파일의
    id는 무시 — 다른 컴퓨터의 id 시퀀스와 충돌 방지)
  - 가져오기 완료 후 자동으로 `saveEvalRecords()` 호출 → 병합 결과가 이 컴퓨터에도 영구 저장됨
  - 완료 안내 모달에 추가/중복제외 개수 표시 (`pst_import_done_msg`)
- **UI**: Data Table 패널에 `📤 목록 내보내기` / `📂 목록 가져오기` 버튼 추가 (Raw Data·저장·선택삭제 버튼 사이)
- **엑셀 내보내기와의 관계**: 가져온 레코드도 `S.evalRecords`에 정상 병합되므로, 기존
  `exportSelectedRawData()`(📥 Raw Data xlsx)로 체크박스 선택 후 그대로 엑셀 내보내기 가능
  — 별도 구현 불필요, 기존 경로 재사용
- **검증**: 헤드리스 브라우저로 `handleImportFile`을 실제 코드 경로로 호출해 3가지 시나리오 확인 —
  신규 2건 추가, 동일 데이터 재가져오기 시 0건 추가(중복 제거 정상), 잘못된 파일 형식 시 번역된
  경고 메시지 정상 표시

#### PST-3202 매뉴얼(MD + PDF) 갱신 — 접지 단자 설명, PDF 렌더링 버그 수정 (2026-07-08)
- **`docs/manuals/PST-3202.md`**: "2-1. 접지(GND) 단자는 언제 쓰나요?" 섹션 신설 — CH1↔CH2
  사이 접지 단자는 섀시(프레임) 접지이며 출력 +/−와 전기적으로 분리됨. 일반 저항체·전기탈착
  테이프 평가는 불필요, 직렬 트래킹 ±전원 구성이나 금속 지그 안전접지·노이즈 저감 목적일 때만
  사용. FAQ에 관련 질문 2건 추가.
- **PDF 소스 HTML(`pst3202_manual_print.html`, scratchpad 보관) 렌더링 버그 발견·수정**:
  - **번호목록(`<ol>`) 마커 미표시**: `* { margin:0; padding:0; }` 전역 리셋이 `<ol>`/`<ul>`의
    `padding-left`까지 0으로 만들어 `list-style-position:outside` 마커가 표시될 공간이 없어짐
    → 글머리 기호(•)는 좁은 공간에서도 살아남았지만 숫자(1. 2. 3.)는 완전히 사라짐. 헤드리스
    Edge로 PDF를 PNG 렌더링(PyMuPDF)해 시각적으로 확인 후 발견.
    **수정**: `ul, ol { padding-left: 24px; margin-left: 0; }`로 변경.
  - **`\n`이 원화기호(₩n)로 오식**: 한글 폰트에서 백슬래시(U+005C) 글리프가 ₩로 매핑되는
    현상 — "통신 사양" 표의 종단문자 항목. **수정**: 리터럴 백슬래시 대신 "LF (개행문자)"로 표기.
  - **번호목록이 페이지 경계에서 잘리며 레이아웃이 흔들리는 문제 방지**: `ol.step-flow {
    page-break-inside: avoid; }` 추가.
- **표지에 제품 사진 추가**: `assets/PST-3202.png`를 900px/JPEG 78%로 축소(약 80KB)해 base64
  인라인 삽입. 표지 여백이 과도했던 문제도 함께 해결(패딩·마진 축소).
- **문서 버전 v1.0 → v1.1로 갱신**, PDF 7페이지 → 9페이지로 확장.
- **⚠️ 향후 PDF 매뉴얼 제작 시 공통 주의사항**: `* { margin:0; padding:0; }` 같은 전역 리셋을
  쓰는 인쇄용 HTML에서는 리스트 마커가 사라질 수 있으니 `ul, ol`에 `padding-left`를 반드시
  명시할 것. 완성 후 PyMuPDF(`fitz`)로 PDF를 PNG 렌더링해 페이지별로 육안 검증하는 절차를
  거칠 것 — 브라우저 화면 미리보기와 실제 인쇄 렌더링 결과가 다를 수 있음.

#### 직렬(Series) 트래킹 — 그래프·엑셀을 CH1/CH2 합산 단일 값으로 표시 (`pst3202.js`, `core.js`, 2026-07-08)
- **배경**: 사용자가 직렬 트래킹 측정 시 CH1/CH2가 각자 값을 따로 보여주는 게 맞는지 질문 →
  전기적으로는 직렬이므로 전압은 합산(V1+V2), 전류는 공유(I1=I2, 더하지 않음)가 맞고, Excel
  내보내기 쪽엔 이미 이 계산 로직이 있었는데 그래프·시트 구조가 개별 표시와 혼재돼 있던 상태.
  확인 결과 "개별값은 의미 없다, 직렬 트래킹시에만 합산값만" 요청으로 확정.
- **그래프 (`graphSource`)**: `_seriesCombinedSource(ts, v, i)` 헬퍼 신설 — CH1(index 0)·CH2(index 1)
  raw 배열을 `vC[j] = v0[j]+v1[j]`, `iC[j] = i0[j]`로 합성해 **가짜 단일 채널(index 0)** 형태로
  반환. `drawGraph()`의 기존 채널별 순회 로직은 그대로 두고 `chIdxs:[0]`만 넘겨 자연스럽게 합산
  라인 하나만 그려지도록 함(예: 두 채널 30V 설정 시 그래프에 60V로 표시). Y축 자동 스케일도
  합산값 기준으로 자동 계산됨.
  - 라이브 상태(`S.trackMode===2`)와 과거 기록 보기(`rec.trackMode===2`, `S.viewingEvalId`) 양쪽
    모두 `_isSeriesGraphMode()`로 분기 처리.
- **그래프 범례**: 신설 `pstGliSeriesV`/`pstGliSeriesI` 항목("직렬 합산 V"/"직렬 합산 I") 추가.
  직렬 모드일 때 기존 CH1/CH2/CH3 범례는 전부 숨기고 이 둘만 표시(`updateGraphLegend()`).
  `viewEval()`/`viewLiveGraph()`에도 `updateGraphLegend()` 호출 추가(기존엔 `drawGraph()`만
  호출해 기록 전환 시 범례가 안 바뀌던 잠재 버그도 같이 해결).
- **Excel 내보내기 (`evalRecordBlocks`, `exportSelectedRawData`)**: 레코드별로 블록을 **하나만**
  반환하도록 구조 변경 — `trackMode===2`면 합산 컬럼(`시간, 전압(합계,V), 전류(합계,A)`) 블록,
  그 외(독립·병렬)는 기존 채널별 컬럼 블록. 기존에 있던 "채널별"+"합산"(직렬 레코드가 있을 때만
  추가) 2-시트 구조를 **시트 하나**로 통합 — 레코드마다 자기 트랙모드에 맞는 블록이 나란히 배치됨.
  `pst_x_sheet_sum` 키는 더 이상 안 쓰이지만 하위 호환 위해 T 테이블엔 유지.
- **검증**: 헤드리스 브라우저에서 `handleImportFile`로 직렬(CH1=CH2=30V/1A)·독립(12V/0.5A)
  레코드를 주입 → `exportSelectedRawData()` 실행 → 생성된 xlsx를 다시 xlsx 라이브러리로 파싱해
  셀 값 직접 확인: 직렬 레코드는 `60.000V / 1.000A` 단일 컬럼, 독립 레코드는 기존 `CH1_전압(V)`
  컬럼 유지, 시트 1개로 통합 확인. 범례 토글도 헤드리스로 실제 `setTM(2)`/`setTM(0)` 호출해
  표시/숨김 전환 검증.
- **신규 i18n 키**: `pst_series_v`/`pst_series_i` (ko/en).

#### 🔴 EXE에서 평가 기록이 저장 후 사라지는 버그 — `/api/evaldata` API가 EXE 서버에 없었음 (`build/package_exe.py`, 2026-07-08)
- **증상**: PST-3202에서 측정 후 "저장" 눌러도(성공 모달까지 뜸) EXE를 재시작하면 Data Table이
  비어 있음.
- **근본 원인**: `pst3202.js`의 `saveEvalRecords()`/`loadEvalRecords()`는 `/api/evaldata`
  GET/POST를 호출하도록 작성돼 있고, **`server.py`(브라우저 개발 모드)에는 이 라우트가 정상
  구현돼 있었지만, `build/package_exe.py`가 생성하는 EXE 내장 서버(launcher 템플릿)에는
  `/api/evaldata`·`/api/export` 라우트가 통째로 누락돼 있었음** — `/api/storage/*`(localStorage
  폴리필용), `/api/visa/*`, `/api/save-file`만 존재. EXE에서 POST하면 매칭 라우트가 없어
  `do_POST()`의 `else: super().do_POST()`로 떨어져 404 → `saveEvalRecords()`가 `catch(e)`에서
  **에러를 로그만 남기고 삼켜버려** `manualSaveRecords()`는 항상 "저장 완료" 모달을 보여줌
  (실패를 사용자가 알 수 없었음). 재시작 시 `loadEvalRecords()`도 404 → `if (!res.ok) return;`로
  조용히 실패.
- **수정**: `build/package_exe.py`의 launcher 템플릿에 `server.py`와 동일한 로직 이식 —
  `do_GET`에 `/api/evaldata`(EXE 폴더의 `PST3202_eval_data.json` 읽기, 없으면 `[]`), `do_POST`에
  `/api/evaldata`(임시파일→`os.replace`로 원자적 쓰기) 및 `/api/export`(Raw Data xlsx를 EXE
  옆에 저장) 추가. 경로는 `os.path.dirname(sys.executable)` 사용(EXE 실제 위치 기준).
- **검증 방법**: PyInstaller 빌드 없이 검증하기 위해, launcher 템플릿을 실제 렌더링한 뒤
  `webview` 임포트/창 실행 부분만 잘라내고 순수 `HTTPServer`만 별도 포트로 격리 실행 →
  `curl`로 GET(빈 배열)→POST(레코드 저장)→GET(방금 저장한 레코드가 그대로 반환)을 직접 확인해
  "재시작 후에도 유지" 시나리오를 실제로 재현·검증. `/api/export`도 별도로 파일 생성 확인.
- **⚠️ 향후 주의사항**: `server.py`(개발 서버)와 `build/package_exe.py`(EXE 내장 서버)는
  **완전히 별도로 관리되는 두 개의 HTTP 서버 구현**이다. 새 `/api/*` 엔드포인트를 `server.py`에
  추가할 때는 반드시 `package_exe.py`의 launcher 템플릿에도 동일하게 이식할 것 — 그렇지 않으면
  브라우저 모드에서는 되는데 EXE에서만 조용히 실패하는 버그가 재발한다. (참고:
  `/api/save-file`은 이미 두 서버 모두에 구현돼 있어 이런 문제가 없었음 — evaldata/export만
  이식이 누락됐던 것.)

#### 🔴 엑셀 내보내기 그래프가 빈 화면으로 나오는 버그 (`pst3202.js` — `drawOffscreenGraph`, 2026-07-08)
- **증상**: PST-3202 "📥 Raw Data (xlsx)"로 내보낸 엑셀의 "Graph" 시트에 축·격자선은 정상
  표시되지만 실제 전압/전류 곡선이 전혀 안 그려짐(빈 차트). Y축이 우연히 그럴듯한 값(예:
  0.6V/0.057A)으로 스케일되어 있어 "데이터는 있는데 렌더링만 안 되는" 것처럼 보였음.
- **근본 원인**: `drawOffscreenGraph(rec, width, height)` 함수에서
  ```js
  let chIdxs = [];
  if (rec.trackMode === 2) {
    src = _seriesCombinedSource(ts, v, i);
    chIdxs = src.chIdxs;           // 직렬 분기에서만 바깥 변수 갱신
  } else {
    const activeChs = activeChannelsOfRecord(rec);
    src = { ts, v, i, chIdxs: activeChs.map(c => c - 1) };  // src.chIdxs만 설정, 바깥 chIdxs 안 건드림
  }
  ```
  독립/병렬(`trackMode !== 2`) 레코드는 `src.chIdxs`만 채워지고 바깥 스코프의 `chIdxs` 변수는
  초기값 빈 배열로 남음 → Y축 자동스케일용 `vVals`/`iVals`도 빈 배열이 되어 fallback 기본값
  (0.5V×1.15, 0.05A×1.15)으로 계산됨(우연히 사용자 데이터와 비슷한 범위라 정상처럼 보였음) →
  실제 라인 그리기 루프 `chIdxs.forEach(...)`가 0번 실행되어 아무것도 안 그려짐.
- **수정**: `chIdxs`를 별도 `let`으로 미리 선언하지 않고, if/else 양쪽에서 `src`를 확정한 뒤
  `const chIdxs = src.chIdxs;`로 한 번만 파생하도록 변경 — 분기별로 별도 갱신할 필요가 없어짐.
- **진단 방법**: `CanvasRenderingContext2D.prototype`의 `moveTo`/`lineTo`/`stroke`/`beginPath`를
  헤드리스 브라우저에서 몽키패치해 실제 호출 횟수를 계측 → 격자선 그리기(6회)만 호출되고 데이터
  라인 그리기 호출이 0회임을 확인해 `chIdxs`가 비어있음을 특정. 수정 후 재계측으로 라인 호출이
  정상적으로 늘어남을 확인, 최종적으로 `<img>` 태그 렌더링 + 헤드리스 스크린샷으로 실제 곡선이
  그려지는 것까지 육안 검증.
- **참고**: 이 함수는 `pst3202.js`의 다른 세션(작업 시각상 "안티그래비티")에 의해 ExcelJS 기반
  엑셀 생성 로직(Sheet1 데이터 + Sheet2 그래프 이미지)과 함께 새로 추가된 코드였음 — 기존
  `evalRecordBlocks()`(직렬 합산 로직 포함)는 그대로 재사용하고 있어 호환성 문제는 없었음.

#### 부수적으로 발견한 i18n 누락 2건 수정 (`pst3202.js` — `setOvpDirect`, `setV`)
- OVP가 설정 전압보다 낮을 때 자동 조정 경고, 전압이 OVP 한계로 클램핑될 때 경고 — 둘 다
  최근 추가된 기능인데 `t()` 없이 한글이 하드코딩돼 있어 영어 모드에서도 한글로 표시되던 문제.
  `pst_ovp_below_vset`/`pst_v_ovp_limited` 키 신설, `tf(...)`로 교체.

#### 2026-07-08: 엑셀 내보내기 — Graph 시트 레이아웃을 Raw Data 시트와 동일하게 우측 순차 배치로 변경 (`pst3202.js`)
- **요청 배경**: 여러 평가 기록을 선택해 엑셀로 내보내면 Sheet1("채널별")은 레코드마다 좌→우로
  이어 붙는데, Sheet2("Graph")는 레코드마다 위→아래로 쌓이는 방식이라 두 시트의 레이아웃이
  서로 달랐음. Sheet1과 동일하게 "제목 위 / 그래프 아래, 레코드마다 우측으로 이어짐" 패턴으로
  통일해달라는 요청.
- **구현**: 기존 `let graphRow`로 아래로 누적하던 방식을 제거하고, Sheet1의
  `let colOffset=0; blocks.forEach(b=>{ b.startCol=colOffset; colOffset += b.headers.length+GAP; })`
  패턴을 그대로 차용해 컬럼 오프셋 기반으로 재작성.
  - `GRAPH_COL_WIDTH=9`(엑셀 문자 단위), `GRAPH_COL_PX = GRAPH_COL_WIDTH*7`(픽셀 변환 시
    의도적으로 보수적(과소)으로 계산 — 실제 Excel 컬럼→픽셀 변환 공식보다 여유를 둬서
    이미지가 겹치지 않도록 안전 마진 확보)
  - `imgCols = Math.ceil(imgWidth / GRAPH_COL_PX)` — 이미지(600px) 폭을 담는 데 필요한 컬럼 수
  - `GRAPH_GAP_COLS=2` — 블록 사이 여백 컬럼 수(넉넉하게 2컬럼)
  - `colsPerBlock = imgCols + GRAPH_GAP_COLS`, 레코드 `idx`마다 `startCol = idx * colsPerBlock`
  - 제목 셀은 `TITLE_ROW=1`에 고정, `ws2.mergeCells(...)`로 블록 폭만큼 병합(다음 블록과 시각적
    분리) — 그래프 이미지는 `IMAGE_ROW=2`부터 같은 `startCol`에 앵커
- **부가 개선 (사용자 추가 요청 "그래프는 서로 겹쳐지지않게 출력해주고 전압 전류 잘 표시되게 해줘")**:
  - `drawOffscreenGraph()`에 실시간 화면 그래프와 동일한 채널별 색상(`GV`/`GI`)을 사용하는
    범례(legend)를 캔버스 상단에 직접 그려 넣음 — 색상 스와치(실선=V, 점선=I) + 라벨
    (`CH1 V`/`CH1 I`, 직렬 트래킹 시 `직렬 합산 V`/`직렬 합산 I`, `t()` 기반이라 언어 전환 반영)
  - 범례 공간 확보를 위해 캔버스 상단 패딩 `P.t`를 25→44로 확대
  - 기존에 좌/우 축 구석에 있던 단일 문자 `V`/`A` 라벨(범례와 중복, 색상도 실제 채널과 무관하게
    고정값이었음)은 제거 — 범례가 이를 대체
- **검증**: 헤드리스 Edge로 `drawOffscreenGraph()`를 독립적으로 호출하는 테스트 페이지를 만들어
  (1) 2채널 독립 모드, (2) 직렬 트래킹(합산) 모드, (3) 3채널 독립 모드 각각을 렌더링한 뒤
  스크린샷으로 육안 확인 — 채널별 범례 색상이 실제 라인 색상과 정확히 일치하고, 겹침 없이
  가독성 있게 표시됨을 확인. (Sheet2의 컬럼 오프셋 계산 자체는 ExcelJS CDN 의존성 때문에
  헤드리스로 직접 실행하지 않고 픽셀 수학으로 별도 검증: `imgCols=10`×`GRAPH_COL_PX=63`=630px
  ≥ 이미지 600px, 다음 블록까지 갭 2컬럼(126px) 확보 — 겹침 불가능함을 계산으로 확인.)

#### 2026-07-08: PST-3202 매뉴얼 PDF v1.2 갱신 — Graph 시트 섹션 추가 + 인쇄용 HTML 소스를 저장소에 보관
- **요청 배경**: 위 Graph 시트 레이아웃 변경 내용을 사용자 매뉴얼(MD)에도 반영해달라는 요청 →
  이어서 PDF도 같이 갱신해달라는 요청. v1.1(2026-07-04) 작업 당시 PDF 소스였던
  `pst3202_manual_print.html`이 세션 임시 scratchpad에만 있었고 저장소에 커밋되지 않아
  이번 세션 시작 시점엔 이미 사라진 상태 — **처음부터 다시 작성**해야 했음.
- **`docs/manuals/PST-3202.md`에 "10-2. 📥 Raw Data (xlsx) — 엑셀로 내보내면 어떤 모습인가요?"
  섹션 신설**: Sheet1(채널별)/Sheet2(Graph) 2-시트 구성, 우측 순차 배치 패턴, V/I 범례 설명.
  실제 `drawOffscreenGraph()`를 헤드리스로 호출해 만든 샘플 이미지(`assets/pst3202_excel_graph_sample.png`,
  2채널 독립 모드 예시)를 삽입 — 목업이 아닌 실제 함수 출력물.
- **PDF 소스를 이번엔 저장소에 보관**: `docs/manuals/PST-3202_manual_print.html`로 커밋 —
  scratchpad에만 두면 다음 세션에서 또 유실되는 문제(위 v1.1 항목 참고)가 재발하므로, 앞으로는
  이 파일을 직접 수정 → 아래 명령으로 재빌드하는 방식을 표준 절차로 함:
  ```powershell
  & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu `
    --print-to-pdf="docs\manuals\PST-3202_사용자매뉴얼.pdf" --no-pdf-header-footer `
    --run-all-compositor-stages-before-draw --virtual-time-budget=5000 `
    "file:///$PWD\docs\manuals\PST-3202_manual_print.html"
  ```
  이미지(표지 사진, 샘플 그래프)는 base64로 인라인 삽입돼 있어 HTML 파일 하나만으로 완결됨.
- **🆕 신규 발견 버그 — 목차(TOC) 두 자리 번호(10.~12.)의 "1"이 잘려 보이는 문제**:
  `<ol>` 기반 목차에서 항목이 10개를 넘어가자 10번·11번·12번 항목의 마커가 `10.`이 아니라
  `l0.`처럼 앞자리 "1"이 세로선만 남고 잘려서 렌더링됨 (단순히 얇게 보이는 게 아니라 실제
  글리프 일부가 잘려나감 — PyMuPDF로 페이지를 8배 확대 렌더링해 확인). `padding-left`를
  24px→34px로 늘려도 동일하게 재현되어 **여백 부족 문제가 아님**을 확인. `list-style-position:
  inside` + 음수 `text-indent` 조합으로도 해결 안 됨(오히려 마커 전체가 페이지 밖으로 밀려남).
  **원인은 특정되지 않았으나** 브라우저의 `<ol>` 카운터/마커 렌더링 파이프라인이 두 자리 숫자
  마커에서 Malgun Gothic 폰트와 상호작용하며 글리프가 깨지는 것으로 추정(§9의 `\n`→₩ 폰트
  치환 버그와 같은 계열의 "한글 윈도우 인쇄 렌더링 폰트 이슈"로 보임).
  **회피책**: 브라우저 자동 카운터(`<ol>`)에 의존하지 말고, 번호가 10 이상까지 갈 수 있는
  목록은 번호를 리터럴 텍스트로 직접 타이핑해 `<div class="toc-item"><span class="num">10.</span>
  ...</div>` 형태로 작성 — 본문의 일반 텍스트 숫자(`5분`, `0.5A`, `32V` 등)는 모두 정상
  렌더링되는 것으로 봐서 문제는 자동 생성된 마커 카운터에 한정됨.
- **검증**: PyMuPDF로 10페이지 전부 PNG 렌더링해 육안 전수 검사 — 표지, 목차(수정 후 1.~12.
  모두 정상 표시), 접지 단자 표, 화면 구성 다이어그램, OCP/OVP 표, 신규 10-2 섹션의 샘플
  그래프 이미지, FAQ, 통신 사양 표까지 전부 확인. 통신 사양 섹션 마지막 줄이 다음 페이지로
  혼자 넘어가 고아 줄(orphan line)이 되는 사소한 문제를 발견해 별도 `<p>` 대신 표의 마지막
  행으로 합쳐 해결(표 전체가 `page-break-inside:avoid`라 통째로 다음 페이지로 이동함).
- **문서 버전 v1.1 → v1.2로 갱신**, PDF 9페이지 → 10페이지로 확장(10-2 섹션 추가분).

#### 2026-07-08: 직렬 트래킹 전류값 — CH1 값 단독 사용 → CH1·CH2 평균으로 변경 (`pst3202.js`, `core.js`)
- **배경**: 직렬 트래킹은 전기적으로 CH1·CH2 전류가 동일(공유)해야 하므로 기존엔 CH1 측정값을
  그대로 "합산 전류"로 사용했음. 사용자 요청: 전압은 지금처럼 합산이 맞지만, 전류는 CH1 값만
  쓰지 말고 **CH1·CH2 두 채널 측정값의 평균**을 기록하도록 변경 — 이론상 두 채널 전류가
  같아야 하지만 실측값은 미세하게 다를 수 있어 평균이 더 대표성 있는 값이라는 판단.
- **수정 위치 2곳** (전압 합산 로직은 그대로 유지, 전류 계산만 변경):
  - `_seriesCombinedSource(ts, v, i)`: `iC[j] = (i[0][j]||0)` → `iC[j] = ((i[0][j]||0) + (i[1][j]||0)) / 2`.
    이 함수는 실시간 그래프(`graphSource`)와 엑셀 Graph 시트 이미지(`drawOffscreenGraph`) 양쪽에서
    공용으로 쓰이므로 한 곳만 고치면 두 군데 모두 반영됨.
  - `evalRecordBlocks(rec, number)`의 `trackMode===2` 분기: `isum = valI0` → `iavg = (valI0+valI1)/2`로
    변경 — 엑셀 "채널별" 시트의 Raw Data 테이블(시간/전압합계/전류) 컬럼에 반영.
- **라벨 갱신** (`core.js`): 값이 더 이상 "합계"가 아니므로 `pst_x_isum`(엑셀 헤더) "전류(합계,A)"
  → "전류(평균,A)"(EN: `Current(Sum,A)`→`Current(Avg,A)`), `pst_series_i`(그래프 범례) "직렬 합산 I"
  → "직렬 평균 I"(EN: `Series Combined I`→`Series Avg I`)로 수정. 전압 쪽 라벨(`pst_x_vsum`,
  `pst_series_v`)은 여전히 합산이 맞으므로 변경하지 않음.
- **검증**: 헤드리스로 `_seriesCombinedSource`와 `evalRecordBlocks`를 직접 호출 — CH1=[1.0,1.2,1.4]A,
  CH2=[0.8,1.0,1.2]A 합성 데이터에서 그래프 소스는 `[0.9,1.1,1.3]`(평균), 엑셀 행은
  `["20.000","0.900"]` 형태로 전압 합계·전류 평균이 정확히 계산됨을 확인.

#### 2026-07-08: Data Table "제품명" 엑셀 스타일 다중 선택 필터 추가 (`pst3202.js`, `core.js`, `index.css`)
- **요청 배경**: 사용자가 Data Table 스크린샷을 보여주며 제품명(이름) 컬럼도 필터링하고 싶다고
  요청 — 단, 기존 트래킹모드/모드 등의 단일 `<select>` 방식이 아니라 "엑셀 필터링처럼 여러 개
  선택"하고 싶다고 명시 (예: `샘플1`, `샘플1-개선품`, `샘플1-NEW개선품`을 동시에 선택해서 3개
  다 보이게). 체크박스 형태로 만들어달라는 구체적 UI 요청까지 포함.
- **상태 모델** (`S.evalFilters.names`): `null`(필터 미사용=전체표시) 또는 문자열 배열(체크된
  이름 목록). 패널을 처음 열 때 `null`이면 현재 존재하는 모든 이름으로 초기화(=전부 체크된 채로
  시작, 엑셀과 동일한 기본 동작). 이후 체크 해제/재체크할 때마다 배열을 갱신. **배열이 빈
  배열(`[]`)이면 "전부 해제" 상태로 간주해 0건 표시** — `null`(필터 없음)과 `[]`(전부 해제)를
  구분해야 "전체 해제" 버튼이 의미를 가짐 (구분 안 하면 빈 배열도 "필터 없음=전체표시"로
  해석되어 버튼이 무의미해지는 함정이 있었음).
- **UI**: `제품명` 헤더 셀에 `position:relative` 부여 후, 현재 선택 요약(`전체`/`표시 안 함`/
  `N개 선택`)을 보여주는 버튼 + 그 아래 절대위치 드롭다운 패널(`#pstNameFilterPanel`) 추가.
  패널 안에 `전체 선택`/`전체 해제` 버튼과 체크박스 목록(`#pstNameFilterList`, 스크롤 가능).
  패널 바깥 클릭 시 자동으로 닫히도록 `document`에 클릭 리스너를 추가하되, **`toggleNameFilterPanel()`
  최초 1회 호출 시에만 등록**(`S._nameFilterDocListenerAdded` 플래그)하여 테마 전환 등으로
  `buildCenter()`가 재호출돼도 리스너가 중복 누적되지 않도록 함 — 리스너 내부는 매번 `$(id)`로
  DOM을 새로 조회하므로 재빌드된 DOM에도 항상 올바르게 동작.
- **신규 함수**: `distinctEvalNames()`, `toggleNameFilterPanel()`, `updateNameFilterList()`,
  `updateNameFilterSummary()`, `toggleNameFilterValue(name, checked)`, `setAllNameFilters(all)`.
  `renderEvalTable()`에 `(filters.names === null || filters.names.includes(rec.name))` 조건 추가,
  `updateNameFilterList()` 호출도 추가(다른 dynamic filter들과 동일 패턴).
- **XSS 방지**: 체크박스 `onchange`에 이름 문자열을 직접 JS 인자로 삽입하지 않고
  `data-name="${escAttr(n)}"` 속성 + `this.dataset.name`으로 읽는 방식 사용 — 기존 `esc()`
  헬퍼는 따옴표를 이스케이프하지 않아(코드베이스 전반의 기존 한계) 속성값에 그대로 못 씀,
  로컬 `escAttr`(esc + 따옴표 이스케이프 추가)로 이 필터 UI에서만 안전하게 처리.
- **신규 i18n 키**: `pst_none`, `pst_n_selected`(`{N}` 플레이스홀더), `pst_select_all`,
  `pst_select_none` (ko/en).
- **CSS**: `.pst-namefilter-btn/panel/actions/list/item/empty/caret` 신규 추가 (`index.css`).

#### 2026-07-08: 평가 목록 내보내기/가져오기 버튼 복구 (`pst3202.js`)
- **문제 발견**: 사용자가 "데이터 테이블에 불러오기 버튼도 넣어줘"라고 요청했는데, 확인해보니
  `exportEvalListFile`/`importEvalListFile`/`handleImportFile` 함수와 관련 i18n 키
  (`pst_list_export_btn`/`pst_list_import_btn`)는 이미 존재하고 export 리스트에도 등록돼
  있었음 — **그런데 정작 Data Table 패널의 버튼 HTML과 숨김 `<input type=file id="pstImportFileInp">`
  가 없어서 실제로는 이 기능에 접근할 방법이 전혀 없었음**. AGENTS.md(2026-07-05 항목)에는 이미
  구현 완료로 기록돼 있었으나 실제 코드와 문서가 어긋나 있던 사례 — 다른 세션의 리팩터링(예:
  `exportSelectedRawData()` ExcelJS 전면 재작성) 과정에서 버튼 마크업만 유실된 것으로 추정.
- **수정**: Data Table 패널의 `pst-gctrls` 버튼 줄에 `📤 목록 내보내기`/`📂 목록 가져오기` 버튼과
  숨김 파일 입력을 `📥 Raw Data (xlsx)`와 `저장` 버튼 사이에 복구.
- **검증**: 헤드리스로 `handleImportFile()`을 실제 코드 경로로 2회 연속 호출(동일 4건 데이터) —
  1차 호출 후 4건 정상 표시, 2차(동일 timestamp) 재호출 후에도 여전히 4건(중복 0건 추가)으로
  기존 타임스탬프 기반 중복 제거 로직이 정상 동작함을 재확인. 사용자가 요청한 "동일한 시간대
  동일한 결과 파일 중복일 경우 깔끔하게 하나만 표시" 요구사항을 기존 로직이 이미 충족.
- **⚠️ EXE 미빌드**: 사용자가 "아직 EXE 파일 만들지 말고 이번 내용 수정부터 해줘"라고 명시적으로
  요청 — 이번 두 항목(이름 필터, 가져오기 버튼 복구)은 소스(`instruments/pst3202.js`, `core.js`,
  `index.css`)에만 반영되고 **dist 동기화 및 EXE 재빌드는 보류**됨. 다음 EXE 요청 시 반드시
  `dist/3M_Instrument_Logger/instruments/pst3202.js`·`core.js`·`index.css` 동기화 먼저 할 것.

#### 2026-07-08: 🔴 독립 모드에서 CH2/CH3 "사용" 토글 시 그래프가 갱신되지 않는 버그 수정 (`pst3202.js`)
- **사용자 신고**: "독립으로 2채널 3채널 켜고 껐을 때 1채널이 그래프가 안보이는 버그가 있어"
- **원인**: CH1/CH2/CH3 채널 카드의 "사용" 체크박스 `onchange`는 `syncTrackingSettings()`를
  호출하는데, 이 함수는 끝에서 `updateGraphLegend()`(범례 텍스트만 갱신)만 호출하고
  **`drawGraph()`(실제 캔버스 다시 그리기)는 전혀 호출하지 않았음**. 그 결과 출력이 꺼져 있는
  상태(폴링이 돌지 않아 `recordGraphData()`가 캔버스를 재갱신할 기회가 없는 상태)에서 채널
  "사용" 토글을 바꾸면, 범례는 새 채널 구성을 반영해 즉시 바뀌지만 **캔버스에는 토글 이전
  채널 구성으로 그려진 옛 그림이 그대로 남아있어** 범례-실제 그림이 서로 어긋나는 상태가 됨 —
  예: CH2·CH3를 껐는데도 캔버스에는 CH2·CH3 라인이 남아있는 옛 그래프가 그대로 보이고, 그
  틈에서 CH1 라인이 상대적으로 묻혀 "안 보이는" 것처럼 인식됨.
  - `activeGraphChannels()`/`graphSource()`/`isChUsed()`의 채널 판정 로직 자체는 정상이었음
    (헤드리스로 직접 검증 — CH1은 모든 단계에서 `chIdxs`에 항상 포함됨). 문제는 순수하게
    "판정은 맞는데 화면 갱신 트리거가 빠짐"이었음.
- **진단**: `CanvasRenderingContext2D.prototype.stroke`를 몽키패치해 호출 횟수를 계측 —
  출력 OFF 상태에서 CH2/CH3 사용 토글을 끈 직후 `stroke()` 호출 0회로 캔버스가 전혀
  재갱신되지 않음을 확인. 수정 후 동일 테스트에서 호출 발생(정상)으로 재검증.
- **수정**: `syncTrackingSettings()` 끝의 `updateGraphLegend();` 바로 다음 줄에 `drawGraph();`
  한 줄 추가 — `drawGraph()`는 데이터가 부족하거나(`n<2`) 캔버스 크기가 0이면 안전하게
  조기 반환하므로 부작용 없음.
- **검증**: 헤드리스로 CH1 단독 → CH2+CH3 켜짐 → CH2+CH3 꺼짐(재현 시나리오) 3단계를 실제
  `recordGraphData()`/체크박스 `change` 이벤트로 재현, 각 단계 캔버스를 `toDataURL()`로
  캡처해 육안 확인 — 수정 후 모든 단계에서 CH1 라인(파란 실선/초록 점선)이 정상 표시됨.

#### 2026-07-08~09: Data Table에 측정 소요 시간 열 추가 (+ "번호" 열 제거) — 3차 수정 끝에 확정 (`pst3202.js`, `core.js`, `index.css`)
- **요청 변천사** (같은 기능을 두 번 더 고쳐야 했던 사례 — 기록해둠):
  1. "데이터 테이블에 샘플의 측정 시간도 표시하면 좋겠어, 즉 한 샘플의 측정 완료 시간" → 완료
     시각(`HH:MM:SS`)으로 1차 구현.
  2. 사용자 정정: "종료시간이라기보단 측정 시간을 알고 싶어. 몇초 걸렸는지 몇분걸렸는지" →
     완료 시각이 아니라 **소요 시간(duration)** 이 맞는 요구사항이었음이 드러남. 날짜 셀
     아래에 `<br>`로 두 번째 줄을 붙이는 방식으로 2차 구현(`evalDurationStr`).
  3. 사용자가 "그럼 줄 칸이 커지지 않아?"라고 재질문 → 실측해보니 행 높이가 26px→50px로
     거의 2배 증가함을 실제로 확인(다른 열은 전부 한 줄인데 날짜 칸만 두 줄이라 행 전체가
     그 기준으로 늘어남). 해결 방법을 사용자에게 직접 질문 → "넘버링(번호) 칸 제거하고
     맨 우측에 [소요 시간] 추가"로 확정. "테스트 완료 시간"이라는 표현이 다시 나와 혼동
     방지차 재확인 질문 → 소요 시간이 맞음을 최종 확인.
- **최종 구현**:
  - 날짜 셀(`pst-eval-date`)은 다시 원래대로 한 줄(날짜만)로 되돌림 — `<br>`/`.pst-eval-time`
    스택 제거.
  - `pst_th_num`("번호") 열(헤더+바디 `td.pst-eval-num`) 완전 제거. `evalNumbering()` 함수 자체는
    엑셀 내보내기 파일명(`"${rec.name} #${number}"`) 등 다른 곳에서 여전히 쓰이므로 그대로 둠 —
    **테이블 컬럼 표시만 제거**, 넘버링 로직은 안 건드림.
  - 맨 우측(전류 최대값 다음)에 새 컬럼 `pst_th_duration`("소요 시간") 추가, `td.pst-eval-duration`에
    `evalDurationStr(rec)` 표시. 컬럼 총 개수는 10개로 동일(번호 제거 -1, 소요시간 추가 +1) —
    `colspan="10"` 빈 상태 표시는 수정 불필요.
  - `evalDurationStr(rec)`: `rec.raw.ts` 배열의 첫/마지막 타임스탬프 차이로 계산. 1시간 미만이면
    `3m 24s`, 1시간 이상이면 `1h 5m` 형식(`pst_u_h`/`pst_u_m`/`pst_u_s` 기존 단위 키 재사용, 라이브
    그래프 `pstTestElapsed`와 동일한 포맷 규칙). 데이터 1포인트 이하면 `-`.
- **검증**: 헤드리스로 `evalDurationStr()` 단위 테스트(45초→`45s`, 204초→`3m 24s`, 3900초→`1h 5m`,
  1포인트 이하→`-`) + 실제 `buildCenter()`+`handleImportFile()`로 2개 레코드를 렌더링한 뒤
  스크린샷으로 행 높이가 헤더 행과 동일한 한 줄 높이로 돌아왔는지, "소요 시간"이 맨 우측 열에
  정상 표시되는지 육안 확인. (`getBoundingClientRect()`로 잰 수치가 헤드리스 환경에서 스크린샷과
  안 맞는 경우가 있어 — 최종적으로는 스크린샷 육안 확인을 신뢰함.)

#### 2026-07-08: 🔴 체크된 샘플 재측정 시 확인 없이 덮어쓰던 문제 — 확인/취소 팝업 추가 (`pst3202.js`, `core.js`)
- **사용자 신고**: "데이터테이블 샘플 체크하고 재측정할경우 덮어씌우시겠습니까? 팝업창 띄워서
  확인 OR 취소 가능하게 해줘야할꺼같아"
- **기존 동작 확인**: `createEvalRecord()`(측정 완료 시 자동 호출)에 이미 "체크된 기록이
  정확히 1개면 그 기록에 덮어쓴다"는 로직이 있었는데(샘플 재측정 워크플로용으로 의도된 기능),
  **확인 절차 없이 무조건 덮어써서** 실수로 체크박스를 켜둔 채 새 측정을 하면 이전 데이터가
  조용히 사라지는 위험이 있었음.
- **수정**: 이미 삭제 확인에 쓰이던 범용 Promise 기반 `showConfirm(msg)` 모달을 재사용하되,
  OK 버튼 라벨과 제목도 상황에 맞게 바꿀 수 있도록 `showConfirm(msg, okLabel, title)`로 확장
  (기존 삭제 확인 호출부는 인자를 안 주므로 그대로 `'삭제'`/`'평가 기록 삭제'` 기본값 사용,
  호환성 문제 없음). `pstConfirmModalTitle` id를 제목 요소에 추가해 JS로 갱신 가능하게 함.
  `createEvalRecord()`를 `async`로 바꾸고, 체크된 기록이 1개일 때
  `await showConfirm(tf('pst_overwrite_confirm',{name}), t('pst_overwrite_ok'), t('pst_overwrite_title'))`
  로 확인을 받은 뒤에만 덮어쓰기 진행. **취소 시 기존 체크된 기록은 전혀 건드리지 않고, 방금
  측정한 데이터는 안전하게 새 기록으로 별도 저장**(데이터 유실 없음 — "취소했는데 방금 측정
  데이터가 사라진다"는 최악의 UX를 피하기 위한 설계 판단).
- **신규 i18n 키**: `pst_overwrite_title`, `pst_overwrite_confirm`(`{name}` 플레이스홀더),
  `pst_overwrite_ok`, `pst_log_overwrite_cancel` (ko/en).
- **검증**: 헤드리스로 체크된 기존 기록 1개 + 새 측정 데이터를 준비한 뒤 (1) 취소 클릭 시나리오
  — 기존 기록 원본 데이터 불변 확인 + 새 기록이 별도로 생성됨을 확인, (2) 확인(덮어쓰기) 클릭
  시나리오 — 기존 기록이 새 데이터로 정확히 덮어써지고 레코드 개수가 늘지 않음을 확인. 두
  시나리오 모두 실제 `createEvalRecord()`/`closeConfirmModal()` 코드 경로로 재현·검증.

#### 2026-07-09: "기록 보기 중" 배지를 클릭하면 실시간 화면으로 복귀 (`pst3202.js`, `core.js`, `index.css`)
- **요청**: 과거 평가 기록을 클릭해 그래프를 보고 있을 때(`viewEval()` 호출 후 `#pstViewingBadge`
  가 "📌 기록 보기 중"으로 표시됨) 그 배지를 눌러서 기록 보기를 끄고 실시간 측정 대기 화면으로
  돌아가고 싶다는 요청 — 기존엔 이 배지가 단순 상태 표시용 `<span>`이라 클릭해도 아무 반응이
  없었음.
- **수정**: 되돌리는 로직(`viewLiveGraph()` — `S.viewingEvalId = null` 설정 후 배지 숨김,
  범례·그래프 재갱신)은 이미 구현돼 있었고 "선택 삭제" 등 다른 경로에서만 쓰이고 있었음 —
  배지에 `onclick="app.instr.viewLiveGraph()"`만 연결하면 되는 상황. `cursor:pointer`, 클릭
  가능함을 알려주는 `title` 툴팁, 배지 텍스트 끝에 `✕` 표시 추가로 클릭 가능하다는 것을
  시각적으로 명확히 함. `#pstViewingBadge:hover{opacity:.8}` 호버 효과도 추가.
- **신규 i18n 키**: `pst_viewing_exit_hint` (ko/en, 툴팁 텍스트).
- **검증**: 헤드리스로 `viewEval(1)` 호출 후 배지 `display`/`onclick`/`cursor`/`title` 속성을
  전부 확인, 이어서 `badge.click()`으로 실제 클릭을 재현 → `S.viewingEvalId`가 `null`로
  돌아오고 배지가 다시 숨겨짐을 확인.

#### 2026-07-09: 🔴 독립→병렬 트래킹 전환 시 CH3 잠김 + CH2 실시간 미러링 안 됨 버그 수정 (`pst3202.js`)
- **사용자 신고**: 스크린샷과 함께 — "독립에서 3채널까지 킨 다음 병렬 트래킹 눌렀는데. 이러면
  자동으로 3채널이 토글이 꺼지고, 2채널 입력이 비활성화가 되어 1채널 값을 입력하면 2채널의
  데이터는 1채널 데이터를 참고해서 데이터가 자동으로 들어가게 해줘야지"
- **원인 3가지 (모두 같은 시나리오에서 발생)**:
  1. **`updateTrackModeUI()`의 CH3 카드 잠금 조건이 너무 넓었음**: `const isTracking =
     S.trackMode !== 0;`로 되어 있어 **병렬(Parallel)·직렬(Series) 두 모드 모두** CH3 카드
     전체(`pointer-events:none` 포함)를 잠갔음. 그런데 `isChUsed()`/`useRowVis(3, tm===0||tm===1)`
     의 설계 의도는 **CH3가 병렬 모드에서는 독립된 3번째 채널로 계속 사용 가능**해야 하는 것 —
     직렬 모드에서만 CH3가 참여 불가능함(전기적으로 CH1+CH2가 합쳐지므로). 즉 병렬 모드에서
     CH3의 "사용" 토글 자체가 `pointer-events:none`으로 눌러도 반응 없는 상태가 되어, 독립
     모드에서 미리 켜져 있던 CH3 사용 상태를 사용자가 끌 방법이 없었음(이게 스크린샷에서 CH3
     카드가 흐리게 잠긴 채로 보이던 이유).
  2. **`setTM()`이 독립 모드로 "돌아올 때"만 CH2/CH3 사용 토글을 초기화**: `if (S.trackMode ===
     0) { ...토글 끄기... }` — 독립 → 병렬/직렬로 **나가는** 방향의 전환에는 아무 초기화 로직이
     없어서, 독립 모드에서 켜뒀던 CH3 사용 상태가 그대로 새 모드로 넘어와 화면과 실제 의도가
     어긋났음.
  3. **`setV(1)`/`setI(1)`이 병렬 모드에서 CH2로 값을 전파하지 않음**: CH1→CH2 미러링 조건이
     `S.syncCh1Ch2 && S.trackMode === 0`(독립 모드의 명시적 동기화 토글)로만 걸려있어, 병렬
     트래킹 모드(`trackMode===1`)에서는 CH1 값을 입력해도 CH2 입력창과 실제 SCPI 명령
     (`:CHANnel2:VOLTage`/`:CURRent`) 둘 다 갱신되지 않았음. `syncTrackingSettings()`가
     모드 전환 "그 순간"의 CH1 값으로 CH2를 한 번 잠가서 보여주긴 하지만(`lockCh(2, true, v1,
     i1)`), 이후 사용자가 CH1 값을 다시 바꾸면 CH2 표시가 갱신되지 않고 그대로 멈춰있었음.
- **수정**:
  1. `updateTrackModeUI()`: `isTracking = S.trackMode === 2`로 변경 — 병렬 모드에서는 CH3 카드가
     더 이상 잠기지 않고 정상적으로 상호작용 가능.
  2. `setTM(mode)`: `if (S.trackMode === 0)` → `if (prevMode !== S.trackMode)`로 확장 — 어느
     방향이든 모드가 실제로 바뀌면 CH2/CH3 사용 토글을 초기화해 새 모드에서 다시 명시적으로
     켜야 하도록 통일(독립 모드로 돌아올 때만 초기화하던 기존 동작과 대칭).
  3. `setV(1)`/`setI(1)`: CH2 미러링 조건을 `(S.syncCh1Ch2 && S.trackMode === 0) || S.trackMode
     === 1`로 확장 — 병렬 트래킹 모드에서는 CH1 값 변경 시마다 CH2 입력창과 SCPI 명령이 항상
     함께 갱신됨. CH3 관련 동기화 블록(`S.syncCh3 && S.trackMode === 0`)은 독립 모드 전용
     기능이라 그대로 유지(병렬 모드에서 CH3 자동 동기화는 이번 요청 범위 밖).
- **검증**: 헤드리스로 (1) 독립 모드에서 CH2·CH3 사용 토글 ON → `setTM(1)`(병렬) 호출 →
  CH3Use가 자동으로 `false`로 리셋되고 CH3 카드가 `pst-ch-disabled` 클래스 없이 정상
  상호작용 가능함을 확인, (2) CH1 전압 12.50V/전류 0.750A 입력 → CH2 입력창에 즉시 동일값
  반영 확인, (3) CH1 값을 20.00V로 재변경 → CH2가 실시간으로 다시 미러링되는지(최초 1회성이
  아님을) 확인, (4) `setTM(2)`(직렬)로 전환 시에는 CH3 카드가 여전히 정상적으로 잠기는지
  (회귀 없음) 확인 — 4개 시나리오 모두 통과.

#### 2026-07-09: 트래킹 모드 선택 시 클릭 팝업 → 마우스오버 팝오버(이미지+설명)로 변경 (`pst3202.js`, `index.css`)
- **요청**: "트래킹 모드 마우스로 올리면 설명이 나오고 클릭하면 각 이미지 팝업창이 나오는데,
  이걸 마우스로 올리면 팝업에 나오던 이미지와 이미지 밑에 설명이 나오게 해줘. 클릭하면 해당
  모드 적용이 되고. 즉 팝업이 없어지고 기존 설명이 나오던 것에 이미지도 추가해달라는거야"
  — 기존엔 라디오 레이블에 브라우저 기본 `title` 툴팁(텍스트만)이 있었고, 클릭(선택)하면
  `setTM()` 끝에서 `showTrackImageModal()`이 화면 전체를 덮는 이미지 팝업을 띄웠음. 이 둘을
  하나로 합쳐 "마우스오버 시 이미지+설명을 함께 보여주는 팝오버"로 교체하고, 클릭은 순수하게
  모드 적용만 하도록 요청.
- **구현**:
  - `showTrackImageModal(mode)`/`hideTrackImageModal()`(클릭 팝업용) 삭제 → `showTmPopover(mode,
    el)`/`hideTmPopover()`(호버 팝오버용) 신설. `setTM()` 끝의 `showTrackImageModal(S.trackMode);`
    호출도 제거 — 이제 클릭은 모드 적용만 함.
  - 라디오 `<label>`의 `title="${t('pst_tmN_tip')}")`를 제거하고 `onmouseenter="app.instr.
    showTmPopover(N,this)"`/`onmouseleave="app.instr.hideTmPopover()"`로 교체.
  - 공용 팝오버 엘리먼트 `#pstTmPopover`(이미지 `#pstTmPopoverImg` + 설명 `#pstTmPopoverDesc`)를
    트래킹 모드 라디오 그룹 바로 아래에 신설, `position:fixed`로 배치.
  - **사이드바가 `#sidebar{overflow:hidden}` + `.sidebar-top{overflow-y:auto}`로 잘리는 좁은
    영역**이라 `position:absolute`로는 팝오버가 옆으로 넘칠 때 잘려 보이는 문제가 있어
    `position:fixed`를 채택 — `showTmPopover()`에서 `el.getBoundingClientRect()`로 라디오
    레이블의 화면 좌표를 구해 오른쪽에 배치하되, 뷰포트 오른쪽 경계를 넘으면 자동으로 왼쪽에
    배치하도록 계산(고정폭 260px 기준 동기 계산, `requestAnimationFrame` 없이 처리 — 헤드리스
    테스트 환경에서 rAF가 `--virtual-time-budget`과 함께 쓰이면 콜백이 영영 발화하지 않고 멈추는
    현상을 이전 세션에서 이미 겪어봐서 회피).
  - 팝오버 자체는 `pointer-events:none`으로 설정 — 팝오버가 시각적으로 다른 라디오 레이블
    위에 겹쳐도 그 아래 요소의 마우스 이벤트(호버/클릭)를 가로채지 않도록 함.
  - `TRACK_IMAGE`(이미지 경로 맵)는 그대로 재사용, `pst_tm0_tip`/`pst_tm1_tip`/`pst_tm2_tip`
    (기존 `\n` 포함 설명 텍스트)도 그대로 재사용 — `.pst-tm-popover-desc{white-space:pre-line}`
    으로 줄바꿈 보존.
  - `#pstTrackImageModal` 모달 HTML과 `hideTrackImageModal` export 참조도 함께 삭제(죽은 코드
    방지).
- **검증**: 헤드리스로 (1) 팝오버 엘리먼트 존재 + 초기 숨김 상태, 기존 모달 엘리먼트 완전
  제거, 레이블에 `title` 속성 없고 `onmouseenter` 핸들러 있음을 확인, (2) `showTmPopover(1,
  el)` 호출 → 팝오버가 보이며 이미지 src에 `Parallel.png` 포함, 설명 텍스트(줄바꿈 포함)
  정상 표시 확인, (3) `hideTmPopover()` → 다시 숨겨짐 확인, (4) `setTM(1)` 호출 시 더 이상
  어떤 에러도 발생하지 않고(구 모달 함수 참조가 완전히 제거됐다는 뜻) `S.trackMode`만
  정상 갱신됨을 확인 — 4개 항목 모두 통과.

#### 2026-07-09: 전체 코드 재검토 후 발견된 4건 수정 (`pst3202.js`, `index.css`)
- **배경**: 사용자가 "전체 코드 다시 한번 검토해줘"라고 요청. 원래 code-review 스킬로 10개
  관점의 서브에이전트를 병렬 실행할 계획이었으나 **전부 API 세션 한도(10:50am 리셋)로 실패**
  — 대신 세션 전체 diff(`e5af59b...HEAD`)를 직접 읽고 10개 관점을 스스로 적용해 4건을 발견,
  사용자가 그중 3건은 즉시 수정 지시·1건은 재설명 요청 → 재설명 과정에서 사용자가 더 나은
  해결책(측정 시작 시점에 미리 확인)을 제안해 그대로 반영.
- **1. 트래킹 모드 팝오버 이미지 축소**: `.pst-tm-popover img{width:100%}` → `width:33%;margin:0
  auto` — "사진이 이렇게 클 필요 없다"는 피드백 반영. 부수적으로 팝오버 전체 높이도 줄어들어
  화면 아래로 잘리는 문제도 함께 완화됨. 추가로 `showTmPopover()`에 세로 방향 뷰포트 경계
  체크(`popH=190` 기준, 넘치면 위로 뒤집음)도 넣어 기존에 있던 가로 방향 체크(좌우 뒤집기)와
  대칭을 맞춤 — 이전 검토에서 "팝오버가 화면 아래로 잘릴 수 있다"고 지적했던 부분을 근본
  해결.
- **2. `setTM()` 중복 `drawGraph()` 호출 제거**: `updateTrackModeUI()`가 내부에서 이미
  `syncTrackingSettings()`(→ `updateGraphLegend()`+`drawGraph()`)까지 호출하므로,
  `setTM()` 끝의 `updateGraphLegend(); drawGraph();` 두 줄은 100% 중복이었음 — 삭제.
  트래킹 모드 전환 1회당 캔버스 재렌더링이 2번→1번으로 줄어듦(동작 차이 없음, 순수 낭비 제거).
- **3. 제품명 필터 패널 — `position:absolute` → `position:fixed` 전환**: 처음엔 사용자가
  "잘리면 스크롤바로 보이게 해달라"고 간단히 요청했으나, 실제 헤드리스 테스트로 확인해보니
  **단순 클리핑이 아니라 더 심각한 버그**였음 — `#pstNameFilterPanel`이 `position:sticky`인
  `<thead>` 안의 `<th>`를 기준으로 `position:absolute` 배치되는데, 테이블을 스크롤하면
  `<th>`의 "고정되지 않은 원래 흐름 위치"를 기준으로 좌표가 계산되어 패널이 화면 밖(예:
  `top:-61px`)으로 완전히 튕겨나가는 것을 실측으로 확인 — 스크롤로는 절대 다시 볼 수 없는
  상태였음. 트래킹 모드 팝오버와 동일한 원인이라 동일한 해결책(`position:fixed` + 버튼의
  `getBoundingClientRect()`를 열 때 한 번 계산해 좌표 지정, 뷰포트 경계 넘으면 반대쪽으로
  전환)을 적용. 추가 안전장치로 패널이 열려있는 동안 테이블을 스크롤하면(위치가 버튼과
  어긋날 수 있으므로) 패널을 자동으로 닫도록 `document`에 `scroll` 이벤트를 캡처 단계로
  위임(스크롤 이벤트는 버블링되지 않으므로 `addEventListener(..., true)` 필요 — `buildCenter()`
  가 재실행돼 테이블이 새로 생성돼도 항상 안전).
- **4. 확인창 중복 시 `confirmResolver`가 덮어써지는 경쟁 문제 — 근본 해결**: 원래는 체크된
  기록이 있는 상태에서 측정을 **끝낼 때**(`createEvalRecord()`) "덮어쓰시겠습니까?"를 물어봤는데,
  이 시점은 하드웨어 SCPI 응답이라는 비동기 콜백 안이라 재현 조건이 까다로운 경쟁 상태를
  만들 수 있었음. 사용자 제안대로 **확인 시점을 측정 시작 시점으로 이동** — `toggleOutput()`이
  이제 `async`가 되어, 체크된 기록이 정확히 1개면 실제로 출력을 켜기 **전에**
  `showConfirm()`으로 물어보고, "아니요"면 아예 시작하지 않고 조용히 종료. "확인"이면 그때
  출력을 켬. 확인 대기 중 시작 버튼이 다시 눌리는 것을 막는 `S._startConfirmPending` 가드도
  추가(사용자 클릭 하나로만 트리거되는 흐름이라 하드웨어 콜백 타이밍에 좌우되던 기존 방식보다
  가드하기 쉬워짐). 이에 따라 `createEvalRecord()`는 다시 동기 함수로 되돌리고, 측정 종료
  시점에는 재확인 없이 곧바로 덮어쓰도록 단순화(이미 시작 시점에 동의를 받았으므로).
- **검증**: 헤드리스로 (1) 트래킹 팝오버 이미지 폭 축소 및 세로 경계 로직, (2) `setTM()` 호출 시
  `drawGraph` 관련 중복 코드 제거 확인, (3) 30개 샘플로 이름 필터를 채운 뒤 패널을 열고
  테이블을 강제 스크롤 → 패널이 자동으로 닫히는지, 스크롤 전 위치가 정상 범위인지 확인,
  (4) 체크된 기록 1개 상태에서 시작 버튼 클릭 → 확인창 노출 → 취소 시나리오(출력 안 켜짐,
  기존 기록 불변) + 확인 시나리오(출력 켜짐 → 이후 측정 종료 시 재확인 없이 바로 덮어써지고
  `checked`가 `false`로 리셋됨) + 확인 대기 중 시작 버튼 재클릭 시 모달이 중복 생성되지 않는지
  까지 전부 실제 코드 경로로 재현·확인.

#### 2026-07-09: 엑셀 내보내기 — 네이티브(진짜) 차트 vs 이미지 방식 조사 → 이미지 방식 유지로 결정
- **요청 배경**: "그래프가 이미지 형태로 첨부되고 있는데, 이미지가 아니라 실제 엑셀 그래프를
  만들어달라"(클릭해서 편집 가능한 진짜 차트 객체를 원함, Sheet1의 Raw Data를 참조).
- **조사 결과**: 현재 쓰고 있는 **ExcelJS(4.3.0)는 네이티브 엑셀 차트 생성을 지원하지 않음** —
  공식 README를 확인해도 "chart" 관련 기능이 전혀 없음. 이는 ExcelJS의 오래된 알려진 한계이며,
  브라우저에서 CDN으로 쓸 수 있는 다른 무료 라이브러리(SheetJS 등)도 차트 쓰기는 대부분
  유료(Pro) 버전 전용 기능이라 마찬가지로 지원 안 함.
- **가능한 구현 방법 2가지를 사용자에게 제시**:
  1. ExcelJS가 생성한 xlsx를 JSZip으로 열어 엑셀 차트 XML(`xl/charts/chart1.xml` 등)을 직접
     만들어 삽입 — Photo Editor의 `_groupImagesInXlsx()`(그림을 JSZip으로 후처리해 그룹화)와
     같은 계열의 기법이지만, 차트 XML(DrawingML `c:chart` 스키마)을 처음부터 손으로 정교하게
     작성해야 해서 작업량·리스크가 상당히 큼.
  2. 현재 이미지(PNG+범례) 방식 그대로 유지.
- **사용자 결정**: **2번(이미지 방식 유지)** 선택 — 코드 변경 없음.
- **⚠️ 향후 참고**: 나중에 "진짜 엑셀 차트"가 다시 요청되면, ExcelJS 자체에는 여전히 이 기능이
  없다는 전제로 시작할 것(라이브러리 업데이트로 추가됐을 가능성은 매번 재확인 권장). 구현하게
  되면 위 1번 방법(JSZip 기반 수동 chart XML 삽입)이 유일한 현실적 경로임.

#### 2026-07-10: 🔴 가져오기한 기록이 화면에 안 보이던 버그 — 이름 필터 빈 배열 고착 (`pst3202.js`)
- **사용자 신고**: 스크린샷과 함께 "아래 추가된 게 없는데 중복이라고 추가가 안 됨" — 두 번째
  가져오기가 "0개 추가, 2개 중복 제외"를 표시하는데 테이블은 비어 보임.
- **실제 상황 (스크린샷의 시스템 로그로 판독)**: 첫 가져오기(12:50:05)는 "추가 2개"로 **정상
  추가**됐고, 두 번째(12:50:13)의 중복 제외도 정상 동작. 문제는 기록이 추가됐는데도 **제품명
  필터가 "표시 안 함" 상태라 전부 숨겨져** 사용자에게는 "추가된 게 없는" 것처럼 보인 것.
- **근본 원인**: `toggleNameFilterPanel()`이 패널을 열 때 `S.evalFilters.names === null`이면
  `distinctEvalNames()`로 배열을 확정(materialize)했는데, **테이블이 비어있을 때 패널을 한 번
  열면 빈 배열(`[]`)로 굳어짐** → `[]`는 "전부 해제"로 해석되므로 이후 가져오기/측정으로
  추가되는 모든 기록이 이름 필터에 걸려 숨겨짐. (또한 `setAllNameFilters(true)`도 그 시점의
  이름 목록으로 배열을 확정해서, 이후 새 이름이 추가되면 자동으로 제외되는 같은 계열 문제
  존재.)
- **수정 3가지**:
  1. `toggleNameFilterPanel()`의 eager materialization 제거 — `null`(필터 없음)은 체크박스
     렌더링(`checked === null || ...`)과 필터 판정 양쪽에서 이미 "전체 선택"으로 처리되므로,
     사용자가 실제로 체크를 바꾸는 시점(`toggleNameFilterValue`)에만 배열로 전환.
  2. `setAllNameFilters(true)`가 배열 대신 `null`을 저장 — "전체 선택" 후 새로 추가되는
     이름도 자동 포함되도록.
  3. `ensureNameVisible(name)` 헬퍼 신설 — 필터가 배열 상태일 때 새 기록이 들어오면 그 이름을
     선택 목록에 자동 추가. 호출 위치: `handleImportFile()`(가져온 기록마다),
     `createEvalRecord()`(신규 저장·덮어쓰기 양쪽), `renameEval()`(이름 변경 직후 행이 필터에
     걸려 사라지는 것 방지). — "방금 추가/변경한 기록이 눈앞에서 안 보이는" 상황을 원천 차단.
- **검증**: 헤드리스로 5개 시나리오 — (1) 빈 테이블에서 패널 열고닫기 후 가져오기 → `names`가
  `null` 유지, 2건 모두 표시 (신고된 버그 재현·수정 확인), (2) 명시적 전체 해제 후 새 이름
  가져오기 → 즉시 표시되고 `names`에 그 이름만 포함, (3) 전체 선택 → `null` 복귀 및 전체 표시,
  (4) 필터 활성 상태에서 이름 변경 → 변경된 행 계속 표시, (5) 동일 타임스탬프 재가져오기 →
  중복 제거 회귀 없음. 전부 통과.
  - **테스트 기법 주의**: `FileReader`는 실제 I/O라 헤드리스 `--virtual-time-budget`의 가상
    시간 빨리감기와 완료 순서가 어긋남 — 고정 `setTimeout` 대기 대신 "기록 수가 기대값이 될
    때까지 폴링"으로 대기해야 함(고정 대기를 쓰면 가져오기 완료 전에 검증 로그가 찍혀 가짜
    실패/가짜 통과가 섞여 나옴. 이번에 실제로 겪고 폴링으로 전환해 해결).
- **참고 (별개 사항)**: 스크린샷의 "평가 기록 저장 실패: 서버 응답 오류 (HTTP 501)"는 이 버그와
  무관 — 사용자가 `python -m http.server`(POST 미지원)로 실행 중이어서 `/api/evaldata` 저장이
  실패한 것. 브라우저 개발 모드에서 영구 저장까지 하려면 `server.py`로 실행해야 하며, EXE에서는
  내장 서버에 라우트가 있어 정상 저장됨.

#### 2026-07-10: Data Table 컬럼 순서 변경 (`pst3202.js`)
- **요청**: "전압/전류/시간조건을 맨 우측에 배치해줘" — 조건 텍스트가 길어 뒤쪽 컬럼(전류
  최대값·소요 시간)이 밀려나 잘려 보이던 문제.
- **수정**: 컬럼 순서를 `…에이징시간 → 전류 최대값 → 소요 시간 → 조건`으로 재배치(기존엔
  조건이 전류 최대값보다 앞에 있었음). 헤더 `<th>`와 데이터 `<td>` 양쪽 다 변경.
- **검증**: 헤드리스로 헤더 순서·데이터 행 셀 순서(마지막=조건, 그 앞=소요시간, 그 앞=전류
  최대값) 확인.

#### 2026-07-10: 🔴 트래킹 모드 팝오버 위치가 크게 어긋나던 버그 — 포털 패턴으로 근본 해결 (`pst3202.js`, `index.css`)
- **사용자 신고**: 스크린샷과 함께 — 병렬 트래킹에 마우스를 올렸는데 팝오버(이미지+설명)가
  화면 하단, 데이터 테이블 한가운데에 뜸. "글씨 바로 우측에 나오게 해줘, 지금 위치가 많이
  어긋났어."
- **원인**: `showTmPopover()`는 `position:fixed`로 이미 구현돼 있었지만, 조상 요소 중 하나가
  `transform`(또는 `filter`/`perspective`/`will-change` 계열)을 가지고 있으면 CSS 스펙상
  `position:fixed`의 기준이 뷰포트가 아니라 **그 조상 요소**로 바뀐다 — 실사용 환경(특정
  Windows 배율/브라우저 조합)에서 사이드바 조상 어딘가 이 조건에 걸려, `getBoundingClientRect()`
  좌표는 뷰포트 기준으로 정확히 계산했는데 실제 렌더링은 엉뚱한 기준점에서 이뤄진 것으로 추정.
  이름 필터 패널(`#pstNameFilterPanel`)에도 잠재적으로 동일한 위험이 있음(아직 미확인이지만
  같은 사이드바/센터 트리 안에 있어 이론상 영향권).
- **수정 (포털 패턴)**: `showTmPopover()`가 팝오버를 표시하기 직전에 `document.body`로
  직접 이동(`document.body.appendChild(pop)`)시킴 — 조상 트리를 완전히 벗어나 `position:fixed`가
  항상 뷰포트 기준으로 계산되도록 보장. `buildSidebar()`가 재실행돼도 중복 팝오버가 쌓이지
  않도록 이동 전 `body > .pst-tm-popover`를 먼저 정리.
  - 위치 기준을 라벨 전체(`<label>`, 사이드바 폭 전체)가 아니라 텍스트 `<span>`의
    `getBoundingClientRect()`로 변경 — "글씨 바로 우측"이라는 요청에 정확히 맞춤(세로도
    텍스트 상단 기준 `-10px`로 살짝 위로 올려 시각적으로 정렬).
  - 예상치 대신 실측 크기(`pop.offsetWidth`/`offsetHeight`, `display:block` 적용 후 측정)로
    화면 경계 체크 — 팝오버 크기가 바뀔 때마다(이번처럼 이미지 크기를 조정할 때마다) 경계값을
    같이 수정해야 했던 문제도 함께 해결됨.
- **검증**: 헤드리스에서 사이드바에 인위적으로 `transform:translateZ(0)`를 건 최악의 시나리오로
  재현 — 수정 전이라면 깨졌을 상황에서 팝오버가 `document.body`로 이동했는지, 텍스트 우측
  12px·상단 -10px 오차 범위 내로 정확히 배치되는지, 사이드바를 재빌드한 뒤 다시 호버해도
  팝오버가 1개만 존재하는지(중복 생성 없음) 확인 — 전부 통과.
- **부가**: 이미지에 `aspect-ratio:4/3;object-fit:contain` 추가 — 이미지 로드 전/후 레이아웃
  흔들림 방지(실측 높이를 쓰는 위치 계산과 궁합이 더 좋아짐).

#### 2026-07-10: "강압 조건" 컬럼 — 단위를 헤더로 이동, 데이터는 숫자만 (`pst3202.js`, `core.js`)
- **요청**: "강압조건 글씨가 짤려 단위는 메뉴에 적어주고 데이터에는 숫자만 표기해줘, 소요시간은
  지금처럼 표기하되 숫자 짤리지 않게 해줘. 분/초는 영문 변경 시 m/s로."
- **강압 조건**: 헤더 라벨을 `pst_th_stress` = `강압 조건 (kg)` / `Stress Cond. (kg)`로 단위
  포함 갱신. 입력칸을 `type="text"` → `type="number"`(`step="0.1" min="0"`)로 변경 — 이제
  숫자만 입력·저장됨. 기존에 "2kg"처럼 텍스트로 저장돼 있던 레거시 데이터도 `parseFloat()`로
  숫자만 추출해 깨끗하게 표시(값 재저장 없이 표시 시점에만 정제 — 원본 문자열은 그대로 두고
  사용자가 다시 수정해서 저장하면 그때 순수 숫자로 갱신됨). 자동완성 데이터리스트도 동일하게
  숫자만 추출해 중복 제거 후 제공. **필터 드롭다운의 매칭 로직(`filters.stress === rec.
  stressCondition` 정확 일치)은 원본 문자열 그대로 유지** — 표시만 정제하고 내부 비교 계약은
  건드리지 않음.
- **소요 시간**: 컬럼 폭 90px → 110px로 확대(향후 `1시간 5분`처럼 길어지는 값 대비 여유 확보).
  분/초 → m/s 자동 전환은 **이미 구현돼 있었음**(`evalDurationStr()`가 `t('pst_u_h'/'pst_u_m'/
  'pst_u_s')` 사용) — 헤드리스로 "1시간 1분" → "1h 1m" 정상 전환 재확인만 하고 추가 수정
  없음.
- **검증**: 헤드리스로 KO/EN 두 언어 모드 각각 렌더링 — 헤더에 단위 포함 확인, 레거시 "2kg"
  값이 입력칸에 "2"로 깨끗하게 표시되는지, 소요 시간 컬럼 폭 및 시간 단위 자동 전환까지
  전부 확인.

#### 2026-07-10: 직렬/병렬 트래킹 OVP 동기화 — 화면·내부 상태 미러링 누락 수정 (`pst3202.js`)
- **사용자 신고**: 실기 테스트 중 스크린샷과 함께 — "직렬인데 OVP가 동기화가 안 돼. 직렬에서
  사이클로 설정하면 이것도 반영되야 하는 거 아냐?" (CH2 OVP를 30V로 설정했는데 CH1 OVP 칸은
  34.00 그대로).
- **원인**: `setOvpDirect()`의 직렬(`ch===2 && trackMode===2`)/병렬(`ch===1 && trackMode===1`)
  분기가 **SCPI 명령만 상대 채널로 전송**하고, 상대 채널의 화면 입력칸(`pstOvpInp{n}`)과 내부
  상태(`S.ch[n].ovpVal`)는 갱신하지 않았음 — 장비 쪽은 실제로 동기화되는데 화면에만 이전 값이
  남아 "동기화가 안 되는 것처럼" 보임. 내부 `ovpVal`이 스테일하면 `setV()`의 OVP 클램핑과
  OVP 모달 초기값도 어긋나는 실질적 부작용 있음. (독립 모드 동기화 토글 분기에는 화면+상태
  갱신이 이미 있었음 — 트래킹 분기만 누락. OCP 쪽은 세 분기 모두 정상이었음.)
- **수정**: 직렬/병렬 분기에도 독립 동기화 분기와 동일하게 상대 채널의 `ovpVal`·입력칸·사이클
  편집기 헤더 입력(`pstCeOvpInp`, editorCh 일치 시)을 함께 갱신하고 syncNote에 표기.
  사이클 편집기 헤더의 OVP 빠른 설정도 같은 `setOvpDirect()`를 타므로 별도 수정 없이 해결됨.
- **검증**: 헤드리스로 (1) 직렬에서 CH2 OVP 30 설정 → CH1 입력칸·ovpVal·SCPI 모두 30 반영,
  (2) 병렬에서 CH1 OVP 15 설정 → CH2 동일 반영, (3) 독립(토글 OFF)에서 CH1 OVP 변경 → CH2
  불변(회귀 없음) — 3개 시나리오 전부 통과.
- **참고 (같은 날 실기 테스트 이슈)**: "독립 12V 사이클에서 전류가 0A"라는 신고는 조사 결과
  코드 버그 아님 — 장비 실물 디스플레이도 0A였고, 직렬 60V에서는 전류가 정상 측정됨(0.14~0.17A).
  전기박리형 테이프가 옴 저항이 아니라 문턱 전압 이상에서만 전도되는 전기화학 특성이기 때문
  (60V에서 0.17A면 옴 저항 가정 시 12V에서 0.03A가 보였어야 하나 실제 0 → 비선형 부하 확정).
- **⚠️ EXE 미빌드**: 사용자 요청("exe 재빌드는 아직하지마")으로 소스에만 반영, dist/EXE는 보류.

#### 2026-07-14: 직렬/병렬 트래킹 — 사이클 스텝 CH1↔CH2 미러링 (`pst3202.js`)
- **요청**: 실기 테스트 중 — "직렬 트래킹이고, 2채널에서 사이클 선택 시 여기 사이클에서 입력되는
  모든 스텝은 1채널에도 동일하게 적용되게 해줘. 스텝 추가해도 동일하게 추가되게. 2채널에 30V
  2A 60초 스텝 추가하면 1채널에도 동일하게 추가되어 시작하면 60V 2A 60초가 시작되게."
- **기존 상태**: 실행 시점의 SCPI 미러링(`_runStep`의 `trackMode===2 && ch===2` → CH1 V/I 명령
  push)은 이미 있었음 — 즉 하드웨어 동작은 맞았지만, **스텝 편집(추가/삭제/수정)·모드 전환·
  편집기 UI가 미러링되지 않아** CH1 쪽에는 스텝이 보이지 않고 기록(chData)에도 남지 않았음.
- **구현 (마스터/슬레이브 모델)**: 직렬 마스터=CH2, 병렬 마스터=CH1. 신규 헬퍼
  `_cycleMasterCh(ch)` — 트래킹 모드에서 슬레이브 채널 번호를 마스터로 매핑.
  1. `setMode()`: 트래킹 모드에서 CH1/CH2 중 하나를 사이클↔고정값 전환하면 짝 채널도 동일
     모드로 전환(OVP 최대값 강제 포함). 스텝은 **항상 마스터→슬레이브 방향으로 복사** —
     슬레이브 카드 탭을 클릭해도 마스터의 스텝이 보존됨(방향 고정으로 데이터 유실 방지).
  2. `addStep()`/`delStep()`/`editStep()`: 트래킹 모드에서 CH1↔CH2 스텝 실시간 미러링
     (두 채널 사양이 동일 32V/2A라 클램핑 불필요). del/edit의 실행 중 잠금 판정도
     `_cycleMasterCh()` 기준으로 변경.
  3. `startCycle()`/`stopCycle()`/`toggleCycle()`: 슬레이브 편집기 탭에서 눌러도
     `_cycleMasterCh()`로 리다이렉트해 마스터 사이클을 구동/정지.
  4. `startAllCycles()`: 슬레이브 채널 제외 필터 추가 — 마스터의 `_runStep`이 SCPI로 슬레이브를
     함께 구동하므로 슬레이브 타이머를 별도로 돌리면 중복 명령·타이머 드리프트 발생.
  5. `renderStepTable()`/`updateEditorControls()`: 슬레이브 탭에서도 마스터의 실행 상태
     (활성 스텝 하이라이트, 입력 잠금, 시작/정지 버튼 라벨)가 반영되도록 상태 조회를
     `_cycleMasterCh()` 기준으로 변경.
  6. `setTM()`: 트래킹 모드로 전환하는 시점에 마스터가 이미 사이클 모드면 `setMode(master,
     'cycle')` 재적용으로 슬레이브를 정렬(사이클 설정 후 나중에 직렬로 바꾸는 순서도 지원).
- **검증**: 헤드리스 + 모의 SCPI 응답으로 6개 시나리오 — (1) 직렬에서 CH2 사이클 전환 시 CH1
  자동 추종, (2) 30V/2A/60s 스텝 추가 시 양쪽 배열 동일, (3) 시작 시 CH1·CH2 모두 V/I SCPI
  수신 + 타이머는 마스터(CH2)만 구동, (4) 슬레이브(CH1) 탭에서 스텝 표시·실행 중 입력 잠금·
  정지 버튼이 마스터를 제어, (5) 삭제 미러링, (6) 독립 모드 회귀 없음(스텝 미러링 안 됨) —
  전부 통과.
- **EXE 빌드 완료 (2026-07-14)**: 보류돼 있던 OVP 동기화 수정 + 사이클 스텝 미러링까지 포함해
  dist 동기화 후 `dist/3M_Instrument_Logger.exe` 재빌드 완료.

### PST-3202 알려진 제약 / 후속 작업
- **실기 테스트 미완료**: SCPI 통신, OVP/OCP 동작, 폴링 타이밍 현장 검증 필요
- **CH3 사용 토글**: CH3 동기화 토글(`syncCh3`)은 통합 앱에만 구현 — 단독 프로그램(`PST-3202/index.html`)에는 없음
- **EXE 패키징**: PST3202 항목 `build/build_standalone.py` INSTRUMENT_MAP에 등록 완료 — 재패키징 전 dist 동기화 필요
- **dist 동기화 완료 (2026-07-09)**: 2026-07-08~09 세션의 모든 변경사항(제품명 다중 필터,
  가져오기 버튼 복구, CH2/CH3 사용 토글 그래프 버그, 측정 소요 시간 열, 재측정 덮어쓰기
  확인(시작 시점으로 이동), 트래킹 모드 팝오버, 이름 필터 패널 position:fixed 전환, 코드
  재검토 발견 4건 등)를 `instruments/pst3202.js`·`core.js`·`index.css` 동기화 후
  `dist/3M_Instrument_Logger.exe` 재빌드 완료.
- **그래프 테마 전환 즉시 반영**: 현재 데이터가 있을 때만 `drawGraph()`가 배경을 채움. 데이터 없을 땐 캔버스 투명 → 컨테이너 배경색으로 표시 (`.pst-graph-section`의 `background:var(--panel)`). 실사용 시 문제 없음.

## 4-3. Keithley SourceMeter 2400 (2026-08-12 신규 통합)

### 2026-09-08 4-Wire 측정·그래프 수정 (소스만, 실장비 재검증 대기)

- 누락된 2400 전용 CSS 210줄을 기존 배포본에서 복구: 폭 320px로 찌그러지던 캔버스와 중앙 2열 레이아웃·모달 정상화.
- 평가 전 OUTPUT OFF 상태에서 이전 측정 기능 제거 → Concurrent VOLT/CURR 실측 활성화 및 조회 검증. RSEN도 시작 직전 재확인. 양쪽 NPLC 적용, 연속 DC를 위한 auto-clear OFF 검증, ARM/TRIG 1회·ASCII 지정.
- 빈 READ? 필드 및 다중 레코드 거부, 무효 구간 그래프 연결 방지, 단일점 표시, 원문 READ 로그 추가.
- 모의 재현 및 브라우저 검증 통과. 실제 누설전류·배선 원인은 전면값/Raw 비교 전 미확인. 전체 검증은 기존 `build/build_standalone.py:189` 빈 else 문법 오류로 중단됨. EXE 미빌드.
- 상세: `docs/KEITHLEY_2400_4WIRE_DIAGNOSIS_20260908.md`.
- 같은 날 현장 재확인에서 FTDI Web Serial로 Model 2400 S/N 1162685의 OUTPUT OFF→ID→RSEN 4-Wire→오류 큐 초기화를 통과했다. 누락됐던 2400 전용 CSS를 재복구하고 캐시 키를 갱신해 화면·그래프 회귀 테스트를 통과했다. 실제 1 V/10 mA 인가 측정은 페이지 새로고침 뒤 COM4가 다른 탭/프로그램에 점유돼 수행하지 못했다.
- 이후 COM4 잔여 세션을 해제하고 Chrome/ASRL4 VISA에서 9 V, 1 A Compliance, 4-Wire, FAST 0.1 NPLC, 1초 간격, 60초 실측을 완료했다. 60개 Raw에서 전압 평균 8.999933 V, 전류 1.419546→0.720768 mA(평균 0.820553 mA), 저항 6.340→12.487 kΩ이었고 Compliance/OVP/Overflow 없이 OUTPUT OFF로 종료했다. 화면 그래프의 V 평탄/I 감소/R 증가가 Raw와 일치했다.
- 이 실측 중 측정 완료 후 설정 컨트롤이 계속 disabled로 남는 버그를 발견해 `runEvaluation()` finally에서 `S.busy=false` 이후 `updateControlState()`를 다시 호출하도록 수정했다. 실기 종료 후 설정 버튼 재활성화를 확인했다.
- 장비 전면 표시와 맞춰 화면 실시간 전류·그래프 Y축·결과 표 최대/평균 전류를 mA로 표시한다. 내부 Raw/XLSX는 A를 유지한다. 60초 실측 결과가 마지막 0.7208 mA, 최대 1.4195 mA, 평균 0.8206 mA로 표시되는 것을 확인했다.
- mA 표시에는 전류 전용 고정 소수 포맷을 사용해 극소값도 지수표기를 쓰지 않는다. 예: `1.51e-6` 대신 `0.000001509 mA`, `2.87e-7` 대신 `0.000000287 mA`. 이번 실측 결과 표는 최대 `1.4195 mA`, 평균 `0.820553 mA`로 확인했다.
- 사용자 요청으로 mA 표시는 Model 2400 전면과 맞춰 소수점 5자리 고정으로 변경했다. 이번 실측 표는 최대 `1.41955 mA`, 평균 `0.82055 mA`, 마지막 `0.72077 mA`로 표시한다. Raw/XLSX A 값은 보존한다.

- **파일**: `instruments/keithley_2400.js` (`viewType: 'custom'`)
- **연결**: Web Serial RS-232(9600 8-N-1, Flow Control NONE, CR 종단, Straight-through DB-9) 또는 VISA/GPIB(NI-488.2/NI-VISA + PyVISA)
- **기능**: Source V/Source I, 기본 4-wire 및 선택 2-wire, 단일 포인트, 시간 기록, 소프트웨어 I-V Sweep, 반복 사이클. 설정 UI는 Source I에서 `R ≤ Voltage Compliance / Source I`, Source V에서 `R ≥ Source V / Current Compliance` 이론 참고값을 표시하며 측정값이나 안전 제한에는 사용하지 않는다. 중앙 그래프는 V/I/R 독립 3축과 항목별 표시 체크박스를 제공하며, 미선택 시 최신 평가, 결과 체크박스 단일·복수 선택 시 선택 평가 전체를 비교한다. 복수 평가에서는 평가별로 서로 다른 색상을 사용하고 전압=실선·전류=파선·저항=점선으로 구분하며, 제품명 범례와 선택 행 색상선도 그래프 색상에 맞춘다. 화면 표는 평가 1회당 월/일·수정 가능한 제품명·최대 `|V|`·최대 `|I|`·부호 포함 Raw 전류 산술평균·최대 `|R|`·측정 수·평가 시간을 요약한다. Raw 샘플은 내부 보존하고, XLSX 내보내기는 1번 시트에 Raw Data 숫자 셀을 직접 참조하는 Excel 기본 결합 산점도와 요약 대시보드를 만들고 2번 시트에 평가 1번부터 샘플명·테스트 방법 메타데이터 및 시간·전압·전류·저항 숫자 열을 가로 블록으로 배치한다. 복수 선택 시 차트에 평가별 색상 계열을 모두 표시하며, 선택이 없으면 전체 평가를 내보낸다. Excel이 결합 차트 보조축 계열의 범례 삭제를 무시할 수 있으므로 기본 차트 범례는 사용하지 않고, 차트 위 워크시트 셀에 샘플별 색상선과 샘플명만 한 번씩 표시한다.
- **안전**: 연결 직후 및 모든 종료/오류 경로에서 `:OUTP OFF`, 출력 시작 전 배선 확인, 30V 초과 경고, 상태 워드 bit 3 Compliance 자동 정지
- **GPIB 안전 순서**: `visaConnectWithoutIdn`으로 서버의 선행 `*IDN?`을 생략하고, 2400 모듈이 `:OUTP OFF` 검증 후 `*IDN?`을 실행
- **정격 제한**: 공식 장비 Source programming overrange는 ±210V이나 앱 평가는 OVP 여유 확보를 위해 전압 인가/Voltage Compliance ±200V, 전류 ±1.05A, 22W로 제한한다. 21V 초과는 0.105A 이하, 0.105A 초과는 21V 이하이며 `|Source × Compliance| ≤ 22W`를 항상 함께 적용. 입력 속성·포커스 이탈 자동 보정·저장값 로드 정규화·시작 직전 재검사의 다중 안전장치를 사용한다. Sweep의 모든 포인트와 사이클의 모든 단계에 같은 검사 적용. 사이클 단계 전환은 Source 0 → 새 Compliance → 새 Source 순서
- **2/4-wire 명령**: `:SYST:RSEN ON|OFF` 후 `:SYST:RSEN?` 확인. `:SYST:FRES`와 `:SYST:REM` 사용 금지
- **SSOT**: `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md` 9절, `docs/manuals/Keithley_2400.md`, `docs/KEITHLEY_2400_INTEGRATION_PLAN.md`
- **검증**: 2026-08-26 COM4/FTDI RS-232 실장비 검증 완료. 이어 GPIB0::2::INSTR에서 서버 선행 IDN 없이 `:OUTP OFF`가 첫 명령임을 확인하고, 0.1 V/1 mA·4-wire·1 NPLC 단일 측정 원시값 `+1.000000E-01,+1.384179E-10,+7.798027E+02,+4.215812E+06`, 시간 평가 3건, 0→0.05→0.1 V Sweep 3건을 확인했다. 0.05→0.10 V, 1 mA, 단계당 0.2초 사이클도 2건 모두 OK로 기록됐고 중앙 그래프, 제품명 수정 후 화면 재구성 시 값 유지, 최종 OUTPUT OFF, 연결 해제 후 GPIB 반환을 확인했다. GPIB 실제 Compliance와 알려진 저항 더미 부하·전면 표시 비교는 별도 필요
- **EXE**: 이번 작업에서는 빌드하지 않음

## 5. 파형(WAVE) 표시 현황 및 미해결 과제

### SP-2100 파형 — 바이너리 수신은 되나 디코딩 포맷 미확인 (미표시)
- SP-2100은 측정 완료 시 대형 프레임(~4800바이트)을 전송하며, 그 안에 바이너리
  파형 데이터가 포함됨 (`processFrame`에서 ws 위치로 확인 가능).
- **문제**: 바이너리 디코딩 포맷(bit-depth, SCALE, OFFSET, byte order)을 모름.
  원본 `sp2100_logger.html`에 decode 로직이 있었으나 현재 접근 불가.
  임의 포맷(`8bit·128`, `16bit·LE·U` 등)으로 추정 디코딩하면 파형 모양이
  실제와 다른 노이즈처럼 표시됨.
- **결정**: 포맷 확인 전까지 SP-2100 파형 표시하지 않음. 바이트 수신 사실만 로그에
  기록 (`[SP-2100] 바이너리 파형 수신 N바이트 — 디코딩 포맷 미확인으로 미표시`).
- **해결 방법**: 원본 HTML standalone 파일
  (`C:\Users\0op64\Documents\카카오톡 받은 파일\sp-2100\sp2100_logger.html`)을
  열어 `decodeWave` 함수의 SCALE/FACTOR/OFFSET 기본값 및 bit-depth 선택 로직 확인
  후 `instruments/sp2100_logger.js`의 `decodeWave`에 반영.

### TL-2200 파형 — ASCII 파형 수신 시에만 표시
- TL-2200 idle 폴링 응답(~109자 짧은 라인)에는 파형 필드 없음 → `clearWaveform()`
- 실제 측정 트리거 완료 시에만 CSV 마지막 필드에 ASCII 파형 문자열 포함
  (`B;?<=;=;...` 형태, 각 문자 = 1 샘플). 이때만 파형 표시.
- `onLine`에서 `f.tlWave` 유무로 판단하여 즉시 그림.
- 현재 실기 테스트에서 파형 트리거 완료 후 `[TL-2200 WAVE] N샘플 ASCII` 로그가
  나타나는지 확인 필요 (idle 응답만 왔을 때는 로그에 파형 없음).

## 6. Standalone / EXE 패키징 아키텍처

### 2026-08-28 통합 EXE 단일 파일 덮어쓰기 규칙
- 통합 빌드는 `dist/3M_Instrument_Logger.exe` **한 개만** 생성·유지한다.
- 새 빌드는 임시 출력 위치에서 먼저 완성한 뒤 기존 파일을 원자적으로 교체한다.
- 새 빌드가 성공한 뒤에만 이전 버전명 `3M_Instrument_Logger*.exe`를 정리하므로, 빌드 실패 시
  기존 실행 파일은 보존된다.

### 개요
특정 계측기만 포함한 단독 실행 파일(EXE)을 만들 수 있는 빌드 파이프라인.

### 파일 구조
```
core.js                     ← 공통 엔진 (export { App, _dateStr })
  index.js                    ← 통합 앱 진입점 (현재 13개 카드/도구 등록)
standalone.html             ← standalone/EXE용 HTML (standalone_entry.js 로드)
build/
  build_standalone.py       ← 계측기 선택 → dist/<이름>/ 폴더 생성
  package_exe.py            ← dist/<이름>/ → EXE 패키징 (pywebview + PyInstaller)
dist/
  <이름>/                   ← 빌드 결과 (index.html, core.js, instruments/...)
    standalone_entry.js     ← 자동 생성: 선택 계측기만 import + new App(INSTRUMENTS)
```

### 사용 방법

**1단계: 계측기 파일 추출**
```bash
# 단일 계측기 (런처 없이 바로 해당 계측기 화면으로 시작)
python build/build_standalone.py SP2100

# 2개 이상 (런처 카드 화면으로 시작)
python build/build_standalone.py SP2100 Keithley2700
```

사용 가능한 계측기명은 `index.js`의 INSTRUMENTS 등록과 `build/build_standalone.py`의 INSTRUMENT_MAP이 SSOT다.
현재는 Hioki3540, Keithley2700, Keithley2400, MitutoyoVL50, Agilent4339B, DAQ6510,
SP2100, PT2000, LT1000, AIPhotoEditor, PST3202, EpsonOK900P, EtchingDesign을 포함한다.

**2단계: EXE 패키징** (사전 준비: `pip install pywebview pyinstaller`)
```bash
python build/package_exe.py dist/SP2100
# → dist/SP2100.exe 생성
```

### 동작 원리
- `App(instruments)` 생성자가 INSTRUMENTS 레지스트리를 파라미터로 받음 (`core.js`)
- `standalone_entry.js`는 빌드 스크립트가 자동 생성 — 선택된 계측기만 import
- 단일 계측기: `app.launchInstrument(Name)` 즉시 호출해 런처 화면 건너뜀
- EXE 실행 시: 내장 `http.server`로 임의 포트에 파일을 서빙 → pywebview 창으로 표시
- Web Serial API는 pywebview 내 Chromium에서 동작 (별도 브라우저 불필요)

### 새 계측기 추가 시 빌드 스크립트 갱신 필요
`build/build_standalone.py`의 `INSTRUMENT_MAP` 딕셔너리에 항목 추가:
```python
'NewDevice': ('NewDevice', 'instruments/new_device.js'),
```

## 7. 직전 작업 / 다음 할 일

### 2026-07-05 완료 작업 — 언어 전환(한/영) 전면 점검

PST-3202 i18n 적용(2026-07-04) 후 "다른 계측기도 언어 전환이 되는지" 전수 점검. 헤드리스
브라우저로 계측기 10개를 영어 모드로 렌더링해 잔여 한국어를 스캔하는 방식으로 진행.

**실제 버그 6종 발견·수정** (자세한 내용은 `개발_이슈_및_성과_정리.md` §17 참고):
1. `core.js` BoxPlot — Y축 오토스케일 placeholder/title "자동" 하드코딩 → `t('y_axis_auto')`
2. `core.js` `_buildPanels` — 스플릿 그래프 빈 상태 문구 하드코딩 → `t('chart_empty')`
3. `index.html`/`standalone.html` — 계측기 관리 모달 placeholder 미번역 →
   `_applyLang()`에 `data-i18n-placeholder` 지원 신규 추가
4. `core.js` `_openCardEdit` — 카드 편집 모달 placeholder 4개 하드코딩 → 키 4개 신설
5. **그리드 계측기(Hioki·Keithley·VL-50)** — 계측기 화면이 열린 채로 언어 전환 시 중앙
   상태표시줄·우측 그래프 패널·데이터 그리드 헤더가 전혀 재번역 안 됨. `_rebuildInstrumentSidebar()`의
   grid 분기가 사이드바만 재생성하고 center/rightpanel은 launchInstrument() 최초 1회만 빌드되던
   구조적 문제 — `setSplit()`과 동일한 `_savePanelData()` + `_buildPanels()` 재호출을 추가해 해결
   (기록 데이터는 masterData/vl50Data에서 복원되므로 유실 없음)
6. `sp2100_logger.js`/`agilent_4339b.js`/`pt2000_probe_tack.js`/`lt1000_loop_tack.js` —
   각 파일에 복붙되어 있던 `_attachYOverlay`의 동일한 "자동" 하드코딩 (core.js BoxPlot과 별개 구현)

**Photo Editor — 대규모 신규 작업** (읽기 전용 보호 파일, 사용자 명시 승인 후 진행):
- 번역 시스템이 전혀 적용되어 있지 않았음 (기존 `ai_*` 키 14개는 죽은 코드 — 미참조)
- `t()`/`tf()` 헬퍼 신설, 하드코딩 문자열 57건 전부 교체 (USB 현미경/크롭/파일목록/회전/촬영/
  폰연동/Excel·ZIP 내보내기 상태 메시지)
- `core.js`에 `ai_*` 키 40개 신규 추가 + 기존 3개(`ai_per_row` 등) 값이 실제 UI 문구와
  안 맞아 최신화

**검증**: 10개 계측기 전부 헤드리스 EN 렌더 재검사 — 잔여 한국어 0건. dist 동기화 +
`dist/3M_Instrument_Logger.exe` 재빌드 완료.

> ⚠️ **패턴 주의**: `viewType: 'custom'` 계측기는 `_rebuildInstrumentSidebar()`가
> buildSidebar/buildCenter/buildRightPanel을 전부 재호출하므로 `t()`만 잘 쓰면 언어 전환이
> 자동으로 해결된다. 반면 `viewType: 'grid'`(Hioki/Keithley/VL-50)는 `dynamicSettings` 영역만
> 재생성되므로, 계측기 자체가 아니라 **core.js의 grid 뷰 인프라 코드**에 새 하드코딩 텍스트를
> 추가할 경우 반드시 `data-i18n` 계열 속성을 쓰거나 `_rebuildInstrumentSidebar()`의 grid
> 분기에서 재번역되도록 확인할 것.

### 2026-06-23 완료 작업

#### 수염차트 Y축 수동 편집 기능 (`core.js`, `index.css`, `sp2100_logger.js`, `agilent_4339b.js`, `pt2000_probe_tack.js`, `lt1000_loop_tack.js`)

모든 수염차트(Box & Whisker)에 Y축 범위를 사용자가 직접 수정할 수 있는 기능을 추가했습니다.

- **동작 방식**:
  - 처음 평가 시 Y축은 데이터 범위에 맞게 자동 설정됨
  - 차트 좌측 Y축의 최댓값/최솟값 위치에 투명 입력창(`y-axis-inp`)이 오버레이됨
  - 값을 입력(Enter 또는 포커스 이탈)하면 즉시 차트에 반영
  - 커스텀 Y값이 설정되면 우측 상단에 ↺ 초기화 버튼(`y-reset-btn`) 표시 → 클릭하면 자동 Y축으로 복귀
  - 변경값은 세션 내에서만 유효 (localStorage에 저장하지 않음)
  - 캔버스에 그리던 최솟값/최댓값 텍스트는 입력창이 있을 때 생략 (겹침 방지)

- **`core.js` 변경 내용 (BoxPlot 클래스 — Hioki·Keithley·VL-50)**:
  - `BoxPlot` 생성자에 `_customYMin`, `_customYMax`, `_lastArgs`, `_minInp`, `_maxInp`, `_resetBtn` 필드 추가
  - `attachYControls(graphAreaEl)` 메서드 신규 추가: `.y-overlay` div + 두 개의 `y-axis-inp` input + ↺ 버튼 생성 및 이벤트 연결
  - `_positionInputs(H)` 메서드 신규 추가: 캔버스 높이 기준으로 max/min 입력창과 ↺ 버튼 절대 위치 계산 (`padT=28, padB=44`)
  - `draw()` 에서 `_lastArgs` 저장, 커스텀/자동 Y 범위 선택, placeholder 업데이트, min/max 레이블 조건부 생략

- **`index.css` 변경 내용**:
  - `.y-overlay`: `position:absolute; inset:0; pointer-events:none`
  - `.y-axis-inp`: 투명 배경, hover/focus 시 테두리 표시, `pointer-events:all`
  - `.y-reset-btn`: 우측 상단 절대 위치, 기본 숨김(`display:none`), 커스텀 값 설정 시 표시

- **각 계측기 파일 공통 변경 패턴** (`sp2100_logger.js`, `agilent_4339b.js`, `pt2000_probe_tack.js`, `lt1000_loop_tack.js`):
  - `S` 초기화: `_yMin: null, _yMax: null, _yMaxInp: null, _yMinInp: null, _yResetBtn: null` 추가
  - 모듈 레벨에 `_attachYOverlay(graphAreaEl, redrawFn)` 헬퍼 함수 추가 (↺ 버튼 포함)
  - `buildRightPanel()`에서 기존 `y-ctrl` HTML 제거 → `_attachYOverlay()` 호출로 대체
  - 각 계측기 drawChart/drawGraph 함수에서 커스텀/자동 Y 범위 분기 처리, 입력창·버튼 위치 동적 계산

#### LT-1000 Loop Tack UI 개선 (`lt1000_loop_tack.js`, `core.js`)

**팝업 모달 버튼 LED 표시**
- 기존 팝업(`lt_modal_guide0`, `lt_modal_guide1`, `lt_memFullModal`)에서 `Run`, `Print` 버튼 텍스트 앞에 빨간 LED(●) 인디케이터 추가
- 공통 변수: `ledSty` (flex 정렬 포함 stepSty), `redLed` (red 원형 span with box-shadow)

**"데이터 전송 방법" 버튼 + 팝업 (`lt_modal_howto`)**
- 사이드바의 정적 안내 박스(`lt_notice`)를 **"📋 데이터 전송 방법"** 버튼으로 교체
- 팝업 내 플로우: `Select` → 🔴`Print` → `Enter` → `Enter` → `타이머 종료 후 자동 기록(녹색)`

**"로드셀 캘리브레이션 방법" 버튼 + 팝업 (`lt_modal_calib`)**
- "데이터 전송 방법" 버튼 위에 **"⚖️ 로드셀 캘리브레이션 방법"** 버튼 추가
- 팝업 5단계 플로우 스타일:
  1. `로드셀 최상단 이동` → `고정핀 체결`
  2. `Select+Enter 3s+` → 🔴`Setup` → `Enter`
  3. `LC 0.000 확인` → `Enter`
  4. `HC 1000 표시` → `1 kg 분동 올리기(파란색)` → `Enter` + `assets/LT-1000 1kg.png` 이미지 표시
  5. `추 제거` → `로드셀 파지` → `고정핀 해제` → `조심히 내려놓기`
- 이미지 파일 경로: `assets/LT-1000 1kg.png`

**디스플레이 바 Run 상태 안내**
- 디스플레이 가운데 경고 문구(`⚠ P — 20개 등록 시…`) 제거
- 대신 🔴 LED + `"Run 상태(빨간 LED)에서 평가를 진행하세요"` 상시 표시

**"ST FULL 해결 방법" 버튼 + 팝업 (`lt_modal_stfull`)**
- "데이터 전송 방법" 버튼 아래에 **"⚠️ ST FULL 해결 방법"** 버튼 추가
- 팝업 플로우: `Select` → 🔴`Print` → `▲ ×2` → `DL` → `Enter` → `Select+Enter 3s+` → `초기화 완료 / 다시 평가 시작(녹색)`
- `core.js` 번역 키 추가: `lt_run_hint`, `lt_stfull_btn/title/body/done`, `lt_calib_btn/title/body/s1~s7/img_cap`, `lt_howto_btn/title/body/auto`

### 2026-06-18 완료 작업

#### 수염차트(Box plot) 상단 평균값(사선) 표기 및 LT-1000 설명 보완 (`core.js`, `sp2100_logger.js`, `dist/3M_Instrument_Logger.exe`)
- **수염차트 상단 평균값(사선) 표기 표준화**:
  - HIOKI, Keithley 2700, Mitutoyo VL-50 계측기용 수염차트(`core.js`) 및 SP-2100/TL-2200용 수염차트(`sp2100_logger.js`) 상단에 평균값 텍스트가 단위(`Ω`, `mm`, `g`)와 함께 비스듬하게 표시되도록 개선했습니다. (이로써 다른 커스텀 계측기 수염차트와 완벽히 동일한 형식을 갖추게 되었습니다.)
- **LT-1000 Loop Tack 사용 가이드 및 로드셀 교정 매뉴얼 제공**:
  - 사용자 문의에 대응하여 LT-1000 계측기의 수동 측정 데이터 수신 방법(Grams 단위 세팅, ST On 설정, Print -> Enter 전송 흐름, 20개 메모리 초과 시 초기화)을 한국어 설명서 형태로 제공했습니다.
  - ChemInstruments LT-1000 로드셀 교정(로드셀 어셈블리 고정, [Select]+[Enter] 3초 진입, LC 무부하 0점 교정, HC 분동 입력 교정) 가이드를 제공했습니다.
- **최종 빌드 및 EXE 패키징**:
  - 위의 수정사항들을 standalone 디렉토리에 동기화하고 `3M_Instrument_Logger.exe` 실행 파일을 재패키징했습니다.

#### Mitutoyo VL-50 그리드 연동 및 입력 버그 수정 (`core.js`, `mitutoyo_vl50.js`)
- **VL-50 테스트 방법 선택 연동 및 기본 모드 설정**:
  - HIOKI/Keithley 2700과 동일하게 그리드 뷰(`viewType: 'grid'`)를 유지하면서도 드롭다운에서 테스트 방법(`MSL-2`, `ETM-7` 등)을 연동하여 선택할 수 있도록 구현.
  - VL-50 진입 시 기본 모드로 `MSL-2`가 선택되고, 기본 그룹 개수가 `6`으로 자동 지정되도록 연동.
  - VL-50은 분할 화면이 불필요하므로 `hideSplit: true`를 적용하여 1개 패널만 나타나도록 설정.
- **그리드 뷰 내 수동 "그룹 개수" 입력 필드 제거**:
  - HIOKI, Keithley 2700, Mitutoyo VL-50 계측기용 그리드 뷰 화면에서 불필요하고 혼란을 줄 수 있는 수동 "그룹 개수" 입력 필드(및 다중 패널 시의 헤더 입력 필드)를 완전히 제거함.
  - 이제 각 테스트 방법의 속성(`cols`, `group` (구분 칸 수), `set` (세트 크기)) 값으로 테이블 분할 및 박스 플롯 그래프 그룹화가 안전하게 연동 및 제어됩니다.
- **수염차트(Box plot) 그룹 범위 라벨링 및 최근 3그룹 제한 표준화**:
  - HIOKI, Keithley 2700, Mitutoyo VL-50(`core.js`), SP-2100/TL-2200(`sp2100_logger.js`), Agilent 4339B(`agilent_4339b.js`)의 모든 수염차트 그룹 묶음 단위를 `set` (세트 크기) 설정값에 맞춰 완벽히 표준화하고, X축 라벨을 `#1 (1-1~1-6)`, `#2 (2-1~2-6)`과 같이 실제 그룹 번호와 세트 내 행 범위가 같이 출력되도록 개선함.
  - 모든 장비의 수염차트에서 데이터 양이 누적되어도 항상 최근 최대 3개의 그룹만 깔끔하게 노출되도록 슬라이스 조치함.
- **그리드 레이아웃 잘림(Right Panel 찌그러짐) 현상 수정 (`index.css`)**:
  - 측정 데이터 테이블의 가로 폭이 늘어날 때 Center 컬럼이 유연하게 줄어들지 않고 우측 차트 패널(Right Panel)을 화면 바깥으로 밀어내어 그래프가 잘려 보이던 Grid/Flexbox 버그를 수정.
  - `#layout`의 grid-template-columns 설정을 `minmax(0, 1fr)`로 교정하고 `#center`에 `min-width: 0`을 부여하여 테이블 내부 가로 스크롤바가 정상 생성되고 그래프 패널 공간이 언제나 360px로 확실히 보장되도록 수정 완료.
- **그리드 셀 캐시 누적 버그 수정 (`core.js` - `EditableGrid._render()`)**:
  - 값 입력 도중 그룹 개수(group count)를 변경하면 `_render()`가 다시 호출되는데, 이때 기존의 `this._cells` 리스트가 비워지지 않고 누적되는 버그를 발견하여 수정.
  - 이로 인해 화면에서 분리(detached)된 이전 Input 요소에 데이터가 기입되어 화면에 반영되지 않던 문제를 `_render()` 시작 시 `this._cells = [];`를 수행하도록 하여 해결.
- **클래스 및 동기화 복구**:
  - 이전 작업 과정에서 삭제되었던 `BoxPlot` 클래스 정의를 `core.js`에 정상 복구하여 화면이 빈 페이지(블랭크)로 나타나던 현상 즉시 수정.
  - 그룹 개수 변경 시 좌측 세트 번호(1-1, 1-2 등) 및 구분 실선이 변경된 값에 맞추어 실시간 동기화 갱신되도록 개선.
- **Agilent 4339B 테이블 컬럼 헤더 번역 단축**:
  - 사용자 피드백에 맞춰 Agilent 4339B의 데이터 테이블 헤더가 보다 가로 폭을 적게 차지하도록 번역 문구를 단축 조치함.
    - `Measurement Mode` -> `Mode` (모드)
    - `Applied Voltage (V)` -> `Voltage (V)` (전압 (V))
    - `Charge Time (s)` -> `Charge (s)` (충전 (s))
    - `Sample Thickness (mm)` -> `Thickness (mm)` (두께 (mm))
  - 데이터 복사(Copy) 및 CSV 내보내기(Export CSV) 시 생성되는 파일의 헤더 또한 위와 동일하게 매칭하여 데이터 정합성을 일치시킴.
- **빌드 및 EXE 패키징**:
  - `build_standalone.py` 및 `package_exe.py`를 재실행하여 수정된 코드가 반영된 `3M_Instrument_Logger.exe` 실행 파일 빌드 및 패키징 완료.

#### DAQ-6510 (`instruments/daq_6510.js`) — 스캔 방식 전면 수정

**스캔 모드 아키텍처 확인 및 재구현**
- **사용자 의도 명확화**:
  - 채널 딜레이(2초) = 스캐너 카드가 채널 간 전환할 때 각 채널을 2초 간격으로 측정
  - 전체 10채널 1사이클 ≈ 22초 소요
  - "3분마다 기록" = 3분마다 10채널 한 사이클 INIT → 결과 1행 기록 (그래프 메모리 부하 방지)
- **1채널만 측정되는 문제 해결**:
  - `READ?`는 단일 측정 명령(1트리거 → CH101만 반환)임을 실기 확인
  - `TRAC:DATA? 1,10,...` 에러 2859 원인: `READ?`로 1개만 측정됐는데 10개 요청 → 버퍼에 1개뿐
  - **해결**: `INIT`으로 10채널 전체 트리거 후 `TRAC:DATA?`로 한 줄 응답(쉼표 구분 10값) 수신
- **현재 Rear 스캔 시퀀스** (매 사이클):
  ```
  ABOR                                    → 이전 상태 초기화
  TRAC:CLE "defbuffer1"                   → 버퍼 비우기
  TRIG:COUN <nCh>                         → 트리거 횟수 = 채널 수
  (400ms)
  INIT                                    → 전체 스캔 시작 (nCh 트리거)
  (nCh × (delayS×1000 + 500) + 5000 ms)  → 스캔 완료 대기
  TRAC:DATA? 1,<nCh>,"defbuffer1",READ   → 전 채널 값 1행 수신
  ```
- **`TRIG:COUN` 제거**: `ROUT:SCAN:CRE` 사용 시 트리거 모델이 자동 구성됨 — `TRIG:COUN` 전송하면 -113 에러 발생하므로 절대 사용 금지
- **`TRAC:DATA?` / `INIT` 방식 완전 폐기**: Error 1135 발생 확인 → 아래 방식으로 교체
- **최종 Rear 스캔 아키텍처 (ROUT:SCAN:CRE 완전 폐기, 수동 릴레이 제어)**:
  - `ROUT:SCAN:CRE` 제거 — `READ?` 단독으로 CH101만 반환(스캔 리스트 미동작), Error 2859 유발
  - **채널별 수동 릴레이 제어** (`doChannelRead()` 함수):
    ```
    ROUT:OPEN:ALL (50ms 대기)
    ROUT:CLOS (@chId,chId+10)  ← 4-wire 시 소스+센스 동시 (300ms 안정화)
    READ?
    → 값 수신 후 즉시 ROUT:OPEN:ALL (릴레이 해제)
    → 남은 딜레이 대기 후 다음 채널
    ```
  - 4-wire 채널 쌍: `chId + 10` (예: CH101 소스 + CH111 센스)
  - 각 채널 값 수신 즉시 디스플레이 표시 + `_scanRow[idx]`에 누적
  - 10채널 완료 시 테이블 1행 추가 (`appendTableRow`)
  - 그래프: 3분마다 갱신 (`scanMode === 'full3m'`) 또는 매 사이클 (`realtime`)
  - **채널 딜레이 정밀 보정**: `_channelStartTime`을 `doChannelRead()` 진입 시 기록 → 응답 후 `남은시간 = delayMs - elapsed`로 보정하여 정확히 N초 간격 유지
  - **측정 후 릴레이 즉시 해제**: `onLine()` 수신 직후 `ROUT:OPEN:ALL` 전송 → 대기 시간 동안 릴레이 오픈 상태 (채널 간 간섭 방지)
  - `stop()` 시 `clearTimeout(S._channelTimer)` 필수

**디스플레이 레이아웃 (3-컬럼 flex)**
- 좌측(130px 고정): SLOT N / CH NNN / 샘플이름 — 측정 중에만 표시 (`daq_liveInfo`)
- 중앙(`flex:1`): 저항값 + 단위 — 항상 정중앙 정렬 (`liveValue`)
- 우측(고정): LOGGING 상태 / Records / Est.End

**그래프 X축 동적 스케일**
- 데이터 < 1000행: 실제 경과 시간 + 5% 여백 (auto-fit, 초기 데이터가 가득 차 보임)
- 데이터 ≥ 1000행: 1시간 단위 ceiling으로 성장 (0→1h→2h→3h…)
- 1시간 미만 구간: X축 라벨을 분(m) 단위로 표시
- `drawChart(slot)` 및 `drawChartFront()` 양쪽에 동일 로직 적용
- **90h 고정 스케일 완전 폐기** — 초반에 데이터가 좌측 극단에 몰리는 문제 해결

### 2026-06-17 완료 작업

#### DAQ-6510 (`instruments/daq_6510.js`)

**연결 / SCPI 오류 수정**
- `-113 에러 (Undefined header)` 수정:
  - `ROUT:TERM REAR` 명령은 read-only — 연결 시 전송하던 것 제거
  - DMM 설정을 스캔 리스트 내 채널별이 아닌 전역(`SENS:FRES:…`)으로 변경
  - 채널 구성 리스트에 파라미터(`(@101:…)`) 복원 — 4-wire resistance 쌍 설정 유지
- **네이티브 스캔 (`ROUT:SCAN:CRE`) 구현**: 백플레인 릴레이 정상 라우팅
- **채널 딜레이 명령 수정**: `ROUT:SCAN:DELay` → `ROUT:CHAN:DELay` (올바른 키워드)

**UI / 기능 개선**
- **Front 모드에서 스캔 비활성화**: Front 단자 선택 시 `ROUT:SCAN` 관련 컨트롤 숨김/비활성화
  (사용자 요청 — Front는 단일 측정점, 스캔 불필요)
- **Rear 토글 클릭 시 슬롯 자동 감지**: `ROUT:SCAN:CAT?` 명령으로 장착된 슬롯 번호 조회,
  해당 슬롯 채널 자동 활성화
- **초기 연결 시 Rear 자동 슬롯 감지**: 연결 시 Rear 모드이면 즉시 슬롯 감지 실행
- **종료 예정 시각 표시 + 자동 종료**: 측정 시간 입력값(`parseTotalMs`)으로 종료 예정 시각을
  display-bar에 표시; 해당 시간 도달 시 `autoStopTimer`로 자동 `stop()` 호출
- **측정 간격 수정**: 채널간격 N초 설정이 실제로 N초마다 1회씩 기록되도록 타이밍 보정
- **우측 그래프 추가**: 측정값을 채널별로 선 그래프로 표시 (시계열)

#### Agilent 4339B (`instruments/agilent_4339b.js`, `core.js`, `index.css`)

**측정 시퀀스 전면 재작성 (Python 단독 프로그램 기준)**
- 레퍼런스: `C:\Users\0op64\.gemini\antigravity\scratch\Agilent 4339B\agilent4339b.py`
- **-213 에러 (INIT IGNORED)** 원인: 이전 JS 코드가 `TRIG:SOUR BUS` 없이 `:MEAS:RES?` 사용
  → `:MEAS:RES?`는 내부적으로 ABORT+INIT+FETCH를 수행하지만 BUS 트리거 모드와 충돌
- 올바른 시퀀스:
  ```
  [설정] *RST → 2.2s → *CLS → FUNC 'RES' → SOUR:VOLT → TRIG:SOUR BUS → OUTP ON
  [측정] 차징 대기 → ABOR → *CLS → INIT → 0.5s → *TRG → 0.5s → FETC?
  [종료] OUTP OFF → 0.5s → *CLS  (_safe_off)
  ```
- 제거한 잘못된 명령: `:SENS:MODE SURF/VOL` (Python 미사용), `:SENS:CURR:RANG:UPP` (Python 미사용)
- `logResult()`: `FETC?` 응답 파싱 — `status,value` CSV 형식, status≠0이면 I-Limit 표시

**표시 / 그래프 개선**
- **차징 카운트다운**: 충전 대기 중 상단 디스플레이에 남은 초(`N s`) + `CHARGING` 상태 표시
- **측정값 자릿수 통일** (`toExponential(4)` = 5 유효숫자): 장비 표시(`+1.9864E+14`)와 일치;
  이전 `toExponential(3)` = 4자리였음 — 테이블·차트·CSV·클립보드 모두 수정
- **측정 후 디스플레이 유지**: 기존엔 측정 완료 시 "DONE"으로 덮어씌워짐 →
  `S.lastRaw`에 저장 후 `finishOne()`에서 마지막 측정값 표시
- **그래프 캔버스 비율 수정**: `#agChart`가 CSS `width:100%;height:100%` 셀렉터에 누락되어
  차트가 찌그러지던 문제 → `index.css`에 `#agChart` 추가
- **샘플명 인라인 편집**: `renderTable()`의 샘플명 열을 `<input class="pt-name-inp">` 으로 변경;
  `renameSample(i, val)` 함수로 `S.rows[i].sample` 즉시 갱신 (PT-2000/LT-1000과 동일 방식)
- **그룹별 수염차트 (Box & Whisker)**: `drawChart()` 전면 개편
  - 그룹 개수 = 1: 기존 개별 막대 그래프 유지
  - 그룹 개수 ≥ 2: `S.rows`를 N개씩 묶어 그룹별 Box & Whisker 렌더링
    - 상자: Q1~Q3, 중앙선: 중앙값, 수염: 최솟값~최댓값, 개별 점 표시
    - X축 레이블: `#1`, `#2`, `#3` …, 미완성 그룹은 `n/repeat` 부기
  - `ag_repeatCount` 변경 시 즉시 재렌더 (`_redrawChart` 노출)
  - `_quartile(sorted, q)` 헬퍼 추가 (선형 보간 분위수)

### 이전 세션에서 완료된 작업 (참고)
- **설정 영속화**: 전 계측기(Hioki, Keithley, Agilent, DAQ-6510, PT-2000, LT-1000) `localStorage` 저장/복원 구현
- **버튼 표준화**: 데이터 테이블 버튼을 `[복사][CSV 저장][선택 삭제][전체 삭제]` 순서로 통일, 언어 전환 시 반영
- **그룹 개수 통일**: `group_repeat_label` 키로 PT-2000·LT-1000·Agilent 4339B 라벨 통일; 번호 자동 채번 로직 동일화

### 2026-06-23 추가 완료 작업 (EXE 런처 카드 미표시 버그 근본 수정)

#### EXE 실행 시 런처 카드가 전혀 표시되지 않는 문제 — 3중 근본 원인 발견 및 수정

**현상**: EXE를 실행하면 "계측기를 선택하세요" 텍스트와 상단 내비게이션 바만 보이고
계측기 카드가 하나도 표시되지 않음. 브라우저(`http://localhost:8001/index.html`)에서는
정상 작동. try-catch 오류 메시지도 표시되지 않음.

**중요 함정**: 내비게이션 바(테마/언어/연결 안됨)와 "계측기를 선택하세요"는
**정적 HTML**(`standalone.html`)로 JavaScript 없이도 표시됨.
이것이 보인다고 해서 JavaScript가 실행된 것이 **아님**.

**근본 원인 1 (핵심) — dist 파일 스탤(stale) 문제:**
- `dist/3M_Instrument_Logger/instruments/sp2100_logger.js`에 `const isNum`이
  **동일 스코프에서 2회 선언**되어 있었음
- ES 모듈은 `strict mode` 자동 적용 → `const` 중복 선언 = `SyntaxError`
- `standalone_entry.js` → `sp2100_logger.js` import 시 SyntaxError 발생
  → import 체인 전체가 **조용히 실패** (try-catch도 module import 오류는 포착 불가)
- 소스 `instruments/sp2100_logger.js`에는 해당 중복이 없었음 — **dist가 소스와 달랐던 것**
- **수정**: dist의 `sp2100_logger.js`에서 중복 선언 1줄 제거 (by 안티그래비티)

**근본 원인 2 — PyInstaller 환경 MIME 타입 문제:**
- PyInstaller로 번들된 Python은 Windows 레지스트리 접근이 제한되어
  `mimetypes.guess_type('.js')` → `application/octet-stream` 또는 `None` 반환
- Chromium(pywebview)은 잘못된 MIME 타입의 ES 모듈 import를 **조용히 거부**
- **수정**: `build/package_exe.py`의 Handler 클래스에 `guess_type()` 메서드 오버라이드 추가
  ```python
  def guess_type(self, path):
      ext = os.path.splitext(path)[-1].lower()
      if ext in ('.js', '.mjs'): return 'application/javascript'
      if ext == '.css': return 'text/css'
      # ... (png, jpg, svg, woff 등 포함)
      return super().guess_type(path)
  ```

**근본 원인 3 — localStorage 인라인 주입 크기 문제:**
- 기존: `app_storage.json` 전체(사진 base64 포함 ~41KB)를 HTML `<head>` 인라인 `<script>`에 삽입
- Qt WebEngine이 대용량 인라인 스크립트 파싱에 실패하는 경우 발생
- **수정**: 동기 XHR 방식으로 변경 — 폴리필이 `/api/storage/data` 엔드포인트를 동기 호출
  ```js
  var _x = new XMLHttpRequest();
  _x.open('GET', '/api/storage/data', false);  // 동기
  _x.send();
  var d = JSON.parse(_x.responseText);
  ```
  → HTML은 항상 작은 크기, 데이터는 별도 API로 요청

**CSS 스탤 문제 (카드 팝업 디자인 깨짐):**
- `dist/3M_Instrument_Logger/index.css`가 소스와 달리 구버전이어서
  `.card-info-popup` 등 최신 스타일이 누락되어 있었음
- **수정**: 소스 `index.css`를 dist에 복사

#### EXE 재빌드 절차 표준화

EXE 빌드 전 반드시 다음 순서로 dist 파일을 소스와 동기화해야 함:
```powershell
# 1. 소스에서 dist 재생성 (instruments가 읽기 전용인 경우 먼저 attrib -r)
python build/build_standalone.py Hioki3540 Keithley2700 MitutoyoVL50 Agilent4339B DAQ6510 SP2100 PT2000 LT1000 AIPhotoEditor ClubExpense

# 2. EXE 패키징
python build/package_exe.py dist/3M_Instrument_Logger
```
파일이 읽기 전용 잠금으로 `build_standalone.py` 실패 시, 최소한 변경된 소스 파일을
dist에 수동 복사 후 `package_exe.py` 실행.

> **주의**: `build_standalone.py`의 `AIPhotoEditor` 항목은 `instruments/photo_editor.js`를 가리킴.
> `ai_photo_editor.js`로 되돌리지 말 것 (2026-06-30 파일명 변경).

### 2026-06-29~30 완료 작업 (Photo Editor USB 현미경 기능 개선)

#### Photo Editor (`instruments/photo_editor.js`) — 파일명 변경 + USB 현미경 안정화

**파일명 변경**
- `instruments/ai_photo_editor.js` → `instruments/photo_editor.js` (ai_ 접두사 제거)
- `assets/ai_photo_editor.png` → `assets/photo_editor.png` (아이콘 동시 업데이트)
- `index.js`, `build/build_standalone.py`, `AGENTS.md` 참조 모두 업데이트
- `SETTINGS_KEY = 'ai_photo_editor_settings'` (localStorage 키)는 기존 저장 설정 보호를 위해 유지

**USB 현미경 연결 안정화**
- `listUSBCams()` 권한 요청 후 임시 스트림 즉시 해제 — 내장 카메라 점유로 인한 현미경 연결 실패 방지
- `deviceId: { exact: … }` → `{ ideal: … }` 변경 — deviceId 불일치 시 폴백 허용
- 내장 카메라 키워드 필터(`integrated`, `built-in`, `webcam` 등) 적용 → Digital Microscope 자동 우선 선택

**Step 2 → 돌아가기 시 카메라 복원**
- `backToStep1()` 이 `buildCenterStep1()`로 HTML 재생성 후 기존 `S.usbStream`을 새 `<video>` 요소에 자동 재연결
- 줌 슬라이더(`aiUsbZoomRow`), 크롭 섹션(`aiUsbCropSection`) 표시 상태 복원
- `setupUSBCropCanvas()` 재호출로 크롭 오버레이 재설정

**크롭 박스 버그 수정**
- 카메라 모드(`S.showCamera=true`)에서 `aiCropCanvas` 명시적 `display:none` — 실수로 드래그해도 `_cropPct` 변경 안 됨
- 파일 썸네일 클릭 시 `_cropPct = null` 초기화 — 이전 잔여 크롭 박스가 다음 사진 미리보기에 표시되지 않음

**촬영 중복 방지**
- `_capturing` 플래그 + 촬영 중 버튼 `disabled`/반투명 처리 — 빠른 다중 클릭으로 인한 중복 촬영 방지

**파일 이름 자동 생성**
- 기존 `usb_타임스탬프.jpg` → `그룹번호-위치번호.jpg` (예: `1-1.jpg` ~ `1-6.jpg`, `2-1.jpg` ~ `2-6.jpg`)
- 그룹 개수(`S.perRow`) 기준으로 촬영 순서에 따라 자동 산출

### 2026-07-01 완료 작업 (Photo Editor 엑셀 내보내기 개선 + 런처 UI 개편)

#### Photo Editor (`instruments/photo_editor.js`) — 엑셀 이미지 겹침 수정 + 그룹화 + ZIP 저장

**엑셀 이미지 겹침 버그 근본 수정**
- **원인**: 기존 `ext: { width: px, height: px }` 방식에서 ExcelJS 내부가 픽셀을 포인트로 해석 → 96dpi vs 72dpi 차이로 이미지가 33% 크게 배치 → 겹침 발생
- **수정**: `tl/br` 셀 기반 배치로 전면 교체 (픽셀/포인트 단위 혼선 없음)
  ```js
  ws.addImage(imgId, { tl: { col: c, row: r+1 }, br: { col: c+1, row: r+2 }, editAs: 'oneCell' });
  ```
- 열 너비: `outW * 96 / 7` 글자 (인치→픽셀→글자 정확 변환)
- 행 높이: `outH * 72` pt (인치→포인트 직접 변환)
- 헤더 셀: `N그룹` 형식으로 변경

**Excel 네이티브 그룹 기능 (`_groupImagesInXlsx()`)**
- ExcelJS 생성 xlsx를 JSZip(`cdn.jsdelivr.net/npm/jszip@3.10.1/+esm`)으로 후처리
- `xl/drawings/drawing1.xml`에서 개별 `<xdr:twoCellAnchor>` 블록 추출
- 그룹당 `perRow`개를 하나의 `<xdr:grpSp>`로 묶어 재조립
  - 그룹 좌표계: `chOff/chExt`로 정의, 내부 이미지는 EMU 오프셋(`y = r * outH * 914400`)
- JSZip 로드 실패 시 그룹 없이 원본 xlsx 반환 (폴백)
- **결과**: Excel에서 그룹 내 사진 클릭 시 6장 통 선택, 우클릭 → 그룹 해제로 개별 선택 가능

**JPEG 저장 → ZIP 저장**
- 기존: 개별 파일 n번 다운로드 팝업
- 수정: JSZip으로 모든 사진을 `photos.zip` 한 파일로 묶어 1회 다운로드
- 처리 중 버튼 "압축 중…" 표시 + disabled 처리

#### 런처 카드 UI 개편 (`core.js`, `index.css`)

**섹션 구성 변경**
- 기존: 저항 / 두께 / 점착력 / Software 4개 섹션 헤더
- 변경: **계측기 / Software 2개 섹션**으로 통합
  - 계측기 섹션: 저항·두께·점착력 전체
  - Software 섹션: Photo Editor 등

**카드 레이아웃 변경**
- 상단에 `card-type` 라벨 추가 ("계측기" or "Software", 10px 소문자, 회색)
- 하단 `card-cat`에 분류 표시 (저항/두께/점착력, 차분한 텍스트 — 기존 파란 배지 제거)
- 전체 카드 구조: `card-type` → 이미지 → 이름 → `card-cat`

#### Club Expense 완전 영구 제거 (`index.js`, `core.js`, `build/build_standalone.py`, 파일 삭제)
- `instruments/club_expense.js` 및 `assets/club_expense.png` 완전 영구 삭제 (재유입 원천 차단)
- `core.js` `_LAUNCHER_GROUPS` 및 `index.js` import/레지스트리에서 제거
- `build/build_standalone.py` `INSTRUMENT_MAP`에서 완전 제거
- 과거 standalone 빌드 잔여 폴더(`dist/*ClubExpense*`) 정리 및 클린 EXE 재빌드/GitHub 릴리즈 완료

### 미해결 / 후속 작업
- **체크박스 재측정**: ✅ 전 계측기 완료
  - PT-2000: 기존 구현, LT-1000: `importTest()` 수정 완료, Agilent 4339B: `logResult()` 수정 완료
- **그룹별 그래프 (PT-2000 / LT-1000)**: ✅ 완료 — 그룹 개수 ≥ 2 시 Peak(gf) 수염차트로 전환
- **수염차트 Y축 수동 편집**: ✅ 완료 — 전 계측기(Hioki·Keithley·VL-50·SP-2100·Agilent·PT-2000·LT-1000) 적용
- **LT-1000 팝업 가이드**: ✅ 완료 — 데이터 전송 방법 / 캘리브레이션 방법 / ST FULL 해결 방법 팝업 구현
- **DAQ-6510 실기 테스트**: ✅ 완료 — 10채널 순차 측정 및 딜레이 정밀도 현장 확인 완료
- **Agilent 4339B 실기 테스트**: ✅ 완료 — 재작성 시퀀스로 -213 에러 없이 정상 측정 확인
- **SP-2100 파형 디코딩**: 🔧 Raw 수집 확인·디코딩 대기 — 2026-09-03 COM5/38400 실기에서 시험별 3.4~3.7KB 바이너리 블록 수집에 성공했으나, 8/16-bit 직접 해석은 잡음이며 IMASS DataLink/ExLink 독점 변환 규칙이 필요하다. 변환 검증 전 파형 표시·구간 통계 구현 금지. 상세: `docs/SP2100_RAW_CAPTURE_ANALYSIS_20260903.md`.
- **Agilent 4339B GPIB**: 🔧 드라이버 설치만 하면 완료 — NI GPIB-USB-HS 드라이버 설치 후 PyVISA IPC 브리지 연결 예정. 코드 측 준비는 완료된 상태.
- **EXE 재패키징**: ✅ 완료 — 2026-06-30 세션 변경사항 반영, `dist/3M_Instrument_Logger.exe` 재빌드 완료
- **PST-3202 실기 테스트**: 🔧 미완료 — 3채널 동기화·입력 검증·auto-clamp 기능 구현 완료, 실기 연결 검증 필요
- **PST-3202 EXE 등록**: ✅ 등록 완료 — `build/build_standalone.py` INSTRUMENT_MAP에 PST3202 항목 존재, dist에도 포함됨. 단 dist 파일이 소스보다 오래됨(2026-07-04 점검 기준 core.js/index.css/standalone.html/pst3202.js/pt2000 5개 DIFF) — **EXE 재패키징 전 dist 동기화 필수**

## 8-0. 파일 보호 목록 (읽기 전용 — 별도 지시 없이 수정 절대 금지)

아래 파일들은 실기 테스트 완료 후 **Windows 읽기 전용(attrib +r)** 으로 설정됨.
수정하려면 사용자가 **명시적으로 해당 파일명을 지정해 수정 지시**를 해야 함.
Codex가 자체 판단으로 건드리거나, DAQ-6510 작업 중 side-effect로 수정하면 안 됨.

| 파일 | 상태 |
|---|---|
| `instruments/hioki_3540.js` | 🔒 읽기 전용 |
| `instruments/keithley_2700.js` | 🔒 읽기 전용 |
| `instruments/mitutoyo_vl50.js` | 🔒 읽기 전용 |
| `instruments/sp2100_logger.js` | 🔒 읽기 전용 |
| `instruments/agilent_4339b.js` | 🔒 읽기 전용 |
| `instruments/pt2000_probe_tack.js` | 🔒 읽기 전용 |
| `instruments/lt1000_loop_tack.js` | 🔒 읽기 전용 |
| `instruments/photo_editor.js` | 🔒 읽기 전용 |
| `instruments/_utils.js` | 🔒 읽기 전용 |

**잠금 해제 방법** (사용자 직접 실행):
```powershell
attrib -r "instruments\파일명.js"
```

## 8. 작업 규칙 (반드시 지킬 것)

- **SP-2100/TL-2200**: `docs/SP2100_PROTOCOL_REFERENCE.md`의 §3 파싱 규칙을
  벗어나는 단순화(예: "숫자 N개 이상이면 측정값") 절대 금지.
- **계측기 통신 설정 변경 시**: `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md`의
  "고정 규칙 (변경 금지)" 섹션을 우선 확인하고, 변경했다면 문서도 같이 갱신.
- **테스트**: UI/통신 관련 변경은 가능하면 `python -m http.server`로 띄운 뒤
  실제 브라우저(Web Serial)에서 연결 테스트. 사용자는 한국어로 소통하며,
  화면 캡처로 문제를 보여주는 경우가 많음 — 스크린샷의 표시값과 코드의
  포맷팅 함수(`fmt`, `fmt1`, `fmt2`)를 대조해 확인할 것.
- **코어 클래스 및 객체 관리 주의**: `core.js` 파일 수정 시 `BoxPlot` 등 핵심 클래스 정의가 삭제 또는 손상되는 일이 없도록 코드를 주의 깊게 검토해야 함.
- **답변 언어**: 사용자에게는 항상 한국어로 답변.

## 9. 자주 발생하는 오류 및 방지 대책 (Gotchas & Troubleshooting)

### 9-1. 메인 화면 빈 페이지(블랭크) 및 카드 미표시 현상 방지

#### A. 브라우저(개발 서버)에서 카드 미표시
* **현상**: `http://localhost:8000/index.html`에서 런처 카드가 표시되지 않음.
* **원인**: JavaScript 코드 로딩 시 구문 오류(Syntax Error) 또는 정의되지 않은 클래스 참조(`ReferenceError: BoxPlot is not defined` 등) 예외 발생.
* **예방 대책**:
  1. **코드 병합 검증**: `core.js` 수정 시 `BoxPlot`, `EditableGrid`, `StateMachine` 등 핵심 클래스가 훼손되지 않았는지 Diff 교차 확인.
  2. **오버라이트 주의**: 대량 자동 교체 시 타깃 범위를 좁게 잡아 필요한 부분만 수정.
  3. **콘솔 모니터링**: `F12` → Console 탭에서 `SyntaxError`, `ReferenceError` 확인.
  4. **빌드 전 검증**: EXE 패키징 전 반드시 브라우저에서 카드 로드 확인.

#### B. EXE에서만 카드 미표시 (⚠ 2026-06-23 실제 발생 — 절대 잊지 말 것)

> **핵심 함정**: 내비게이션 바(테마/언어)와 "계측기를 선택하세요"는 **정적 HTML**이므로
> JavaScript가 전혀 실행되지 않아도 표시됨. 이것이 보인다고 JS가 실행된 것이 아님.
> ES 모듈 import 오류는 **try-catch로도 잡히지 않고 조용히 실패**함.

**원인 1 — dist 파일이 소스와 다름 (가장 흔한 원인):**
- `dist/3M_Instrument_Logger/` 안의 JS/CSS 파일이 소스(`instruments/*.js`, `core.js`, `index.css`)보다
  오래된 버전인 경우, 소스에서 수정된 버그가 EXE에는 반영되지 않음
- 특히 `const`/`let` 중복 선언이 dist 파일에만 있으면 ES 모듈 strict mode에서 `SyntaxError` 발생
  → import 체인 전체 실패 → 카드 전혀 미표시
- **예방**: EXE 빌드 전 반드시 소스 → dist 동기화:
  ```powershell
  # 읽기 전용 해제 후
  python build/build_standalone.py Hioki3540 Keithley2700 MitutoyoVL50 Agilent4339B DAQ6510 SP2100 PT2000 LT1000 AIPhotoEditor ClubExpense
  # 위 명령이 실패(읽기 전용)하면 변경된 파일만 수동 복사:
  Copy-Item core.js dist\3M_Instrument_Logger\core.js
  Copy-Item index.css dist\3M_Instrument_Logger\index.css
  ```

**원인 2 — PyInstaller 환경 MIME 타입 누락:**
- 번들된 Python은 레지스트리 접근 불가 → `.js` 파일이 `application/octet-stream`으로 서빙됨
- Chromium은 잘못된 MIME 타입의 ES 모듈을 **조용히 거부** → 카드 미표시
- **현재 상태**: `build/package_exe.py`의 `Handler.guess_type()` 오버라이드로 해결됨.
  이 메서드를 삭제하거나 변경하지 말 것.

**원인 3 — localStorage 인라인 주입 크기:**
- 사진 데이터 등으로 `app_storage.json`이 수십 KB가 되면 HTML `<head>` 인라인 스크립트가 거대해져
  Qt WebEngine 파싱 실패 가능
- **현재 상태**: 동기 XHR 방식(`/api/storage/data`)으로 해결됨. 되돌리지 말 것.

**EXE 카드 미표시 진단 순서:**
1. `dist/3M_Instrument_Logger/instruments/*.js` 파일을 소스와 md5 비교
2. dist JS 파일에서 `const`/`let` 중복 선언 grep 확인
3. `build/package_exe.py`에 `debug=True`가 없는지 확인 (`webview.start()` 여야 함)
4. `build/package_exe.py`의 `Handler.guess_type()` 메서드가 살아있는지 확인

### 2026-09-09 통합 레이아웃 회귀 방지

- `core.js`가 카드 진입·테마/언어 재구성 때 우측 패널의 실제 내용과 숨김 상태를 확인해
  `data-layout-mode="one|two|three"`를 자동 적용한다. 새 커스텀 카드가 우측 패널을 만들지
  않거나 비워 두면 별도 CSS 없이 2열이 되며, 내용이 있으면 3열이 된다.
- 카드 전환 전에 이전 모듈이 남긴 `grid-template-columns`, `display`, `hidden`, 전용 레이아웃
  클래스를 공통 엔진이 초기화한다. 우측 패널 변경은 `MutationObserver`, 레이아웃 크기 변경은
  `ResizeObserver`가 감지해 그래프 재렌더링을 예약한다.
- 공통 CSS는 모든 Grid/Flex 자식에 `min-width:0`을 적용하고 표만 내부 스크롤하도록 해 넓은
  표가 우측 그래프를 화면 밖으로 밀지 못하게 한다.
- `scripts/test_layout_contract.mjs`를 프로젝트 검증에 포함했다. 새 카드·레이아웃 변경 시 반드시
  실행한다. 상세 규칙은 `docs/INTEGRATED_LAYOUT_CONTRACT.md` 참고.
- 통합 EXE 빌드 래퍼는 하드코딩된 모듈 목록 대신 `index.js`의 실제 등록 순서를 사용한다.
  `INSTRUMENT_MAP`과 등록이 불일치하면 빌드를 중단하므로 새 카드가 EXE에서 조용히 빠지지 않는다.

### 2026-09-12 문서 정리 및 Etching Design 통합 릴리즈

- 신규 Etching Design은 비-시리얼 커스텀 도구이며, 공통 1/2/3열 레이아웃 계약 아래 3-panel UI를 사용한다.
- `docs/manuals/Etching_Design.md`에 사용 흐름과 제조용/검토용 DWG/DXF 차이를 기록했다. 실제 화면 툴바에서 확인되는 DWG/DXF 기능만 사용자 매뉴얼에 안내한다.
- 당시(2026-09-12) 릴리즈는 `v1.0.0-rc.2`, 빌드 번호 2, Windows fileVersion `1.0.0.2`였다. 최신 2026-09-14 릴리즈는 `docs/RELEASE_STATUS_20260914.md`를 기준으로 한다.
- `verify_project.py`는 Etching 제조/형상/분할/여백/코너/다국어 회귀 테스트를 빌드 전 실행한다.
- 현재 Etching 툴바에서 사용 가능한 CAD 내보내기는 DWG/DXF다. SVG/PDF 생성 함수가 코드에 있더라도 사용자 버튼으로 연결되기 전에는 지원 UI로 표기하지 않는다.
- 최종 2026-09-12 빌드 결과와 SHA-256은 `docs/RELEASE_STATUS_20260912.md`를 SSOT로 한다.

### 2026-09-14 Etching Design ODA 기반 AutoCAD 2007 DWG 변환

- 사용자 DWG가 DWG TrueView 2024에서 `Drawing file is not valid`로 거부되어 브라우저의 직접 DWG 작성 경로를 폐기했다.
- DWG 내보내기는 `Etching Geometry → 검증된 DXF → ODA File Converter(Audit) → ACAD2007 DWG` 순서만 사용한다.
- EXE/개발 서버의 `/api/cad/convert-dwg`가 설치된 ODA 변환기를 호출하며 결과 헤더가 `AC1021`이 아니면 저장하지 않는다. 변환기가 없으면 DXF 사용 및 ODA 설치 안내를 표시한다.
- ODA 실행 파일은 라이선스 문제로 EXE에 포함하지 않는다. 현 PC에는 아직 ODA가 없어 실제 변환 및 TrueView/Inventor 열기 검증은 남아 있다.
- standalone 출력 폴더는 빌드 시작 시 초기화한다. 따라서 참조가 제거된 구형 `export_dwg.js` 및 `acad-ts`가 새 EXE에 잔류하지 않는다.
- 최신 배포본은 `v1.0.0-rc.6`, Windows 파일 버전 `1.0.0.6`, SHA-256 `F7F7814F0C24939F8BC835F68FC7F56C6EAF00D75FF1300910FEFB29F403DD0F`이며 `dist/3M_Instrument_Logger.exe` 한 개다.
- rc.5의 `failed to create parent directory structure`는 PyInstaller `_MEI` 아래에 모듈 13개 이름을 연결한 긴 데이터 폴더를 풀면서 Windows 경로 한도를 넘은 것이 원인이었다. `package_exe.py`의 번들 내부 루트를 항상 짧은 `app`으로 고정하고 런처도 `BASE/app`을 사용하도록 수정했다. rc.6 EXE 직접 실행에서 압축 해제와 프로세스 유지가 정상임을 확인했다.

### 2026-09-15 Photo Editor 대량 촬영 누락 방지

- USB 촬영은 `Image.onload`로 사진이 `S.files`에 실제 등록되기 전에 `_capturing` 잠금이 풀려, 빠르게 연속 촬영하거나 바로 다음 단계로 이동하면 마지막 사진이 누락될 수 있었다. 이미지 디코딩·목록 등록·원본 백업이 끝날 때까지 촬영 잠금을 유지하고, 등록 중에는 다음 단계 버튼을 비활성화한다.
- 다음 단계는 대량 사진을 한 번에 동기 렌더링하지 않고 2개 그룹마다 브라우저에 제어를 돌려준다. 화면 상단에 `총 N장 / N그룹`을 표시하고 가로 스크롤 영역을 명시해 120장 이상에서도 누락 여부를 바로 확인할 수 있다.
- 휴대폰 동기화는 서버의 `{photos, last}` 응답을 배열처럼 처리하고 마지막 한 장만 읽던 오류를 수정했다. `?since=마지막ID` 이후의 모든 사진을 순서대로 내려받으며, `/api/photo/{id}`의 실제 이미지 Blob을 사용한다.
- USB 촬영 원본은 개발 서버와 EXE 모두 `Photo_Editor_Capture_Backup/YYYYMMDD` 폴더에 자동 저장한다. 화면 처리에 문제가 생겨도 원본을 다시 불러올 수 있다.
- 브라우저 회귀 테스트에서 이미지 120장을 불러온 뒤 목록 120장, 다음 단계 20그룹, 썸네일 120개 생성을 확인했다. EXE는 이 작업에서 빌드하지 않았다.
- 후속 수정: EXE 내장 `Handler.do_POST()`의 `/api/save-file` 분기에 있던 지역 `import base64`가 함수 전체의 `base64`를 지역 변수로 만들어, 앞선 `/api/cad/convert-dwg` 분기에서 `cannot access local variable 'base64'`를 발생시켰다. 지역 import를 제거하고 런처 모듈 범위 import만 사용하도록 통일했으며 `scripts/test_etching_oda_pipeline.py`에 재발 검사를 추가했다.
- ODA File Converter 27.1 공식 서명 MSI는 관리자 권한 부족(Error 1925)으로 시스템 설치가 불가능해 `%LOCALAPPDATA%\\ODA\\ODAFileConverter-27.1-portable\\...\\SourceDir`에 사용자용으로 추출하고 사용자 환경 변수 `ODA_FILE_CONVERTER`를 등록했다.
- ODA 실변환에서 기존 AC1015 DXF가 불완전한 R2000 객체/레이어 테이블 때문에 거부되는 사실을 확인했다. 중간 DXF를 범용 R12 ASCII(`AC1009`) 및 닫힌 `POLYLINE/VERTEX/SEQEND` 구조로 변경했고, ODA Audit를 거쳐 실제 `AC1021` DWG가 생성되는 것을 API 수준에서 검증했다.
