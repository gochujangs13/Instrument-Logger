---
tags:
  - 3M
  - instrument-logger
  - project-home
---

# 3M Instrument Logger

> [!success] 현재 배포본
> **v1.0.0-rc.6 (빌드 6)** · 2026-09-14  
> 실행 파일: `dist\\3M_Instrument_Logger.exe`  
> SHA-256: `F7F7814F0C24939F8BC835F68FC7F56C6EAF00D75FF1300910FEFB29F403DD0F`

여기는 여러 계측기의 측정, 기록, CSV 내보내기를 하나의 웹 프로그램으로 통합한 프로젝트의 시작 화면입니다. 왼쪽 파일 탐색기에서 코드와 문서를 모두 확인할 수 있고, 아래 링크로 필요한 자료를 바로 열 수 있습니다.

## 바로 시작

- 개발 화면 실행: `python server.py` 실행 후 `http://localhost:8000/index.html` 열기
- 배포 프로그램 실행: `dist\\3M_Instrument_Logger.exe`
- 사용자 사용법: [[Manuals/3M_Instrument_Logger_User_Manual|통합 프로그램 사용자 매뉴얼]]
- 계측기 통신 명령/응답 기준: [[docs/INSTRUMENT_COMMUNICATION_PROTOCOLS|계측기 통신 프로토콜]]

## 계측기별 사용 매뉴얼

| 계측기 | Obsidian 문서 |
| --- | --- |
| Hioki 3540 | [[docs/manuals/Hioki_3540]] |
| Keithley 2700 | [[docs/manuals/Keithley_2700]] |
| Mitutoyo VL-50 | [[docs/manuals/Mitutoyo_VL-50]] |
| SP-2100 / TL-2200 | [[docs/manuals/SP-2100_TL-2200]] |
| Agilent 4339B | [[docs/manuals/Agilent_4339B]] |
| DAQ-6510 | [[docs/manuals/DAQ-6510]] |
| PT-2000 Probe Tack | [[docs/manuals/PT-2000]] |
| LT-1000 Loop Tack | [[docs/manuals/LT-1000]] |
| PST-3202 | [[docs/manuals/PST-3202]] |
| Photo Editor | [[docs/manuals/Photo_Editor]] |
| Epson PRIFIA OK900P | [[docs/manuals/Epson_OK900P]] |
| Etching Design | [[docs/manuals/Etching_Design]] |

- 전체 매뉴얼 목록: [[docs/manuals/README|매뉴얼 안내]]
- SP-2100 / TL-2200 파싱 기준: [[docs/SP2100_PROTOCOL_REFERENCE|프로토콜 참고 문서]]

## 개발 · 유지보수

- 프로젝트 구조와 인수인계: [[AGENTS]]
- 작업 이력과 성과: [[개발_이슈_및_성과_정리]]
- PST-3202 수정 이력: [[PST3202_수정이력]]
- 화면 반응형 구성 가이드: [[docs/반응형_레이아웃_가이드]]

## 주요 폴더

| 폴더/파일 | 내용 |
| --- | --- |
| `instruments/` | 계측기별 통신·화면 모듈 |
| `core.js` | 공통 화면, 기록, 통신 엔진 |
| `docs/` | 프로토콜과 사용 매뉴얼 |
| `Manuals/` | 제조사 원본/참고 매뉴얼 |
| `build/` | Standalone·EXE 패키징 스크립트 |
| `dist/` | 배포용 EXE |

## 배포 확인 정보

- 파일: `dist\\3M_Instrument_Logger.exe`
- SHA-256: `릴리즈 빌드 후 갱신`
- 배포 전 확인: `python .agents\\skills\\maintain-3m-instrument-logger\\scripts\\verify_project.py`

최신 릴리즈 점검표: [[docs/RELEASE_STATUS_20260914|2026-09-14 릴리즈 상태]]
