# 🎯 [STATUS.md] 실시간 작업 상황판 (항상 최신 1개만 유지)

- **최종 작업 일시**: 2026-09-18 07:28 (작업자: 안티그래비티)
- **현재 진행 중인 목표**: [완료] GitHub v1.0.0-rc.6.4 공식 릴리즈 배포 완료 (사용자 6.3 버전 업데이트 실기 테스트용)

---

### 1. 직전에 완료된 작업
- **GitHub 공식 릴리즈 v1.0.0-rc.6.4 배포 완료**:
  - 저장소: `gochujangs13/Instrument-Logger` (Private)
  - 릴리즈: `v1.0.0-rc.6.4` 태그 및 `3M_Instrument_Logger.exe` (143.38MB, 150,339,739 바이트) 에셋 업로드 완료 (Release ID: `391097946`, Asset ID: `571277446`)
  - 검증: v1.0.0-rc.6.3 실행 시 `update_available: True`, `latest_version: 1.0.0-rc.6.4` 감지 확인 완료. 사용자 6.3 환경에서 원클릭 독립 팝업 자동 업데이트 테스트 준비 완료.
- **Club Expense 카드 완전 영구 삭제**:
  - `build/build_standalone.py`의 `INSTRUMENT_MAP`에서 완전 제거
  - `core.js`의 `_LAUNCHER_GROUPS`에서 삭제
  - `instruments/club_expense.js` 및 `assets/club_expense.png` 물리적 파일 삭제
  - `dist/*ClubExpense*` 캐시 폴더 정리 및 정규 13종(계측기 10종 + 소프트웨어 3종) 확립
- **독립 팝업창(Standalone Updater) 기반 무중단 자가 교체·자동 재실행 시스템**:
  - `updater_backend.py` / `scripts/updater_gui.ps1`을 통한 PowerShell WPF 독립 팝업 프로세스 구동
  - 기존 프로그램 즉각 안전 종료로 Windows 프로세스 파일 잠금(`WinError 32: Access Denied`) 원천 차단
  - 0% ~ 100% 실시간 게이지 다운로드, 파일 교체, 최신 버전 자동 재실행, 3초 카운트다운 안내 후 자동 닫힘
- **무결성 검증**:
  - `verify_project.py` 전체 저장소 검증 100% PASS (JS 32개, 계측기 15개, Python 26개, HTTP 19개)

---

### 2. 현재 상태 및 아키텍처 규칙
- **소스 & 배포 저장소 (Private)**: `gochujangs13/Instrument-Logger`
- **인증 방식**: Windows 자격 증명 관리자(`git:https://github.com`) 자동 탐색 및 내장/설정 토큰 연동
- **실행 환경**: Windows EXE (pywebview + 내장 로컬 HTTP 서버)
- **인수인계 규칙**: 다음 작업자(코덱스 등 AI)는 작업을 시작하기 전 이 `STATUS.md`를 먼저 읽고, 작업이 끝나면 이 파일의 1~3번 항목을 최신 상태로 갱신할 것.

---

### 3. 바로 다음 작업자가 할 일 (TODO)
1. 사용자가 `dist/3M_Instrument_Logger.exe`를 실행하여 100% 팝업 및 재시작 실기 확인 시 피드백 대응.
2. 향후 신규 버전 배포 시 `version.json` 버전을 올리고 빌드 후 `scripts/publish_release_to_github.py`를 실행하면 GitHub Release 자동 배포 가능.
