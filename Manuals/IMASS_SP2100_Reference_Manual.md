# IMASS SP-2100 Slip/Peel Tester 기술 레퍼런스 매뉴얼 (읽기 전용)

> [!IMPORTANT]
> **본 문서는 프로그램 개발을 위한 기술 참조용 문서이며, 수정이 불가능한 '기준 문서'로 취급됩니다.**  
> 모든 코딩 작업은 본 매뉴얼에 명시된 통신 규격을 준수해야 합니다.

## 1. 장비 개요 (Equipment Overview)
*   **모델명**: IMASS SP-2100 (Slip/Peel Tester)
*   **용도**: 점착력(Adhesion), 이형력(Release Force), 마찰계수(COF) 측정 및 평가
*   **제조사**: IMASS, Inc.
*   **통신 인터페이스**: RS-232C Serial Port

## 2. RS-232C 통신 설정 (Communication Settings)
장비와 PC 간의 안정적인 데이터 전송을 위해 다음 설정을 따릅니다.

| 항목 | 설정값 |
| :--- | :--- |
| **Baud Rate** | 9600 bps |
| **Data Bits** | 8 bits |
| **Parity** | None |
| **Stop Bits** | 1 bit |
| **Flow Control** | None (또는 XON/XOFF 선택 가능) |
| **Connector** | DB9 (Female) 또는 DB25 |

## 3. 데이터 패킷 구조 (Data Packet Format)
SP-2100은 'Datalink II' 프로토콜을 사용하여 ASCII 문자열 형태로 데이터를 전송합니다. 장비가 'Run' 상태일 때 실시간으로 데이터가 출력됩니다.

### 3.1 출력 데이터 형식 (Output String)
데이터는 고정 길이(보통 12~13자)의 문자열이며, 캐리지 리턴(CR, `\r`)으로 끝납니다.

| 위치 (Index) | 내용 | 설명 |
| :--- | :--- | :--- |
| 0 | Sign | 공백( ) 또는 마이너스(-) |
| 1 ~ 7 | Force Value | 7자리의 숫자 (소수점 포함, 우측 정렬) |
| 8 | Space | 구분자 (Space) |
| 9 ~ 10 | Unit | 단위 (`g `, `oz`, `N `, `kg`) |
| 11 | CR | Carriage Return (`\r` 또는 `0x0D`) |

**데이터 예시:**
*   `  123.4 g \r` : 123.4 그램 측정 중
*   ` -001.2 N \r` : -1.2 뉴턴 측정 중

### 3.2 통신 제어 명령어 (Control Commands)
대부분의 SP-2100 모델은 장비 전면 패널의 버튼으로 작동하지만, 일부 펌웨어 버전에서는 다음 명령어를 지원할 수 있습니다.

*   **`R` (Read)**: 현재 측정값을 1회 요청
*   **`S` (Start)**: 측정 시작 (Run)
*   **`T` (Stop)**: 측정 중지 (Stop)
*   **`Z` (Zero)**: 영점 조절 (Tare/Zero)

> [!NOTE]
> 실제 연동 시에는 장비에서 자동으로 쏟아지는(Streaming) 데이터를 캡처하여 처리하는 방식이 가장 안정적입니다.

## 4. 코딩 시 주의사항 (Development Notes)
1.  **실시간성**: 데이터가 고속으로 들어오므로(예: 10Hz~), 비동기(Threading) 방식으로 시리얼 버퍼를 읽어야 UI가 멈추지 않습니다.
2.  **단위 처리**: 들어오는 데이터의 단위(`g`, `N` 등)를 확인하여 프로그램 상에서 자동으로 환산하거나 표시해야 합니다.
3.  **예외 처리**: 통신 케이블 분리 또는 장비 전원 종료 시 재연동 루틴이 필요합니다.
4.  **안정화**: 측정 시작 전 0.5초 정도의 버퍼 클리어(Flush)를 권장합니다.
