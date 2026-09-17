# 🎯 [STATUS.md] 실시간 작업 상황판 (항상 최신 1개만 유지)

- **최종 작업 일시**: 2026-09-18 07:52 (작업자: 안티그래비티)
- **현재 진행 중인 목표**: [준비 완료] GitHub에 정식 6.5 바이너리 배포 및 로컬 6.4 복원 완료 (사용자 6.4 ➔ 6.5 업데이트 테스트 준비 완료)

---

### 1. 직전에 완료된 작업
- **독립 팝업 자동 업데이트 워크플로우 실기 검증 완료**:
  - 독립 팝업창(PowerShell WPF) 정상 구동 ➔ GitHub Private 다운로드 ➔ 프로그램 파일 안전 교체 ➔ 자동 재실행 ➔ 완료 후 3초 자동 종료 워크플로우 정상 확인.
- **GitHub 공식 릴리즈 배포 (`v1.0.0-rc.6.5`)**:
  - 내부 `version.json`이 실제 `1.0.0-rc.6.5`로 탑재된 신규 패키지 빌드 및 GitHub 릴리즈 업로드 완료 (Release ID: `391106249`, Asset ID: `571316899`, SHA256: `BF2BC5AB9F9EEA933290BAD4EE2A14051C28F87510BC2BCC8D330539A53F316E`).
- **로컬 테스트 환경 세팅**:
  - 사용자 로컬 파일(`dist/3M_Instrument_Logger.exe`)을 순수 `v1.0.0-rc.6.4` 상태로 복원 완료 (SHA256: `82359D74F6FEC7000E6B3AECAE802039B9E2C9D53D716D7FE7EC8803F3716BB1`).
  - 로컬 6.4 실행 시 GitHub 상의 `v1.0.0-rc.6.5` 신규 버전을 정상 감지하며, "지금 업데이트" 클릭 시 정식 6.5 버전으로 교체 재실행 검증 가능.
- **Club Expense 카드 완전 영구 삭제**:
  - `build/build_standalone.py`의 `INSTRUMENT_MAP`에서 완전 제거
  - `core.js`의 `_LAUNCHER_GROUPS`에서 삭제
  - `instruments/club_expense.js` 및 `assets/club_expense.png` 물리적 파일 삭제
  - `dist/*ClubExpense*` 캐시 폴더 정리 및 정규 13종(계측기 10종 + 소프트웨어 3종) 확립

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
