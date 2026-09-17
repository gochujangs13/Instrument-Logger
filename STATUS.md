# 🎯 [STATUS.md] 실시간 작업 상황판 (항상 최신 1개만 유지)

- **최종 작업 일시**: 2026-09-18 08:18 (작업자: 안티그래비티)
- **현재 진행 중인 목표**: [준비 완료] GitHub에만 정식 6.6 바이너리 배포 및 로컬 6.5 보존 완료 (사용자 6.5 ➔ 6.6 업데이트 테스트 준비 완료)

---

### 1. 직전에 완료된 작업
- **업데이트 UI/UX 3대 개선 완료**:
  - 독립 업데이트 창(PowerShell WPF) 최상위(맨 앞) 전면 고정 (`SetWindowPos` `HWND_TOPMOST`, `BringWindowToTop`, `SetForegroundWindow`, `ForceForeground` 적용)
  - 메인 프로그램 지연 없는 즉각 종료 및 파일 교체 가속 (`Stop-Process -Force` 즉시 수행, 0.1초 종료)
  - 런처(홈) 화면 전용 업데이트 확인 바 표시 (계측기/소프트웨어 카드 진입 시 자동 숨김, `⌂ Home` 복귀 시 재표시)
- **GitHub 공식 릴리즈 배포 (`v1.0.0-rc.6.6`)**:
  - `STAGE_ONLY=1` 모드로 로컬 실행 파일 간섭 없이 내부 버전 `1.0.0-rc.6.6` 패키지 빌드 완료 (SHA256: `B9DA31434317EE8914D68C159A942F4F3831BC324A87CC3BCED6334F3796F2B9`)
  - GitHub Private Release `v1.0.0-rc.6.6` 공식 생성 및 에셋 업로드 완료 (Release ID: `391115386`, Asset ID: `571350520`)
- **로컬 6.5 테스트 환경 완벽 보존**:
  - 사용자 로컬 실행 파일(`dist/3M_Instrument_Logger.exe`)은 단 1바이트도 건드리지 않고 6.5 최신 상태 그대로 유지 (SHA256: `EAE0C2FC9640942B4F80E4D0FDB981A9A1B344AFE917E2A1D6DADBEC90853404`)
  - 로컬 6.5 실행 시 GitHub의 `v1.0.0-rc.6.6` 신규 버전을 정상 감지하며, "지금 업데이트" 클릭 시 정식 6.6 버전으로 교체 재실행 검증 가능

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
