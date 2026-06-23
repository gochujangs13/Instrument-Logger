# 3M Instrument Logger — 인수인계 문서 (CLAUDE.md)

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
| Mitutoyo VL-50 | mitutoyo_vl50.js | ✅ 동작 확인 | `pollCmd: 'GA01\r\n', pollInterval: 300` 필수 (없으면 응답 없음). 표시 소수점 5자리(`toFixed(5)`) |
| SP-2100 / TL-2200 | sp2100_logger.js | ✅ SSOT 기준 | 아래 4번 항목 참고 — 가장 많이 작업됨 |
| Agilent 4339B | agilent_4339b.js | 🔧 실기 테스트 필요 | SCPI 시퀀스 Python 단독 프로그램 기준으로 전면 재작성(-213 수정). 샘플명 인라인 편집, 그룹별 수염차트(Box & Whisker) 구현 완료. 실기 검증 필요. GPIB-USB-HS는 PyVISA IPC 브리지 필요(별도 과제) |
| DAQ-6510 | daq_6510.js | 🔧 실기 테스트 필요 | 수동 릴레이 제어(ROUT:OPEN:ALL→ROUT:CLOS→READ?), Front/Rear 토글, 3-컬럼 디스플레이, 동적 X축 그래프 구현 완료. ROUT:SCAN:CRE 폐기(2859 오류). 실기 테스트 필요 |
| PT-2000 Probe Tack | pt2000_probe_tack.js | 🔧 작업 중 | |
| LT-1000 Loop Tack | lt1000_loop_tack.js | 🔧 작업 중 | |
| AI Photo Editor | ai_photo_editor.js | ✅ 신규 웹 포팅 | 비-시리얼 Tool. 아래 4-1 항목 참고 |

## 4. SP-2100 / TL-2200 — 이번 세션 핵심 작업

### 배경
- 사용자가 **단독(standalone) 원본 HTML**
  (`C:\Users\0op64\Documents\카카오톡 받은 파일\sp-2100\sp2100_logger.html`)을
  제공, "통합 앱의 SP-2100 화면을 이 단독 프로그램과 동일하게 전면 재구성"하기로 결정.
- `instruments/sp2100_logger.js`가 현재 기준(SSOT)이며, 파싱 규칙은
  `docs/SP2100_PROTOCOL_REFERENCE.md`에 문서화됨 — **향후 수정 시 반드시 이 문서의
  규칙을 따를 것** (라벨 기반 파싱, 임의 "숫자 N개=측정값" 같은 단순화 금지).

### 적용된 변경 사항
1. **파싱 (`parseLine`)**: SP-2100은 `"AVG"`/`"PEAK"` 라벨이 있는 라인만 측정으로
   인정, 라벨명 기반 정규식으로 SP/KP/VAL/AVG/RMS/PEAK 추출. TL-2200은
   `TL-22[O0]+` 토큰이 포함된 CSV 포맷만 인정 (위치 기반 5개 캡처그룹).
2. **측정 기록 테이블**: 단독 프로그램과 동일한 컬럼 순서로 재구성
   — `체크 | # | 이름(입력가능) | AVG(강조,소수점2자리) | SP | KP | VAL | RMS`
   - `#`은 `rowLabel(i) = "${groupIdx+1}-${idxInGroup+1}"` 형태로 그룹당 개수 기준 자동 번호
   - 이름(`이름` 칸)은 텍스트 입력, `onchange`로 `rec.name` 갱신 가능 (언제든 재수정 가능)
   - 신규 기록의 기본 이름은 `"제품 N"` (N = 현재 그룹 번호)
3. **테스트 조건 설정 영속화**: `sp_speed`(Test Speed), `sp_delay`(Initial Delay),
   `sp_avg`(Averaging Time), `sp_group`(그룹당 개수), `sp_model`(장비 모델)을
   `localStorage` (`sp2100_settings` 키)에 저장하고, `buildSidebar()`에서
   `loadSettings()`로 복원.
4. **AVG 분포 박스-수염 차트**: `index.css`의 `.graph-area`에 `min-height: 240px`를
   추가해 캔버스가 찌그러져 보이던 문제 해결. 그룹/선택 로직을 단독 프로그램과
   동일하게 정렬(`names.sort(...)`)하도록 수정.
5. **힘-시간 파형 그래프 (신규 구현)**: 단독 프로그램의 `captureByte / processFrame /
   decodeWave / plotWaveform / drawCurve / parseConfig` 로직을 그대로 포팅.
   - `onByte(b)`로 원시 바이트를 모아 400ms 무신호 기준 프레임 단위 처리
   - 8/16비트 후보 디코딩 중 장비 `PEAK` 값과 가장 가까운 해석을 자동 선택
   - `#spWaveChart` 캔버스에 힘-시간 곡선 + Test Speed/Delay/Avg 음영 구간 표시
   - Test Speed/Delay/Avg 값 변경 시 마지막 파형 즉시 재렌더 (`saveSettingsAndReplot`)
   - 측정 시점 파형을 `rec.wave`/`rec.waveCfg`에 저장 (행 클릭 시 다시 보기 기능은
     **아직 미구현** — 단독 프로그램에는 있음, 필요시 추가 작업)
6. **CSV/클립보드 내보내기**: 헤더를 `#,Name,AVG,SP,KP,VAL,RMS`로 변경, AVG는
   소수점 2자리(`fmt2`), 나머지는 1자리(`fmt1`).

### 알려진 차이점 / 후속 작업 후보
- 단독 프로그램은 측정 기록 행 클릭 시 해당 행에 저장된 파형을 다시 그려줌
  (`tr.onclick` → `plotWaveform(rec.wave, rec.waveCfg)`). 통합 버전은 `rec.wave`까지는
  저장하지만 클릭 시 재생 UI는 아직 없음.
- 실제 SP-2100 장비로 파형 디코딩(`decodeWave`)이 올바르게 동작하는지 **실기 테스트
  필요** (자동 후보 선택 로직이 PEAK 값에 의존하므로, PEAK가 없으면 기본값
  `16bit·LE·U·a0`로 디코딩됨).

## 4-1. AI Photo Editor (신규 웹 포팅)

### 배경
- 기존 `instruments/ai_photo_editor/` (CustomTkinter + PyTorch/YOLO 데스크톱 앱)의
  기능을 통합 웹 앱으로 포팅. **YOLO 학습 기능(`ui_train.py`, `ui_yolo_train.py`,
  `yolo_dataset/`, `feature_brain.pkl`)은 사용자 요청에 따라 완전히 제외** —
  테스트가 잘 안 되어 제거 결정.
- `instruments/ai_photo_editor.js` (신규 파일, `viewType: 'custom'`)로 구현,
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

### 개요
특정 계측기만 포함한 단독 실행 파일(EXE)을 만들 수 있는 빌드 파이프라인.

### 파일 구조
```
core.js                     ← 공통 엔진 (export { App, _dateStr })
index.js                    ← 통합 앱 진입점 (11개 계측기 모두 등록)
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

사용 가능한 계측기명: `Hioki3540`, `Keithley2700`, `MitutoyoVL50`, `Agilent4339B`,
`DAQ6510`, `SP2100`, `PT2000`, `LT1000`, `AIPhotoEditor`

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

### 미해결 / 후속 작업
- **체크박스 재측정**: ✅ 전 계측기 완료
  - PT-2000: 기존 구현, LT-1000: `importTest()` 수정 완료, Agilent 4339B: `logResult()` 수정 완료
- **그룹별 그래프 (PT-2000 / LT-1000)**: ✅ 완료 — 그룹 개수 ≥ 2 시 Peak(gf) 수염차트로 전환
- **수염차트 Y축 수동 편집**: ✅ 완료 — 전 계측기(Hioki·Keithley·VL-50·SP-2100·Agilent·PT-2000·LT-1000) 적용
- **LT-1000 팝업 가이드**: ✅ 완료 — 데이터 전송 방법 / 캘리브레이션 방법 / ST FULL 해결 방법 팝업 구현
- **DAQ-6510 실기 테스트**: ✅ 완료 — 10채널 순차 측정 및 딜레이 정밀도 현장 확인 완료
- **Agilent 4339B 실기 테스트**: ✅ 완료 — 재작성 시퀀스로 -213 에러 없이 정상 측정 확인
- **SP-2100 파형 디코딩**: ❌ 종결 — 장비에서 파형 데이터 수집 자체가 불가하여 파형 그래프 구현 불가. `sp2100_logger.js`의 `decodeWave` 관련 코드는 현 상태로 동결.
- **Agilent 4339B GPIB**: 🔧 드라이버 설치만 하면 완료 — NI GPIB-USB-HS 드라이버 설치 후 PyVISA IPC 브리지 연결 예정. 코드 측 준비는 완료된 상태.
- **EXE 재패키징**: ✅ 완료 — 2026-06-23 세션 변경사항 반영, `dist/3M_Instrument_Logger.exe` 재빌드 완료

## 8-0. 파일 보호 목록 (읽기 전용 — 별도 지시 없이 수정 절대 금지)

아래 파일들은 실기 테스트 완료 후 **Windows 읽기 전용(attrib +r)** 으로 설정됨.
수정하려면 사용자가 **명시적으로 해당 파일명을 지정해 수정 지시**를 해야 함.
Claude가 자체 판단으로 건드리거나, DAQ-6510 작업 중 side-effect로 수정하면 안 됨.

| 파일 | 상태 |
|---|---|
| `instruments/hioki_3540.js` | 🔒 읽기 전용 |
| `instruments/keithley_2700.js` | 🔒 읽기 전용 |
| `instruments/mitutoyo_vl50.js` | 🔒 읽기 전용 |
| `instruments/sp2100_logger.js` | 🔒 읽기 전용 |
| `instruments/agilent_4339b.js` | 🔒 읽기 전용 |
| `instruments/pt2000_probe_tack.js` | 🔒 읽기 전용 |
| `instruments/lt1000_loop_tack.js` | 🔒 읽기 전용 |
| `instruments/ai_photo_editor.js` | 🔒 읽기 전용 |
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
