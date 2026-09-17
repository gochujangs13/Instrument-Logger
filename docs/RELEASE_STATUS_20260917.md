# 3M Instrument Logger — 2026-09-17 릴리즈 상태

## 버전과 배포 파일

- 표시 버전: `v1.0.0-rc.6.1`
- 빌드 번호: `6.1`
- Windows 파일 버전: `1.0.6.1`
- GitHub 릴리즈 태그: `v1.0.0-rc.6.1` (저장소: `gochujangs13/Instrument-Logger`)
- GitHub Release 에셋: `3M_Instrument_Logger.exe` (150,828,569 bytes, 143.84 MiB)
- 배포 파일: `dist/3M_Instrument_Logger.exe`
- 생성 시각: `2026-09-17 16:03:05 KST`

## 이번 릴리즈 주요 변경점

1. **GitHub Private 저장소 기반 무중단 자동 업데이트 시스템 공식 구축**:
   - 상단바 실시간 백그라운드 버전 체크 (현재 최신 버전 여부 배지 표시).
   - 신규 버전 발견 시 직관적 모달 안내 및 [지금 업데이트] 원클릭 시작.
   - S3 리다이렉트 인증 충돌(`400 Bad Request`) 방지용 `_S3SafeRedirectHandler` 탑재.
   - 사내 프록시/방화벽 SSL 통신 오류 자동 우회(Unverified SSL Context Fallback) 연동.
   - Windows Credential Manager(`git:https://github.com`) 토큰 자동 탐색 탑재.
2. **업데이트 100% 완료 팝업 및 자동 재시작 프로세스 구현**:
   - 실시간 다운로드 게이지가 100%까지 끊김 없이 반영.
   - 100% 도달 시 에메랄드 그린 빛나는 완료 바(`updater-progress-done`) 및 `🎉 새 버전 업데이트가 100% 준비되었습니다!` 카드 렌더링.
   - 3초 카운트다운 타이머(`🔄 3초 후 프로그램을 안전하게 종료하고 최신 버전으로 자동 재시작합니다... (3)`) 표시.
   - 사용자가 즉시 재시작할 수 있는 `[🚀 지금 바로 재시작 (3s)]` 펄스 버튼 제공.
   - 카운트다운 완료 또는 버튼 클릭 시 프로그램 안전 종료 및 신규 버전 교체/재실행.
3. **Windows 프로세스 잠금 완벽 해제 (WinError 32 Access Denied 해결)**:
   - PyInstaller `--onefile`의 부모 부트로더 및 파이썬 자식 프로세스를 모두 인지하여 `taskkill /f /im "!EXE_NAME!"`으로 프로세스 잠금을 완전 해제한 뒤 원자적 `copy /y` 수행.
   - `start "" /D "!TARGET_DIR!" "!TARGET!"`로 본래 실행 폴더 작업 디렉터리를 보존하여 재실행.
4. **Photo Editor 명칭 일원화 및 회귀 정리**:
   - 잔여 표기였던 `AI Photo Editor` / `AIPhotoEditor`를 `Photo Editor` / `PhotoEditor`로 완전 일원화.

## 검증 내역

- 전체 프로젝트 무결성 검증 (`verify_project.py`):
  - JavaScript syntax: 33 files [OK]
  - Instrument behavior tests: 15 files [OK]
  - Python syntax: 24 files [OK]
  - index.js imports: 15 files [OK]
  - HTTP smoke tests: 19 files [OK]
  - [PASS] Project verification completed
- 브라우저 서브에이전트 실기 검증 완료:
  - `updater_completion_100_percent_1789628387900.png` (100% 완료 카드, 카운트다운 안내, 릴리즈 노트, 버튼 정상 확인)
- GitHub Release `v1.0.0-rc.6.1` 업로드 성공 (Asset ID: 569677471).
