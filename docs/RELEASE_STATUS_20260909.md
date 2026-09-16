# 3M Instrument Logger — 2026-09-09 릴리즈 상태

## 버전

- 표시 버전: `v1.0.0-rc.2`
- 빌드 번호: `2`
- Windows 파일 버전: `1.0.0.2`
- 릴리즈 날짜: `2026-09-09`
- 배포 파일: `dist/3M_Instrument_Logger.exe`
- 생성 시각: `2026-09-09 06:33:30`
- 파일 크기: `149,831,302 bytes` (142.89 MiB)
- SHA-256: `06F31E2CBFA449BDA595C243C7140696D31758D74673FE18B99B5778A1CC740B`

## 이번 릴리즈 반영 내용

- 공통 레이아웃 계약: 카드 전환·테마·언어 재구성 시 1/2/3열을 자동 판정
- 빈 우측 패널 자동 제거, 이전 카드의 인라인 폭·숨김 상태 초기화
- 중앙 표의 가로 폭 제한 및 그래프 캔버스 재렌더링 예약
- SP-2100/TL-2200 파형 그래프 및 마우스 다중 구간 선택
- 구간별 평균·최소·최대, 복수 구간 통합 평균, 선택 구간의 측정 행 적용
- 적용된 값의 장비 원본값 복구 및 SP-2100 XLSX 대시보드/Raw Data 저장
- Keithley 2400 중앙 그래프의 단일 결과 항목 색상, 복수 결과 샘플 색상, 선 종류 범례

## 검증

- 등록 카드 12개 브라우저 전환 점검
- 테마·언어 전환 후 레이아웃 유지 확인
- 가로 넘침 0px 확인
- 브라우저 콘솔 오류 0건 확인
- `test_layout_contract.mjs` 통과
- `verify_project.py` 통과
- PyInstaller는 선택적 `pycparser.lextab`, `pycparser.yacctab`, `sip` 모듈 경고를 남겼지만
  패키징은 성공했다. Windows 실행에 필요한 pywebview/Qt/PyVISA 경로는 포함 검증했다.

최신 레이아웃 계약 변경은 소스·standalone·이번 릴리즈 EXE에 포함됐다.

포함 모듈: Hioki3540, Keithley2700, Keithley2400, MitutoyoVL50, Agilent4339B, DAQ6510,
SP2100, PT2000, LT1000, AIPhotoEditor, PST3202, EpsonOK900P
