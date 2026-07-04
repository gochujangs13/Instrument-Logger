# 3M Instrument Logger — 계측기별 사용 매뉴얼

> 각 계측기의 연결 방법·사용 절차·문제 해결을 정리한 문서 모음입니다.
> 앱 전체 공통 기능은 프로젝트 루트의 `manual.html`(브라우저용 통합 설명서)을 참고하세요.

## 매뉴얼 목록

| 계측기 | 파일 | 용도 | 인터페이스 |
|---|---|---|---|
| Hioki 3540 | [Hioki_3540.md](Hioki_3540.md) | 저항 측정 (mΩ) | RS-232C |
| Keithley 2700 | [Keithley_2700.md](Keithley_2700.md) | 저항 측정 (멀티미터) | RS-232C |
| Mitutoyo VL-50 | [Mitutoyo_VL-50.md](Mitutoyo_VL-50.md) | 두께 측정 | RS-232C ⚠ 7E2 |
| Agilent 4339B | [Agilent_4339B.md](Agilent_4339B.md) | 고저항 측정 | GPIB-USB |
| DAQ-6510 | [DAQ-6510.md](DAQ-6510.md) | 다채널 저항 로깅 | RS-232C |
| SP-2100 / TL-2200 | [SP-2100_TL-2200.md](SP-2100_TL-2200.md) | 박리·인장 시험 | RS-232C |
| PT-2000 | [PT-2000.md](PT-2000.md) | Probe Tack 시험 | WebHID (USB) |
| LT-1000 | [LT-1000.md](LT-1000.md) | Loop Tack 시험 | RS-232C |
| **PST-3202** | [PST-3202.md](PST-3202.md) | **DC 전원공급기 (초보자용 상세 매뉴얼)** | RS-232C |
| Photo Editor | [Photo_Editor.md](Photo_Editor.md) | 사진 편집·엑셀 내보내기 | 비-시리얼 |

## 공통: 앱 실행 및 연결 방법

1. 폴더 내 `시작.bat` 더블클릭 (또는 `python server.py` 실행)
2. 브라우저(Chrome/Edge)에서 `http://localhost:8000/index.html` 접속
3. 런처 화면에서 원하는 계측기 카드 클릭
4. USB↔RS-232C 케이블로 계측기 연결 후 상단 **[연결 안됨]** 버튼 클릭
5. COM 포트 선택 → **연결** → 상단이 **[연결됨]**(초록)으로 바뀌면 사용 가능

⚠ 포트 목록에 장치가 없으면 USB-Serial 드라이버(CH340/FTDI/PL2303 등)를 설치하세요.

## 시리얼 설정 빠른 참조표

| 계측기 | Baud | Data | Parity | Stop | 비고 |
|---|---|---|---|---|---|
| Hioki 3540 | 9600 | 8 | None | 1 | |
| Keithley 2700 | 9600 | 8 | None | 1 | |
| Mitutoyo VL-50 | 9600 | **7** | **Even** | **2** | 유일하게 7E2 |
| SP-2100 | 57600 | 8 | None | 1 | |
| TL-2200 | 38400 | 8 | None | 1 | |
| Agilent 4339B | — | — | — | — | GPIB-USB (VISA) |
| DAQ-6510 | 9600 | 8 | None | 1 | |
| PT-2000 | — | — | — | — | WebHID (USB 직결) |
| LT-1000 | 9600 | 8 | None | 1 | DTR/RTS HIGH 필요 |
| PST-3202 | 9600 | 8 | None | 1 | SCPI, `\n` 종단 |

앱이 계측기별 올바른 설정으로 자동 연결하므로 사용자가 직접 설정할 필요는 없습니다.
