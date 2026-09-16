# 3M Instrument Logger — 통합 프로그램 사용 안내

이 문서는 현재 통합 프로그램의 공통 실행·화면·데이터 사용법을 안내합니다. 장비별 연결 설정, 안전 한도, 측정 절차는 [계측기별 최신 매뉴얼](../docs/manuals/README.md)을 우선 참고하세요.

## 1. 프로그램 실행

1. `시작.bat`을 실행하거나 프로젝트 폴더에서 `python server.py`를 실행합니다.
2. Chrome 또는 Edge에서 `http://localhost:8000/index.html`을 엽니다.
3. EXE 배포판은 `dist/3M_Instrument_Logger.exe`를 실행합니다.

통합 프로그램은 현재 13개 카드/도구를 제공합니다.

| 카드 | 기능 | 안내 |
|---|---|---|
| Hioki 3540 | 저저항 측정 | [매뉴얼](../docs/manuals/Hioki_3540.md) |
| Keithley 2700 | 멀티미터 저항 측정 | [매뉴얼](../docs/manuals/Keithley_2700.md) |
| Keithley 2400 | 전압·전류 인가, V/I/R 평가 | [매뉴얼](../docs/manuals/Keithley_2400.md) |
| Mitutoyo VL-50 | 두께 측정 | [매뉴얼](../docs/manuals/Mitutoyo_VL-50.md) |
| SP-2100 / TL-2200 | 박리·인장 시험 기록과 파형 분석 | [매뉴얼](../docs/manuals/SP-2100_TL-2200.md) |
| Agilent 4339B | 고저항 측정 | [매뉴얼](../docs/manuals/Agilent_4339B.md) |
| DAQ-6510 | 다채널 저항 로깅 | [매뉴얼](../docs/manuals/DAQ-6510.md) |
| PT-2000 | Probe Tack 시험 | [매뉴얼](../docs/manuals/PT-2000.md) |
| LT-1000 | Loop Tack 시험 | [매뉴얼](../docs/manuals/LT-1000.md) |
| PST-3202 | DC 전원공급기 평가 | [매뉴얼](../docs/manuals/PST-3202.md) |
| Photo Editor | 이미지 편집·내보내기 | [매뉴얼](../docs/manuals/Photo_Editor.md) |
| Epson PRIFIA OK900P | 라벨 편집·인쇄 | [매뉴얼](../docs/manuals/Epson_OK900P.md) |
| Etching Design | 에칭 패턴 배치·CAD 도면 | [매뉴얼](../docs/manuals/Etching_Design.md) |

## 2. 장비 카드와 화면 레이아웃

런처에서 사용할 카드를 선택합니다. 장비에 따라 사이드바·중앙 화면·우측 그래프가 표시됩니다. 그래프가 없는 카드나 편집 도구는 필요한 화면만 사용하며, 창 크기를 바꾸거나 다른 카드로 이동해도 공통 엔진이 빈 패널을 접고 그래프 크기를 다시 맞춥니다.

카드별 시작/정지 버튼, 출력 안전 확인, 표의 열과 내보내기 형식은 서로 다릅니다. 화면에 “연결됨”이 보인다는 사실만으로 출력 상태나 시험 준비까지 확인된 것은 아니므로 장비별 안내의 시작 전 점검을 따르세요.

## 3. 기록과 내보내기

- 데이터 표는 계측기 화면에서 제공하는 복사, 선택 삭제, 전체 삭제, 내보내기 컨트롤을 사용합니다.
- 저장 형식은 카드별로 다릅니다. Keithley 2400과 SP-2100은 대시보드/Raw Data XLSX, PST-3202와 Photo Editor는 각자의 XLSX/내보내기 경로, Epson OK900P는 라벨 인쇄를 사용합니다.
- SP-2100 파형에서 드래그한 구간의 통계를 표에 반영하려면 `적용하기`를 눌러야 합니다. 적용한 값은 보존된 장비 원본값으로 복구할 수 있습니다.
- Etching Design은 계측값을 기록하지 않습니다. 프로젝트는 `.etching`으로 저장하고 CAD 결과는 현재 제공되는 DWG 또는 DXF 버튼으로 내보냅니다.
- EXE에서는 생성된 파일이 실행 파일 옆에 저장되는 기능과 브라우저 다운로드 기능이 카드에 따라 다를 수 있습니다. 저장 완료 안내 및 SYSTEM LOG의 실제 경로를 확인하세요.

## 4. 화면 언어와 테마

우측 상단에서 한국어/English 및 Light/Dark 테마를 선택합니다. 일부 XLSX 내보내기는 저장 시점의 화면 언어를 기준으로 시트명과 머리글을 생성합니다. 측정 또는 출력 동작 중에는 안전을 위해 테마·언어 전환이 제한될 수 있습니다.

## 5. 문제 해결과 상세 기준

- 포트가 보이지 않으면 카드의 새로고침을 누르고 USB-Serial 드라이버 및 케이블을 확인합니다.
- 우측 패널이 비거나 그래프가 보이지 않으면 최신 통합 EXE를 사용 중인지 확인하고, 브라우저 개발 실행 시 `python server.py`를 통해 접속합니다.
- 계측기별 통신 명령과 종단문자는 [프로토콜 기준 문서](../docs/INSTRUMENT_COMMUNICATION_PROTOCOLS.md)를 따릅니다.
- 카드 추가/레이아웃 수정 규칙은 [통합 레이아웃 계약](../docs/INTEGRATED_LAYOUT_CONTRACT.md), 현재 버전과 빌드 확인값은 [최신 릴리즈 상태](../docs/RELEASE_STATUS_20260912.md)를 참고합니다.
