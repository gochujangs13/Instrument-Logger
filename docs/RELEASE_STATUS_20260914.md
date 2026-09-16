# 3M Instrument Logger — 2026-09-14 릴리즈 상태

## 버전과 배포 파일

- 표시 버전: `v1.0.0-rc.6`
- 빌드 번호: `6`
- Windows 파일 버전: `1.0.0.6`
- 배포 파일: `dist/3M_Instrument_Logger.exe` (통합 EXE 한 개)
- 생성 시각: `2026-09-14 13:56:19 KST`
- 파일 크기: `150,959,404 bytes (143.97 MiB)`
- SHA-256: `F7F7814F0C24939F8BC835F68FC7F56C6EAF00D75FF1300910FEFB29F403DD0F`

## 이번 릴리즈

- Etching Design 완료 처리: 자동 배치, 단일/혼합 원판 치수 공유·저장, 기본 1mm 브릿지 위·아래 에칭 거리
- 브릿지 본체 홀/사각 가공: 중앙, 대칭 2포인트, 대칭 4포인트 지원
- 2/4포인트 거리는 가장자리 여백이 아니라 홀/사각형 중심 간 거리로 입력하며, 크기 때문에 가장자리를 침범하면 자동 보정
- 브릿지/지지대 용어를 분리해 화면 설명을 수정
- 직접 DWG 작성기를 사용자 경로에서 제거. DWG 버튼은 정상 DXF를 설치된 ODA File Converter로 전달해 `ACAD2007 / DWG / Audit` 결과만 저장
- ODA 변환기가 없거나 결과가 `AC1021`이 아니면 DWG 저장 차단
- 13개 등록 계측기·도구를 모두 포함

## 검증

- 저장소 전체 verifier 통과: JavaScript syntax 32, behavior tests 15, Python syntax 20, imports 15, HTTP smoke 19
- Etching geometry 20/20, bridge feature 5/5, Auto Layout/feature preview/persistence 회귀 테스트 통과
- Etching i18n 182개 키 한·영 일치
- DXF, 제조 형상 26개, 에칭 제거 폐곡선 6개 및 제조 형상 분석 11개 검증 통과
- 모의 ODA 변환기로 명령 인자 `ACAD2007 / DWG / Audit`와 결과 `AC1021` 검증 통과
- standalone와 소스 해시 일치, PyInstaller 아카이브에 Etching Design 전체 런타임 의존 파일 포함 확인
- standalone 폴더를 매 빌드마다 초기화해 더 이상 참조하지 않는 구형 직접 DWG 작성기와 `acad-ts`가 EXE에 잔류하지 않도록 검증
- `dist`의 `3M_Instrument_Logger*.exe`는 한 개

PyInstaller는 PyQt5와 PyQt6가 함께 설치된 환경에서 PyQt5를 선택했다는 경고를 출력했으나, 빌드와 아카이브 검증은 통과했다.

## 남은 현장 확인

사용자가 제공한 rc.3 DWG는 DWG TrueView 2024에서 `Drawing file is not valid`로 거부됐다. rc.6는 해당 직접 작성기를 사용하지 않는다. ODA File Converter 27.1을 사용자 폴더에 설치하고 R12 DXF→ODA Audit→AC1021 DWG API 변환을 확인했다. 실제 사용자 도면의 TrueView/Inventor 열기 확인은 남아 있다.

rc.5 실행 시 PyInstaller 내부 데이터 루트가 13개 모듈명을 연결한 긴 폴더여서 Windows 임시 압축 해제 경로가 한도를 넘으며 `failed to create parent directory structure`가 발생했다. rc.6는 내부 데이터 루트를 `app`으로 고정했고, 빌드 후 EXE를 직접 실행해 신규 프로세스 2개와 `_MEI` 압축 해제 폴더가 정상 유지되는 것을 확인했다.
