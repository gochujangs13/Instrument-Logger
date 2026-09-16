# Keithley SourceMeter 2400 통합 개발 계획서

- 작성일: 2026-08-12
- 대상 프로젝트: 3M Instrument Logger
- 문서 상태: RS-232 및 GPIB/VISA 통합 소스 구현, 양쪽 저에너지 실장비 검증 완료, 알려진 저항 더미 부하 비교 대기
- 이번 문서의 범위: 장비 용도, 기존 프로그램 적합성, UI/통신/안전 설계, 구현 결과 및 검증 계획
- 구현 완료: 계측기 모듈 등록, RS-232 및 GPIB/VISA 연결, 2/4-wire, 단일/시간/Sweep, 안전 제한, CSV, 문서
- 이번 문서에서 하지 않은 작업: 알려진 저항 더미 부하·전면 표시 비교, standalone/dist 동기화, EXE 빌드

## 0. 사용자 확정 요구사항

- 장비 연결: **RS-232 또는 GPIB/VISA 사용**
- 기본 측정 방식: **4-wire Remote Sense**
- 선택 가능한 측정 방식: **4-wire / 2-wire 모두 지원**
- 화면 최초 기본값: 4-wire
- 사용자가 화면에서 2-wire로 변경하면 해당 설정으로 평가 가능
- 마지막으로 선택한 2/4-wire 설정은 저장하고 다음 실행 때 복원하되, 처음 사용하는 PC에서는 4-wire를 기본값으로 사용
- GPIB/VISA는 NI-488.2/NI-VISA + PyVISA 브리지로 지원하며, RS-232와 동일한 측정·안전 로직을 사용

## 1. 결론

Keithley 2400은 단순 멀티미터가 아니라, DUT(Device Under Test)에 정밀한 전압 또는 전류를 인가하면서 전압·전류·저항을 동시에 측정하는 단일 채널 SMU(Source Measure Unit)이다.

현재 통합 프로그램에 넣을 때는 Keithley 2700의 단순 저항 그리드 화면을 복사하는 방식보다 다음 세 장비의 검증된 패턴을 조합하는 것이 맞다.

- PST-3202: 출력 ON/OFF, 전압·전류 제한, 시간 평가, 실시간 그래프, 평가 기록
- Agilent 4339B: 출력이 포함된 측정 시퀀스, 샘플 반복 평가, 안전한 출력 종료
- Keithley 2700/DAQ-6510: 2선식·4선식, 저항 측정, 오버플로우와 원시 응답 검증

권장 화면은 `viewType: 'custom'` 전용 모듈이며, 첫 버전은 아래 세 평가를 지원한다.

1. 단일 포인트 평가: 지정 전압/전류를 인가하고 V/I/R/P를 기록
2. 시간 평가: 고정 전압 또는 고정 전류에서 시간에 따른 전류·저항 변화를 기록
3. I-V Sweep: 시작값부터 종료값까지 단계적으로 인가하고 I-V 곡선을 생성

장비 연결은 Web Serial 기반 RS-232 또는 서버의 VISA 브리지를 통한 GPIB를 사용한다. 측정 방식은 4선식을 기본으로 하되, 사이드바의 2-Wire/4-Wire 선택 버튼으로 언제든 바꿀 수 있게 한다.

배터리 충방전, 대용량 커패시터, 외부 전원이 연결된 DUT, 6선식 가드 측정은 초기 버전에서 제외한다. 2400은 전력을 흡수하는 sink 동작도 가능하므로, 해당 기능들은 별도의 배선·에너지·보호 검토 후 추가해야 한다.

## 2. 공식 매뉴얼 기준 장비 분석

### 2-1. 장비의 핵심 역할

Keithley 2400은 아래 기능을 한 장비에서 수행한다.

- 정밀 전압원
- 정밀 전류원
- 전압계
- 전류계
- 저항계
- Source와 Measure가 동기화된 DC 파라미터 분석기

일반 전원공급기는 설정한 전압·전류를 공급하는 데 중심이 있지만, 2400은 DUT에 조건을 인가하면서 매우 작은 전류와 전압 변화를 정밀하게 측정하고, 그 결과로 I-V 특성, 누설 전류, 저항, 임계점 등을 평가하는 데 중심이 있다.

### 2-2. 대표 평가 항목

공식 자료에서 제시하는 대표 용도는 다음과 같다.

- I-V 특성 평가
- 누설 전류 측정
- 저전압·저저항 평가
- 다이오드/LED 순방향 전압과 역방향 누설·항복 특성
- 절연 저항과 패턴/트레이스 저항
- 스위치, 릴레이, 커넥터, 수동소자 및 반도체 특성 평가
- 태양전지처럼 Source와 Sink 동작이 모두 필요한 평가
- 제품 선별을 위한 Pass/Fail 비교

즉, “특정 평가 하나만 하는 장비”가 아니라 설정한 전기 조건에 대한 DUT의 반응을 정밀하게 특성화하는 장비다.

### 2-3. Model 2400에서 프로그램이 지켜야 할 물리 한계

Model 2400의 대표 Source/Sink 한계는 다음과 같다.

- 저전압 영역: 최대 약 ±21 V에서 ±1.05 A
- 고전압 영역: 최대 약 ±210 V에서 ±105 mA
- 장비 최대 출력: 22 W, 단일 채널
- 4사분면 Source/Sink 동작

200 V/1 A는 nominal range이고 Source programming overrange를 포함한 절대 설정 한계는 210 V/1.05 A이지만, 두 최댓값을 동시에 사용할 수는 없다. 따라서 전압·전류·22 W 전력의 실제 동작 영역을 함께 검사하는 소프트웨어 제한이 필요하다.

또한 정격 정확도 검증을 할 때는 공식 사양의 예열 조건을 적용하고, 4선식 Remote Sense는 Sense 리드가 빠지면 장비가 전압을 보상하려고 출력을 올릴 수 있으므로 배선 단선 경고와 전압 보호가 필수다.

### 2-4. 2선식과 4선식

- 2선식 Local Sense: 리드선 전압 강하가 허용되는 일반 평가에 사용
- 4선식 Remote Sense: DUT 양단의 실제 전압을 Sense 리드로 측정해 리드선 전압 강하를 보상
- 공식 매뉴얼 권장: DUT 임피던스가 1 kΩ 미만이거나, 정확한 전압 인가·전압 측정·저항 측정이 필요하면 4선식 사용
- 1 GΩ를 넘는 고저항에서는 가드(Guard) 검토 필요

공식 원격 명령은 다음과 같다.

```text
:SYST:RSEN ON     # 4-wire Remote Sense
:SYST:RSEN OFF    # 2-wire Local Sense
```

### 2-5. Compliance의 의미

- 전압을 Source할 때: Current Compliance가 DUT에 흐르는 전류의 제한값
- 전류를 Source할 때: Voltage Compliance가 DUT에 걸리는 전압의 제한값

대표 명령은 다음과 같다.

```text
:SENS:CURR:PROT <A>
:SENS:VOLT:PROT <V>
```

Compliance는 DUT 보호에 중요하지만 사람을 보호하는 안전 인터락이나 비상정지 장치를 대신하지 않는다.

### 2-6. 통신 사양

장비 후면의 GPIB와 RS-232를 모두 지원한다. RS-232에는 USB-RS232 변환 장치가 필요하고, GPIB에는 NI GPIB-USB-HS와 NI-488.2/NI-VISA가 필요하다.

RS-232 공식 조건:

- 공장 기본 속도: 9600 baud
- 8 data bits, 1 stop bit, no parity 사용 가능
- 장비 송신 종단문자: CR, CR+LF, LF, LF+CR 중 전면 메뉴에서 선택 가능
- 장비는 수신 명령을 CR에서 처리
- 하드웨어 Flow Control 미지원
- XON/XOFF 또는 NONE 선택
- DB-9 Straight-through 케이블 사용
- Null-modem 케이블 사용 금지

USB 변환 케이블은 FTDI라는 이름 자체가 필수인 것은 아니다. 다만 TTL UART 케이블이 아니라 실제 RS-232 전압 레벨을 지원하는 USB-RS232 어댑터여야 하며, 장비까지 Straight-through DB-9 배선이 유지되어야 한다.

이번 프로젝트의 고정 연결 설정:

- Transport: Web Serial
- 초기 baud rate: 9600
- Data bits: 8
- Parity: None
- Stop bits: 1
- 프로그램 송신 종단: CR 고정. VISA ASRL 연결에서는 장비 응답 종단만 LF→CR 순서로 안전 자동 탐지하며, 각 후보는 `:OUTP OFF` 후 OFF 상태가 확인되어야 채택
- 장비 전면 RS-232 Flow Control: NONE 권장
- GPIB/VISA 리소스는 자동 검색해 RS-232 포트와 같은 목록에 표시

## 3. 사용자가 지금까지 통합 프로그램에서 해 온 평가

현재 저장소와 인수인계 문서를 기준으로 사용자의 작업은 단순 계측값 표시보다 “제품별 반복 평가와 결과 비교”에 초점이 있다.

| 평가 성격 | 기존 장비 | 현재 프로그램 패턴 |
|---|---|---|
| 저항 반복 평가 | Hioki 3540, Keithley 2700 | 2/4선식, 측정 속도, 제품 그룹, 표, 수염차트 |
| 다채널 저항/환경 기록 | DAQ-6510 | 채널명, 주기 측정, 시간 그래프, CSV |
| 고저항·고유저항 | Agilent 4339B | 시험 전압, I-Limit, 충전/방전 시간, 샘플 반복, 분포 차트 |
| 박리·점착력 | SP-2100, PT-2000, LT-1000 | 제품별 반복, 파형/Peak/AVG, 이름 편집, 비교 그래프 |
| 전압·전류 인가 평가 | PST-3202 | 고정/사이클 출력, V/I 실시간 그래프, 소요 시간, 평가 기록, Excel |

특히 PST-3202 기록에는 전기박리형 테이프를 특정 전압·시간 조건으로 평가한 작업이 있다. 이 흐름을 기준으로 보면 2400은 다음 영역에 가장 유용하다.

- 전기박리형 또는 전도성 소재의 전압별 전류 응답
- 전도 시작 임계 전압 탐색
- 고정 전압에서 시간에 따른 전류·저항 변화
- 낮은 전류 영역의 누설 전류 비교
- 제품 그룹별 I-V 곡선 또는 지정 전압에서의 대표값 비교

다만 2400이 PST-3202나 4339B를 완전히 대체하지는 않는다.

| 장비 | 더 적합한 영역 |
|---|---|
| PST-3202 | 3개 샘플 동시 인가, 32 V/2 A급 시간·사이클 강압 평가 |
| Keithley 2400 | 단일 샘플 정밀 V/I/R 측정, I-V, 누설, 임계점, Source overrange 포함 최대 210 V 영역 |
| Agilent 4339B | 최대 1000 V급 초고저항·고유저항 및 규격화된 충전 시간 평가 |

## 4. 기존 UI와 장비 연결 방식 분석

### 4-1. 기존 UI 공통 구조

통합 프로그램은 대체로 다음 구조를 사용한다.

- 왼쪽 사이드바: 장비 연결, 시험 조건, 시작/정지, 도움말
- 중앙 상단: 큰 실시간 측정값과 상태
- 중앙: 측정 데이터 표
- 오른쪽: 실시간 그래프 또는 그룹별 분포 그래프
- 하단/사이드바 하단: 시스템 로그
- 공통 기능: 한국어/영어, 다크/라이트, 샘플명 수정, 선택 삭제, 전체 삭제, CSV/Excel

단순 값 수집 장비는 `grid` 뷰를 사용하고, 출력·타이머·전용 그래프가 필요한 장비는 `custom` 뷰를 사용한다.

### 4-2. 연결 구조

- Web Serial: Chrome/Edge에서 사용자가 COM 포트를 선택
- VISA/GPIB: `server.py` 또는 EXE 내장 서버의 `/api/visa/list|connect|write|query|read|disconnect`
- WebHID: 일부 인장/점착 장비
- 공통 연결 객체: `core.js`의 `SerialController`

Keithley 2400에는 Web Serial과 VISA/GPIB를 모두 적용한다. 연결 화면은 COM 포트와 VISA 리소스를 한 목록에 표시하고, 선택한 연결 방식만 연다.
- 연결 종료 전 계측기 모듈의 `onDisconnect()`를 먼저 실행하므로 출력 OFF 같은 안전 종료가 가능

### 4-3. 2400에 재사용할 부분

- 현재 `portSelect`에서 Web Serial과 VISA 리소스를 함께 표시하는 연결 UI
- `app.serial.sendCmd()`를 통한 Web Serial/VISA 공통 송신
- 언어·테마·시스템 로그
- PST-3202의 출력 상태 표시, 실시간 그래프, 시험 기록 패턴
- Agilent 4339B의 시작/정지 시퀀스와 종료 시 안전 출력 OFF 패턴
- 2700의 2/4선식, 오버플로우(`9.9E+37`) 처리
- `/api/export` 저장 경로와 타임스탬프 파일명

### 4-4. 재사용하면 안 되는 부분

- 장비별 SCPI 명령을 다른 장비에서 그대로 복사
- PST-3202의 채널·트래킹 명령
- 4339B의 충전 후 BUS Trigger/FETCH 시퀀스
- 2700의 단순 `:READ?` 폴링 구조를 출력 중인 2400에 그대로 적용
- `python -m http.server`에서만 확인하고 EXE 서버 API를 검증하지 않는 방식

## 5. 별도 Keithley 2400 시제품 코드 검토

별도 폴더 `C:\Users\0op64\.gemini\antigravity\scratch\Sourcemeter 2400`에는 Python/HTML 시제품과 Mock 드라이버가 있다.

### 5-1. 활용할 수 있는 부분

- 정전압/정전류 모드 UI 구상
- Compliance 입력 UI
- 2선/4선 선택 UI
- V/I/R 실시간 카드
- I-V Sweep 입력과 그래프 구상
- Mock 부하를 이용한 무장비 테스트 아이디어
- CSV 컬럼의 기본 형태

### 5-2. 통합 전 반드시 고쳐야 하는 부분

1. 4선식 명령 오류

```text
현재 시제품: :SYST:FRES ON/OFF
공식 명령:   :SYST:RSEN ON/OFF
```

2. 공식 명령표에서 확인되지 않은 `:SYST:REM` 사용

2400은 GPIB/RS-232 원격 통신 시 인터페이스 동작으로 Remote 상태가 관리된다. 시제품의 `:SYST:REM`은 제거하고 실제 장비의 오류 큐로 검증해야 한다.

3. 연결 즉시 `*RST` 실행

연결만 했는데 사용자가 전면 패널에서 설정해 둔 상태가 초기화된다. 통합 버전은 연결 직후 안전을 위해 `:OUTP OFF`를 우선 전송하되, `*RST`는 자동 실행하지 않는 방향을 권장한다.

4. Web Serial Query가 수신 청크 하나만 읽음

RS-232 응답은 여러 USB 패킷으로 나뉠 수 있다. 현재 시제품 방식은 첫 청크만 읽고 종료하므로 긴 Trace/Sweep 데이터가 잘릴 수 있다. 통합 프로그램의 지속 Read Loop와 라인 종단 파싱을 사용해야 한다.

5. 명령과 쿼리 중첩 가능성

일반 폴링과 Sweep 스레드가 동시에 장비를 접근할 수 있다. 2400은 이전 쿼리 응답을 모두 읽기 전에 다음 명령을 보내면 응답 순서가 어긋날 수 있으므로 모든 명령을 단일 큐로 직렬화해야 한다.

6. 실제 출력 한계 검증 부족(통합 버전에서 보완 완료)

입력값이 개별 최대값 이내인지만 보면 `210 V + 1.05 A` 같은 불가능한 조합을 허용한다. 통합 버전은 ±210 V/±1.05 A 절대 한계, 21 V/1.05 A 및 210 V/0.105 A 영역, 22 W 전력 한계를 함께 검사하고 입력 단계와 실행 직전에 재검증한다.

7. 출력 ON 안전 절차 부족

현재는 설정 적용 후 OUTPUT ON을 바로 누를 수 있다. 통합 버전은 평가 시작과 출력 ON을 하나의 제어된 시퀀스로 묶고, 시작 전 조건 확인 팝업과 상시 비상 OFF 버튼을 둔다.

결론적으로 시제품은 화면과 Mock 아이디어의 참고 자료이며, 드라이버를 그대로 이식하는 기준 코드는 아니다.

## 6. 권장 평가 모드

### 모드 A. 단일 포인트 평가

용도:

- 지정 전압에서 누설 전류 확인
- 지정 전류에서 전압 강하 확인
- 지정 조건에서 저항 확인
- 제품별 한 개 대표값 반복 기록

설정:

- Source V / Source I
- Source 값
- Compliance
- 2-wire / 4-wire
- 측정 속도(NPLC)
- 안정화 시간
- 반복 횟수 또는 그룹당 개수

기록:

- 제품명, V, I, R, P, Compliance 상태, 시간, 원시 응답

### 모드 B. 시간 평가

용도:

- 전기박리형 테이프의 고정 전압 인가 중 전류 변화
- 소재의 저항 안정화 또는 드리프트
- 누설 전류의 시간 변화

설정:

- Source 값과 Compliance
- 안정화 시간
- 측정 간격
- 총 측정 시간
- 종료 후 0 V 복귀 또는 즉시 OFF 정책

표시:

- 실시간 V/I/R/P
- 경과 시간 타이머 한 곳
- 시간-V, 시간-I, 시간-R 그래프 선택

### 모드 C. I-V Sweep

용도:

- 전압별 전류 응답
- 전도 시작 임계점
- 비선형 저항 특성
- 제품 간 곡선 비교

설정:

- Source V 또는 Source I
- 시작값, 종료값
- 포인트 수 또는 Step
- 포인트별 지연 시간
- 방향: Up / Down / 왕복
- Compliance 발생 시: 즉시 중단 / 해당 포인트 기록 후 중단
- 반복 Sweep 횟수

초기 구현은 Linear Staircase를 우선한다. Log/Custom/Source Memory Sweep은 기본 기능과 실기 검증 후 확장한다.

## 7. 권장 UI 배치

### 7-1. 왼쪽 사이드바

#### 장비 연결

- 연결 방식 표시: RS-232 (Web Serial) / GPIB (VISA)
- COM 포트 또는 GPIB VISA 주소 선택
- 새로고침
- 연결/연결 해제
- 연결 후 `*IDN?` 결과와 모델 일치 여부 표시
- 장비 RS-232 설정 및 GPIB/NI-VISA 안내

#### 평가 방식

- 단일 포인트
- 시간 평가
- I-V Sweep

선택한 방식에 필요한 입력만 보이고, 나머지는 숨긴다.

#### Source/Measure 설정

- Source V / Source I
- 2-Wire / 4-Wire 토글(기본 4-Wire)
- 4-Wire 선택 시 `:SYST:RSEN ON`, 2-Wire 선택 시 `:SYST:RSEN OFF`
- 설정 적용 후 `:SYST:RSEN?` 응답을 확인해 화면 선택과 장비 상태가 일치할 때만 평가 허용
- Source 값
- Compliance
- NPLC: FAST / MED / SLOW 및 고급 직접값
- Auto Range / Manual Range(고급)
- 안정화 시간

#### 샘플·반복 설정

- 제품명
- 그룹당 개수
- 메모/시험 조건

#### 실행 제어

- 설정 검증
- 테스트 시작
- 테스트 정지
- `긴급 출력 OFF` 상시 활성 버튼

일반 사용자 화면에는 독립적인 단순 OUTPUT ON 버튼을 두지 않는다. 필요하면 고급 수동 제어 모드 안에만 배치하고 이중 확인을 받는다.

### 7-2. 중앙 상단 표시 바

- OUTPUT OFF / ARMED / RUNNING / COMPLIANCE / FAULT 상태
- Voltage
- Current
- Resistance
- Power
- 경과 시간 또는 Sweep 진행률

타이머는 이 위치 한 곳에만 표시한다.

### 7-3. 중앙 데이터 테이블

공통 컬럼:

```text
선택 | No. | 제품명 | 평가모드 | Point/Time | Voltage | Current | Resistance | Power | Status
```

기능:

- 샘플명 인라인 편집
- 선택 기록 비교
- 체크된 기록 재측정 시 덮어쓰기 확인
- 선택 삭제/전체 삭제
- CSV/Excel 내보내기
- 원시 응답과 시험 설정 Metadata 포함

### 7-4. 오른쪽 그래프

- 단일 포인트: 그룹별 대표값/분포 수염차트
- 시간 평가: 시간-I, 시간-R, 시간-V 선택
- Sweep: I-V 곡선, 필요 시 R-V 또는 P-V
- 여러 제품 체크 시 곡선 중첩 비교
- Compliance 포인트는 다른 색/마커로 표시
- Y축 자동/수동 범위 조정

## 8. 통신 및 상태 제어 설계

### 8-1. 모듈 구조

신규 파일:

```text
instruments/keithley_2400.js
```

권장 모듈 설정:

```js
export default {
  name: 'Keithley 2400',
  category: 'Instrument',
  viewType: 'custom',
  serial: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  buildSidebar,
  buildCenter,
  buildRightPanel,
  onConnect,
  onLine,
  onDisconnect,
}
```

초기 버전은 공통 `pollCmd`를 사용하지 않고 모듈 내부에서 단일 비동기 상태 머신으로 측정을 진행한다. 그래야 출력 설정·응답·기록의 순서를 보장할 수 있다.

연결 포트는 공통 포트 목록을 사용할 수 있지만, Keithley 2400 모듈에서는 VISA 형식 리소스를 선택 대상으로 사용하지 않는다. 저장된 Sense 설정이 없으면 `4-wire`, 있으면 마지막 선택값을 복원한다.

### 8-2. 상태 머신

```text
DISCONNECTED
  -> CONNECTED_SAFE
  -> CONFIGURED
  -> ARMED
  -> RUNNING
  -> STOPPING
  -> COMPLETE

어느 상태에서든 통신 오류/사용자 중단/Compliance 정책 위반
  -> SAFE_OFF 시도
  -> FAULT 또는 CONNECTED_SAFE
```

### 8-3. 구현된 연결 시퀀스

1. 통신 연결
2. `:OUTP OFF` 전송
3. `:OUTP?`로 실제 OFF 상태 확인
4. `*IDN?`로 Keithley 2400 계열 확인
5. `*CLS`
6. 프로그램에서 선택된 4-wire 기본값 또는 저장된 2/4-wire 설정 적용
7. `:SYST:RSEN?`을 조회해 실제 적용 여부 확인
8. `:FORM:ELEM VOLT,CURR,TIME,STAT` 적용
9. `:SYST:ERR?`로 오류 큐 확인
10. `CONNECTED_SAFE` 상태 표시

연결만으로 Source 값·Range·NPLC를 덮어쓰지 않는다. 사용자가 `설정 적용` 또는 `테스트 시작`을 눌렀을 때 현재 화면 설정을 장비에 적용한다.

### 8-4. 설정 시퀀스의 기본 원칙

- Source 모드, Source 값, Compliance, Sense, Measure 기능, NPLC, Range 순서를 고정
- 설정 후 `:SYST:ERR?`를 확인하고, 출력 ON/OFF 뒤에는 `:OUTP?`로 실제 상태를 확인
- `:FORM:ELEM VOLT,CURR,TIME,STAT` 형식을 사용하고 저항은 V/I로 계산
- 응답의 `9.9E+37`은 Over Flow로 처리
- Status word의 Compliance/Remote Sense/Limit 비트는 공식 비트 정의에 따라 해석
- `:SYST:ERR?`가 0이 아니면 출력 시작 금지
- 화면의 2/4-wire 선택과 `:SYST:RSEN?` 응답이 다르면 출력 시작 금지

### 8-5. Query 단일 실행 보장

- 동시에 하나의 Query만 Pending 상태로 둔다.
- Query 응답을 다 받기 전 다음 명령을 보내지 않는다.
- 응답 타임아웃, 예상 필드 수, 명령 종류를 Pending 객체로 관리한다.
- Sweep Trace의 긴 응답은 CR/LF까지 누적한 뒤 한 번에 파싱한다.
- 중지·연결 해제 시 Pending Query와 타이머를 모두 취소한다.

### 8-6. Sweep 구현 순서

1차 실기 검증에서는 프로그램이 Source 값을 한 단계씩 설정하는 Software Sweep으로 명령·응답을 확인한다.

2차에서는 장비 내장 Linear Sweep과 Trace Buffer를 사용해 타이밍 안정성과 속도를 높인다. 공식 명령군은 아래와 같지만, 최종 Trigger/Trace 시퀀스는 실기 응답을 캡처한 뒤 SSOT 문서에 확정한다.

```text
:SOUR:VOLT:MODE SWE
:SOUR:VOLT:STAR <value>
:SOUR:VOLT:STOP <value>
:SOUR:VOLT:STEP <value>
:SOUR:SWE:POIN <count>
:SOUR:SWE:DIR UP|DOWN
:SOUR:SWE:CAB NEV|EAR|LAT
```

## 9. 안전 설계

### 9-1. 소프트웨어 필수 안전장치

- 연결 즉시 출력 OFF 시도
- 시작 전 최종 조건 요약 팝업
- 전압·전류·전력 동작 영역 검증
- Source V일 때 Current Compliance 필수
- Source I일 때 Voltage Compliance 필수
- 4선식 선택 시 Sense 리드 연결 경고
- 고전압 설정 시 두 단계 확인
- Compliance 발생을 큰 경고로 표시하고 정책에 따라 중단
- 정지·오류·화면 이탈·연결 해제 시 `:OUTP OFF`
- 출력 중 설정값 편집 잠금
- Start 중복 클릭, Query 중복, 이중 타이머 방지
- 출력이 OFF가 되었는지 `:OUTP?`로 재확인

### 9-2. 하드웨어 안전 요구

- 정격에 맞는 테스트 리드와 지그
- 4선식 사용 시 Source와 Sense 배선 구분
- 고전압 노출을 막는 커버/인터락 지그
- 긴급 차단 방법
- 외부 전원이 있는 DUT의 역전압·역전류 검토
- 커패시터/배터리 DUT의 잔류 에너지 방전 경로
- 장비 LO와 섀시 접지 관계 검토

## 10. 데이터 저장 설계

### 10-1. 한 측정 레코드에 저장할 값

- 앱 버전
- 장비 모델, 시리얼 번호, 펌웨어(`*IDN?`)
- 연결 방식과 리소스 주소
- 평가 모드
- 제품명/그룹/메모
- Source 모드와 설정값
- Compliance
- 2/4-wire
- NPLC, Range, 안정화/지연 시간
- 각 포인트의 V/I/R/P/TIME/STAT
- 원시 응답
- 시작·종료 시각과 소요 시간
- 정상 종료/사용자 중지/Compliance/통신 오류 상태

### 10-2. 내보내기

- XLSX: Excel 기본 결합 산점도 차트가 있는 대시보드 + 평가별 4열 블록의 `Raw Data` + 숨김 `_ChartData`
- 프로그램 언어가 한국어면 `대시보드`와 한국어 표·헤더, 영문이면 `Dashboard`와 영문 표·헤더를 생성
- 선택한 평가만 내보내며 선택이 없으면 전체 평가를 내보냄
- 파일명 예: `Keithley2400_template_export_selected_2_YYYYMMDD_HHMMSS.xlsx`
- EXE에서는 `/api/export`를 우선 사용하고 지원되지 않는 서버에서는 브라우저 다운로드로 전환

설정은 `localStorage`에 저장할 수 있지만 긴 시계열 Raw Data는 `app_storage.json`에 계속 누적하지 않는다. 영구 평가 목록이 필요하면 `K2400_eval_data.json` 전용 API를 만들고 `server.py`와 `build/package_exe.py` 양쪽에 동일하게 구현한다.

## 11. 실제 구현 시 변경할 파일

필수:

- `instruments/keithley_2400.js` 신규
- `assets/keithley_2400.png` 신규 또는 공식 사용 허용 이미지 준비
- `index.js` import/registry 등록
- `core.js` 한국어/영어 번역 키
- `index.css`의 `k2400-` 접두사 전용 스타일
- `build/build_standalone.py`의 `INSTRUMENT_MAP` 등록
- `docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md`에 검증된 프로토콜 추가
- `docs/manuals/Keithley_2400.md` 사용자 매뉴얼 신규
- `docs/manuals/README.md` 연결

조건부:

- 영구 평가 기록이 필요하면 `server.py`와 `build/package_exe.py`에 동일 API 추가
- 공통 통신부 수정이 꼭 필요할 때만 `core.js`의 Query Queue 확장
- 릴리즈 시 `version.json/version.js` 갱신과 dist/EXE 재생성

기존 실기 완료 계측기 모듈은 수정하지 않는다.

## 12. 검증 계획

### 12-1. 하드웨어 없이

- Mock에서 Source V/Source I 동작
- 2선/4선 상태
- 정상/Over Flow/Compliance/잘못된 응답 파싱
- 긴 Sweep 응답 분할 수신
- Query 중복 방지
- Stop/Disconnect 시 모든 타이머와 Pending 응답 취소
- 어떤 오류 경로에서도 SAFE_OFF가 실행되는지 확인
- 한국어/영어, 다크/라이트, 1600px 기준 확대/축소 UI 확인
- 기존 계측기 런처와 모듈 import 회귀 검사
- 최초 실행에서 4-wire가 기본 선택되는지 확인
- 2-wire 선택 저장 후 화면 재진입 시 2-wire가 복원되는지 확인
- 4-wire/2-wire 선택마다 각각 `:SYST:RSEN ON/OFF`가 한 번만 전송되는지 확인

2026-08-12 검증 결과:

- `scripts/test_keithley_2400.mjs`: Model 2400 안전 영역, 정상/Compliance/Over Flow/잘못된 응답 파싱 통과
- `scripts/test_keithley_2400_lifecycle.mjs`: 가상 RS-232로 연결 초기화, 정상 4-wire 측정, 저장된 2-wire 복원, Compliance 자동 OFF, 다른 장비 오연결 거부, `:READ?` 대기 중 연결 해제 및 Pending 취소 통과
- 연결 해제와 측정 종료가 겹칠 때 OFF 종료 시퀀스가 중복되는 경쟁 조건을 수정함
- 실제 RS-232 및 GPIB 전기적 통신과 저에너지 출력은 2026-08-26 검증 완료. 2026-08-28에는 COM4의 LF 응답 종단 자동 검출, OUTPUT OFF/IDN/Sense/오류 큐 전체 초기화와 UI 준비 상태를 재검증했다. 알려진 저항 더미 부하와 장비 전면 표시 일치 비교는 아직 필요

2026-08-26 실장비 검증 결과:

- COM4/FTDI RS-232에서 Model 2400(S/N 1162685) 식별, `:OUTP? = 0`, `:SYST:RSEN? = 1`, `:SYST:ERR? = 0,"No error"` 확인
- 2-Wire/4-Wire, Source V/I, 단일/시간/Software Sweep, 실제 Compliance 자동 OFF, 비상 OFF, CSV, 연결 해제 후 COM 반환 확인
- 추가 직접 측정: Source V 0.1 V, Current Compliance 1 mA, 4-Wire, 1 NPLC에서 `+1.000202E-01,+1.642276E-10,+4.799660E+03,+4.217860E+06` 수신. 프로그램 계산값 약 609 MΩ, Compliance 없음
- GPIB0::2::INSTR에서 서버 선행 IDN 없이 `:OUTP OFF`를 첫 명령으로 보낸 뒤 Model 2400 식별. 같은 0.1 V/1 mA·4-Wire·1 NPLC 단일 측정에서 `+1.000000E-01,+1.384179E-10,+7.798027E+02,+4.215812E+06` 수신, 약 722 MΩ·Compliance 없음으로 표시·기록 및 그래프 렌더링 확인
- GPIB에서 같은 조건의 0.2초 간격/0.6초 시간 평가 3건과 0→0.05→0.1 V 3-point Software Sweep 모두 OK 기록
- GPIB 측정 종료 후 `:OUTP? = 0`, `:SYST:RSEN? = 1`, `:SYST:ERR? = 0,"No error"`, UI 연결 해제 후 리소스 재검색 확인
- 추가 측정 종료 후 `:OUTP? = 0`, `:SYST:ERR? = 0,"No error"` 재확인
- 현재 연결 대상은 개방에 가까운 고저항 상태이므로 알려진 1 kΩ 등 비유도성 더미 저항을 연결한 전면 표시 비교만 별도 수행 필요

### 12-2. 실장비 1차 안전 검증

1. DUT 없이 연결하고 `*IDN?`, 오류 큐, 출력 OFF 확인
2. 전면 패널과 프로그램의 2/4-wire 상태 비교
3. 4-wire 선택 → `:SYST:RSEN? = 1` 확인
4. 2-wire 선택 → `:SYST:RSEN? = 0` 확인
5. 다시 4-wire로 복귀해 기본 평가 상태 확인
6. 알려진 1 kΩ 저항을 연결
7. 0.1 V Source, 1 mA Current Compliance로 단일 측정
8. 예상값 약 0.1 mA, 1 kΩ과 장비 전면 표시를 비교
9. 0~1 V 저전압 Sweep으로 `I ≈ V/1 kΩ` 확인
10. 낮은 Compliance를 의도적으로 설정해 경고·중단 확인
11. 측정 중 Stop, 연결 해제, 브라우저 화면 이탈 시 출력 OFF 확인

### 12-3. 사용자 DUT 검증

- 실제 평가 전압·전류 범위를 낮은 값부터 단계적으로 확대
- 전면 패널 값, 프로그램 Raw 응답, 파싱값, CSV/Excel 값을 한 번에 비교
- 2선/4선 차이 확인
- 반복 측정 분포와 재현성 확인
- Compliance 발생 조건과 제품 손상 여부 확인

## 13. 개발 단계와 예상 기간

장비와 케이블이 준비되어 있고 실제 DUT 조건이 확정된 기준이다.

| 단계 | 내용 | 예상 |
|---|---|---:|
| 0 | 평가 목적·최대 조건·RS-232 배선 확인 | 0.5일 |
| 1 | 신규 모듈 골격, Mock, 연결, 안전 상태 머신 | 1~1.5일 |
| 2 | 단일 포인트 + 시간 평가 UI/통신/그래프 | 1.5~2일 |
| 3 | Software Sweep + 내장 Sweep/Trace 검증 | 1.5~2일 |
| 4 | 표, CSV/Excel, 설정 저장, 한/영·테마 | 1일 |
| 5 | 실장비 저전압 검증, 오류 보완, 매뉴얼 | 1~2일 |

- RS-232 통합과 실장비 검증: 약 5~7 작업일, GPIB/VISA 연결 계층 추가 검증 별도
- 최종 확인 후 통합 EXE 동기화·빌드·검증: 추가 약 0.5일
- 고전압 지그, DUT 동작, 드라이버 문제에 따라 실기 검증 기간이 늘어날 수 있음

## 14. 기존 프로그램에 미치는 위험

권장 구조대로 새 모듈과 `k2400-` 전용 CSS를 사용하면 기존 계측기 연동에 대한 위험은 낮다.

| 변경 영역 | 위험도 | 방지책 |
|---|---|---|
| 신규 `keithley_2400.js` | 낮음 | 완전 독립 상태와 함수명 사용 |
| `index.js` 등록 | 낮음 | 모듈 구문 검사와 런처 전체 로드 확인 |
| `index.css` | 낮음 | `k2400-` 네임스페이스 사용 |
| `core.js` 번역키 | 낮음 | 기존 키를 변경하지 않고 추가만 함 |
| 공통 SerialController 수정 | 중간 | 초기에는 수정하지 않고 모듈 큐로 해결 |
| 저장 API 수정 | 중간 | 필요할 때만 개발 서버와 EXE 서버 동시 반영·테스트 |
| dist/EXE | 중간 | 소스→dist 동기화 후 모든 카드 로드 검사 |

가장 큰 위험은 UI가 아니라 출력이 있는 계측기의 비동기 통신 순서다. Query Queue, Stop/Disconnect, Compliance, Output OFF 검증을 통과하기 전에는 고전압 DUT 평가를 시작하면 안 된다.

## 15. 실장비 검증 전에 확인할 항목

아래 항목은 현재 보수적인 Model 2400 기본 제한 안에서 구현되었으며, 실제 DUT용 기본 프리셋을 확정하기 전에 확인한다.

1. 평가할 제품/DUT가 무엇인지
2. 예상 최대 전압, 최대 전류, 시험 시간
3. 주 목적이 단일값, 시간 변화, I-V Sweep 중 무엇인지
4. 4선식 Source/Sense 리드와 2선식 리드가 준비되어 있는지
5. 제품당 반복 개수와 필요한 Excel 결과 형식
6. Compliance 발생 시 즉시 중단할지, 해당 포인트를 기록하고 중단할지

## 16. 공식 자료

- Tektronix, Series 2400 SourceMeter SMU Instruments Datasheet: https://www.tek.com/en/datasheet/series-2400-sourcemeter-instruments
- Tektronix, Keithley 2400 Standard Series SMU: https://www.tek.com/en/products/keithley/source-measure-units/2400-standard-series-sourcemeter
- Tektronix, Models 2400/2401 Specifications: https://www.tek.com/en/documents/specification/models-2400-2401-2400-lv-and-2400-c-sourcemeter-specifications
- Keithley, Series 2400 SourceMeter User's Manual (2400S-900-01): https://download.tek.com/manual/2400S-900-01_K-Sep2011_User.pdf

## 17. 최종 권장안

현재 구현은 RS-232와 GPIB/VISA에서 “단일 포인트 + 시간 평가 + 저전압 Linear I-V Sweep”을 지원한다. 4-wire를 기본값으로 하되 2-wire를 언제든 선택하고 저장할 수 있게 한다. 연결 직후 출력 OFF, 단일 Query Queue, 실제 전력 영역 제한, 화면 선택과 `:SYST:RSEN?`의 일치 확인, 4선식 Sense 단선 경고, 모든 종료 경로의 출력 OFF를 공통 적용한다.

실장비로 1 kΩ 저항 저전압 검증을 통과한 뒤 사용자의 실제 DUT 조건을 적용하고, 그 다음에 장비 내장 Sweep/Trace, 영구 평가 기록, 고급 가드/6선식 기능을 단계적으로 추가하는 것이 가장 안전하고 기존 프로그램의 회귀 위험도 가장 낮다.
