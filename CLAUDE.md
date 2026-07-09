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
| Mitutoyo VL-50 | mitutoyo_vl50.js | ✅ 동작 확인 | `pollCmd: 'GA01\r\n', pollInterval: 300` 필수 (없으면 응답 없음). 표시 소수점 5자리(`toFixed(5)`) |
| SP-2100 / TL-2200 | sp2100_logger.js | ✅ SSOT 기준 | 아래 4번 항목 참고 — 가장 많이 작업됨 |
| Agilent 4339B | agilent_4339b.js | 🔧 실기 테스트 필요 | SCPI 시퀀스 Python 단독 프로그램 기준으로 전면 재작성(-213 수정). 샘플명 인라인 편집, 그룹별 수염차트(Box & Whisker) 구현 완료. 실기 검증 필요. GPIB-USB-HS는 PyVISA IPC 브리지 필요(별도 과제) |
| DAQ-6510 | daq_6510.js | 🔧 실기 테스트 필요 | 수동 릴레이 제어(ROUT:OPEN:ALL→ROUT:CLOS→READ?), Front/Rear 토글, 3-컬럼 디스플레이, 동적 X축 그래프 구현 완료. ROUT:SCAN:CRE 폐기(2859 오류). 실기 테스트 필요 |
| PT-2000 Probe Tack | pt2000_probe_tack.js | 🔧 작업 중 | |
| LT-1000 Loop Tack | lt1000_loop_tack.js | 🔧 작업 중 | |
| Photo Editor | photo_editor.js | ✅ 신규 웹 포팅 | 비-시리얼 Tool. 아래 4-1 항목 참고 |
| PST-3202 | pst3202.js | 🔧 실기 테스트 필요 | GW Instek 3채널 DC 전원공급기. 아래 4-2 항목 참고 |

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
  가 없어서 실제로는 이 기능에 접근할 방법이 전혀 없었음**. CLAUDE.md(2026-07-05 항목)에는 이미
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
- `index.js`, `build/build_standalone.py`, `CLAUDE.md` 참조 모두 업데이트
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

#### ClubExpense 런처 카드 제거 (`index.js`, `build/build_standalone.py`)
- `instruments/club_expense.js` 파일 자체는 유지
- `index.js` import 및 INSTRUMENTS 레지스트리에서 제거
- `build/build_standalone.py` `INSTRUMENT_MAP`에서 항목 제거

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
- **EXE 재패키징**: ✅ 완료 — 2026-06-30 세션 변경사항 반영, `dist/3M_Instrument_Logger.exe` 재빌드 완료
- **PST-3202 실기 테스트**: 🔧 미완료 — 3채널 동기화·입력 검증·auto-clamp 기능 구현 완료, 실기 연결 검증 필요
- **PST-3202 EXE 등록**: ✅ 등록 완료 — `build/build_standalone.py` INSTRUMENT_MAP에 PST3202 항목 존재, dist에도 포함됨. 단 dist 파일이 소스보다 오래됨(2026-07-04 점검 기준 core.js/index.css/standalone.html/pst3202.js/pt2000 5개 DIFF) — **EXE 재패키징 전 dist 동기화 필수**

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
