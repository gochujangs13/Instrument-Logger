# 3M Instrument Logger — 2026-09-12 릴리즈 상태

## 버전과 배포 파일

- 표시 버전: `v1.0.0-rc.2`
- 사용자가 요청한 빌드 번호: `2`
- Windows 파일 버전: `1.0.0.2`
- 배포 파일: `dist/3M_Instrument_Logger.exe` (통합 EXE 한 개)
- 생성 시각: `2026-09-12 21:57:53`
- 파일 크기: `151,187,825 bytes` (144.18 MiB)
- SHA-256: `759B533271C1E129870F3487AAA9541C0DC7F8CF3BDBAACF3F2E56EA6251F98F`

## 포함 카드 및 도구

Hioki 3540, Keithley 2700, Keithley 2400, Mitutoyo VL-50, Agilent 4339B, DAQ-6510,
SP-2100/TL-2200, PT-2000, LT-1000, Photo Editor, PST-3202, Epson PRIFIA OK900P,
Etching Design — 총 13개.

## 최근 반영 사항

- 전역 레이아웃 계약으로 카드 전환·테마·언어 재구성 시 1/2/3열 자동 판정, 이전 카드의 인라인 크기와 숨김 상태 초기화, 패널/창 크기 변경 후 그래프 재렌더링.
- SP-2100/TL-2200 파형 화면의 누적 다중 드래그 구간 선택, 구간별 평균/최소/최대, 중복 포인트를 한 번만 계산하는 통합 평균/최소/최대, 선택 결과의 테이블 적용 및 장비 원본값 복구.
- Keithley 2400 그래프: 단일 결과는 V/I/R 항목 색상, 복수 결과는 샘플별 색상, 전압 실선·전류 굵은 점선·저항 점선 범례.
- Etching Design: 단일/혼합 배치, 수동 여백, 동적 타입과 타입별 간격, 방향/코너/탭, 제조·검토 DWG/DXF, 제조 형상 검증.

## Etching Design UI 확인 메모

AGENTS 인수인계에는 SVG/PDF/PNG 내보내기가 완료됐다고 적혀 있으나, 현재 `instruments/etching_design.js`의 실제 툴바에는 DWG/DXF 버튼만 연결돼 있다. 별도 UI 버튼/핸들러가 확인되기 전에는 SVG/PDF/PNG를 사용자에게 제공되는 Etching 기능으로 문서화하지 않는다. 내보내기 구현이 필요하면 별도 작업으로 추가·테스트한다.

## 검증 및 재현성

빌드 전 `python .agents/skills/maintain-3m-instrument-logger/scripts/verify_project.py`를 실행한다. Etching 형상 변경은 아래 테스트도 개별 실행한다.

```powershell
node scripts/test_etch_remove_geometry.mjs
node scripts/test_etching_manufacturing_export.mjs
node scripts/test_etching_mixed_margins.mjs
node scripts/test_etching_advanced_features.mjs
node scripts/test_etching_corner_features.mjs
node scripts/test_etching_custom_gaps.mjs
node scripts/test_etching_dwg_dxf_export.mjs
node scripts/test_etching_i18n.mjs
node scripts/test_etching_split_direction.mjs
node tests/test_etching_geometry.mjs
node scripts/test_acad_dwg.mjs
```

패키징 성공과 현장 제조 검증은 별개다. 이번 릴리즈는 제조 레이어/지오메트리 자동 검증과 브라우저 테스트를 통과했지만, 실제 에칭/레이저 CAM 장비·공정은 제조 현장에서 별도 확인해야 한다.
자동 검증 결과: 프로젝트 검증 15개 Node 동작 테스트 포함 통과, SP-2100 다중 구간/XLSX 테스트 통과, Etching Design 기하 20/20 및 제조/브릿지/여백/코너/분할/i18n 테스트 통과.

## 최종 EXE 확인

`dist/3M_Instrument_Logger.exe` 생성 시각, 파일 크기, SHA-256 및 아카이브 내 13개 모듈을 확인했다. `core.js`, `index.css`, `version.json`, `standalone_entry.js`, `sp2100_logger.js`, `sp2100_xlsx.js`, `keithley_2400.js`, `epson_ok900p.js`, Etching Design의 전체 JS 의존 파일도 아카이브에 존재한다.
