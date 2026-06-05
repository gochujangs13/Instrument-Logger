# Agilent 4339B & 16008B 완전 매뉴얼 (읽기 전용)

> [!CAUTION]
> 이 문서는 공식 매뉴얼 기반 기준 문서입니다. **수정 금지**.

---

## 1. 장비 개요

### 1.1 Agilent 4339B High Resistance Meter
- **기능**: 고저항 측정 (절연 저항, 체적/표면 저항률)
- **측정 범위**: 1 kΩ ~ 1.6 × 10¹⁶ Ω
- **전류 측정**: 60 fA ~ 10 mA
- **인가 전압**: 0.1V ~ 1000V (DC), 스텝: 0.1V
- **정확도**: ±0.6% (대표값, 조건에 따라 다름)
- **인터페이스**: GPIB (IEEE-488.2), SCPI 호환
- **디스플레이**: VFD, 저항/전류/전압 동시 표시

### 1.2 Agilent 16008B Resistivity Cell
- **기능**: 체적 저항(Volume Resistivity) 및 표면 저항(Surface Resistivity) 측정용 지그
- **전극 크기**: 26mm, 50mm, 76mm (교환 가능)
- **적합 장비**: 4339B High Resistance Meter
- **시료 크기**: 최소 전극 직경 + 가드 링 크기 이상
- **인터락(Interlock)**: 덮개 닫힘 시에만 고전압 출력 허용

---

## 2. 하드웨어 연결

### 2.1 4339B ↔ 16008B 케이블 연결
| 케이블 | 4339B 단자 | 16008B 단자 | 비고 |
|:---|:---|:---|:---|
| Triaxial | INPUT | INPUT | 전류 측정 신호 |
| BNC | OUTPUT HI | OUTPUT | 전압 인가 |
| 4-pin | INTERLOCK | INTERLOCK | 안전 인터록 |

### 2.2 GPIB 연결 (PC ↔ 4339B)
- GPIB 케이블로 4339B 뒷면 GPIB 포트 → PC GPIB 인터페이스
- **기본 GPIB 주소**: `17`
- 변경: `[Local]` → `ADDRESS` 메뉴에서 설정

### 2.3 인터락 메커니즘
- 16008B 덮개를 완전히 닫아야 인터락 회로가 닫힘
- 인터락 열림 시 전압 출력 자동 차단 (최대 1000V 보호)
- `:SOUR:VOLT:STAT ON` 시 인터락 확인 필수

---

## 3. 16008B 전극 치수 상수 (Electrode Constants)

### 3.1 전극별 물리 치수
| 전극 | Main (D1) | Guard (D2) | Ring (D3) | Gap |
|:---|:---|:---|:---|:---|
| **26mm** | 26.0 mm | 28.0 mm | 43.0 mm | 1.0 mm |
| **50mm** | 50.0 mm | 52.0 mm | 70.0 mm | 1.0 mm |
| **76mm** | 76.0 mm | 78.0 mm | 96.0 mm | 1.0 mm |

### 3.2 계산에 사용하는 상수 (SCPI 설정값)

#### 체적 저항 (Volume Resistivity) 상수
| 전극 | Effective Area A (m²) | 수식 |
|:---|:---|:---|
| 26mm | 5.7256 × 10⁻⁴ | π × ((D1+D2)/4)² |
| 50mm | 2.0612 × 10⁻³ | π × ((D1+D2)/4)² |
| 76mm | 4.6760 × 10⁻³ | π × ((D1+D2)/4)² |

> **Effective Electrode Area 공식**: A = π × ((D1 + D2) / 4)²

#### 표면 저항 (Surface Resistivity) 상수
| 전극 | Effective Perimeter P (m) | Gap g (m) |
|:---|:---|:---|
| 26mm | 8.4823 × 10⁻² | 1.0 × 10⁻³ |
| 50mm | 1.6022 × 10⁻¹ | 1.0 × 10⁻³ |
| 76mm | 2.4190 × 10⁻¹ | 1.0 × 10⁻³ |

> **Effective Perimeter 공식**: P = π × (D1 + D2) / 2
> **Gap 공식**: g = (D2 - D1) / 2

---

## 4. 저항률(Resistivity) 계산 공식

### 4.1 체적 저항률 (Volume Resistivity, ρv)
```
ρv = Rv × A / t   [Ω·cm]
```
- Rv: 측정된 체적 저항 (Ω)
- A: Effective electrode area (cm²)
- t: 시료 두께 (cm)

### 4.2 표면 저항률 (Surface Resistivity, ρs)
```
ρs = Rs × P / g   [Ω/□ 또는 Ω]
```
- Rs: 측정된 표면 저항 (Ω)
- P: Effective perimeter (cm)
- g: Gap between electrodes (cm)

### 4.3 16008B 측정 전환 (Volume ↔ Surface)
- **체적 저항 측정**: 표준 연결 (Main electrode → HI, Guard ring → Guard)
- **표면 저항 측정**: 16008B 내부 스위치 또는 케이블 재연결 필요
  - Main electrode → HI (측정 전극)
  - Guard ring → 전압 인가 측으로 전환

---

## 5. 프론트 패널 조작

### 5.1 주요 키
| 키 | 기능 |
|:---|:---|
| `MEASURE` | 측정 시작/정지 |
| `V SOURCE` | 인가 전압 설정 (0.1~1000V) |
| `CHARGE TIME` | 충전 시간 설정 (0~999s) |
| `DISCHARGE TIME` | 방전 시간 설정 (0~999s) |
| `AVERAGE` | 평균 횟수 설정 (1~256) |
| `FUNCTION` | 저항/전류/전하 모드 전환 |
| `CALC` | 저항률 계산 모드 (VRES/SRES) 전환 |
| `LOCAL` | GPIB 리모트 → 로컬 전환, 설정 메뉴 |

### 5.2 측정 절차 (수동)
1. 시료를 16008B에 장착, 덮개 닫기
2. `V SOURCE`로 인가 전압 설정 (예: 500V)
3. `CHARGE TIME` 설정 (예: 60s)
4. `CALC` → `VRES` 또는 `SRES` 선택
5. 전극 치수 입력 (Area, Perimeter, Gap, Thickness)
6. `MEASURE` 버튼으로 측정 시작

---

## 6. GPIB 통신 설정

### 6.1 통신 파라미터
| 항목 | 값 |
|:---|:---|
| **인터페이스** | GPIB (IEEE 488.1 / 488.2) |
| **기본 주소** | 17 |
| **언어** | SCPI |
| **터미네이터** | LF (Line Feed) + EOI |
| **SRQ 지원** | 있음 (Service Request) |

### 6.2 GPIB 주소 변경
```
프론트 패널: [Local] → ADDRESS → 0~30 설정
```

---

## 7. SCPI 커맨드 레퍼런스

### 7.1 IEEE 488.2 공통 커맨드
| 커맨드 | 기능 |
|:---|:---|
| `*IDN?` | 장비 식별 (HEWLETT-PACKARD,4339B,0,X.XX) |
| `*RST` | 장비 초기화 (팩토리 리셋) |
| `*CLS` | 상태 레지스터 클리어 |
| `*TRG` | 트리거 실행 |
| `*OPC?` | 현재 오퍼레이션 완료 확인 (1 반환) |
| `*WAI` | 현재 커맨드 완료까지 대기 |
| `*ESE <n>` | Event Status Enable 레지스터 설정 |
| `*ESR?` | Event Status Register 읽기 |
| `*SRE <n>` | Service Request Enable 설정 |
| `*STB?` | Status Byte 읽기 |

### 7.2 SOURce 서브시스템 (전압 출력)
```scpi
:SOUR:VOLT <value>           # 인가 전압 설정 (0.1 ~ 1000)
:SOUR:VOLT?                  # 인가 전압 조회
:SOUR:VOLT:STAT ON|OFF       # 전압 출력 ON/OFF
:SOUR:VOLT:STAT?             # 전압 출력 상태 조회
```

### 7.3 SENSe 서브시스템 (측정 기능)
```scpi
:SENS:FUNC "RES"             # 저항 측정 모드
:SENS:FUNC "CURR"            # 전류 측정 모드
:SENS:FUNC "CHAR"            # 전하 측정 모드
:SENS:FUNC?                  # 현재 측정 기능 조회
:SENS:RES:RANG:AUTO ON|OFF   # 저항 자동 레인지
:SENS:CURR:RANG:AUTO ON|OFF  # 전류 자동 레인지
```

### 7.4 CALCulate 서브시스템 (저항률 계산)
```scpi
:CALC1:STAT ON|OFF           # 계산 기능 활성화/비활성화
:CALC1:STAT?                 # 계산 상태 조회
:CALC1:FORM VRES             # 체적 저항률(Volume Resistivity) 모드
:CALC1:FORM SRES             # 표면 저항률(Surface Resistivity) 모드
:CALC1:FORM?                 # 현재 계산 모드 조회

# 체적 저항 파라미터
:CALC1:RES:EAR <value>       # Effective Electrode Area 설정 (m²)
:CALC1:RES:EAR?              # Electrode Area 조회
:CALC1:RES:STH <value>       # Sample Thickness 설정 (m)
:CALC1:RES:STH?              # Sample Thickness 조회

# 표면 저항 파라미터
:CALC1:RES:EPER <value>      # Effective Perimeter 설정 (m)
:CALC1:RES:EPER?             # Perimeter 조회
:CALC1:RES:GLEN <value>      # Gap Length 설정 (m)
:CALC1:RES:GLEN?             # Gap Length 조회
```

### 7.5 TRIGger 서브시스템
```scpi
:TRIG:SOUR BUS|INT|EXT       # 트리거 소스 설정
:TRIG:SOUR?                  # 트리거 소스 조회
:TRIG:DEL <value>            # 트리거 지연 설정 (초)
:TRIG:DEL?                   # 트리거 지연 조회
:TRIG:COUN <value>           # 트리거 카운트 (1~65535)
:TRIG:COUN?                  # 트리거 카운트 조회
```

### 7.6 INITiate / FETCh / MEASure
```scpi
:INIT                        # 측정 시작 (트리거 대기 상태)
:FETC?                       # 최근 측정 데이터 읽기
:MEAS:RES?                   # 저항 측정 실행 + 결과 반환 (원샷)
:MEAS:CURR?                  # 전류 측정 실행 + 결과 반환
```

### 7.7 DATa 서브시스템
```scpi
:DATA:FEED:CONT ALW|NEV      # 데이터 피드 제어
:DATA:COUN?                  # 저장된 데이터 수 조회
```

### 7.8 FORMat 서브시스템
```scpi
:FORM:DATA ASC|REAL           # 데이터 형식 (ASCII / REAL)
:FORM:DATA?                   # 현재 형식 조회
```

### 7.9 SYSTem 서브시스템
```scpi
:SYST:ERR?                   # 에러 큐 읽기 (code,"message")
:SYST:VERS?                  # SCPI 버전 조회
:SYST:BEEP:STAT ON|OFF       # 비프음 ON/OFF
```

### 7.10 DISPlay 서브시스템
```scpi
:DISP:ENAB ON|OFF            # 디스플레이 ON/OFF
:DISP:TEXT "message"         # 사용자 메시지 표시
:DISP:TEXT:CLE               # 메시지 클리어
```

### 7.11 충전/방전 시간 설정
```scpi
:SENS:RES:CHAR:TIME <value>  # 충전 시간 설정 (초, 0~999)
:SENS:RES:CHAR:TIME?         # 충전 시간 조회
:SENS:RES:DISC:TIME <value>  # 방전 시간 설정 (초, 0~999)
:SENS:RES:DISC:TIME?         # 방전 시간 조회
```

### 7.12 평균 설정
```scpi
:SENS:AVER:STAT ON|OFF       # 평균 기능 ON/OFF
:SENS:AVER:COUN <n>          # 평균 횟수 (1~256)
:SENS:AVER:COUN?             # 평균 횟수 조회
```

### 7.13 STATus 서브시스템
```scpi
:STAT:OPER:COND?             # 오퍼레이션 상태 레지스터 읽기
:STAT:OPER:ENAB <n>          # 오퍼레이션 이벤트 인에이블
:STAT:OPER?                  # 오퍼레이션 이벤트 읽기
:STAT:QUES:COND?             # Questionable 상태 레지스터
:STAT:QUES:ENAB <n>          # Questionable 이벤트 인에이블
```

**Status Byte (STB) 비트 정의:**
| Bit | 값 | 의미 |
|:---|:---|:---|
| 0 | 1 | 미사용 |
| 2 | 4 | Error Available |
| 3 | 8 | Questionable Data |
| 4 | 16 | MAV (Message Available) |
| 5 | 32 | ESB (Event Status Bit) |
| 6 | 64 | RQS/MSS |
| 7 | 128 | Operation Status |

---

## 8. GPIB 프로그래밍 예제

### 8.1 체적 저항 측정 (HP BASIC 원본)
```basic
10  ! === Volume Resistivity Measurement with 16008B (50mm electrode) ===
20  ASSIGN @Hp4339 TO 717              ! GPIB address 17
30  OUTPUT @Hp4339;"*RST"              ! Reset
40  OUTPUT @Hp4339;":SOUR:VOLT 500"    ! Set 500V
50  OUTPUT @Hp4339;":SENS:FUNC ""RES"""
60  OUTPUT @Hp4339;":SENS:RES:CHAR:TIME 60"   ! Charge 60s
70  OUTPUT @Hp4339;":SENS:RES:DISC:TIME 5"    ! Discharge 5s
80  OUTPUT @Hp4339;":CALC1:STAT ON"
90  OUTPUT @Hp4339;":CALC1:FORM VRES"
100 OUTPUT @Hp4339;":CALC1:RES:EAR 2.0612E-3" ! 50mm electrode area
110 OUTPUT @Hp4339;":CALC1:RES:STH 1.0E-3"    ! Sample thickness 1mm
120 OUTPUT @Hp4339;":TRIG:SOUR BUS"
130 OUTPUT @Hp4339;":SOUR:VOLT:STAT ON"       ! Voltage ON
140 OUTPUT @Hp4339;":INIT"
150 OUTPUT @Hp4339;"*TRG"
160 OUTPUT @Hp4339;"*OPC?"
170 ENTER @Hp4339;Opc
180 OUTPUT @Hp4339;":FETC?"
190 ENTER @Hp4339;Result
200 PRINT "Volume Resistivity: ";Result;" ohm-cm"
210 OUTPUT @Hp4339;":SOUR:VOLT:STAT OFF"
220 END
```

### 8.2 Python (pyvisa) 변환 예제
```python
import pyvisa

rm = pyvisa.ResourceManager()
inst = rm.open_resource('GPIB0::17::INSTR')
inst.timeout = 120000  # 120s (충전 시간 고려)

# 초기화
inst.write('*RST')
inst.write('*CLS')

# 전압 설정
inst.write(':SOUR:VOLT 500')         # 500V
inst.write(':SENS:FUNC "RES"')

# 충전/방전 시간
inst.write(':SENS:RES:CHAR:TIME 60') # 충전 60초
inst.write(':SENS:RES:DISC:TIME 5')  # 방전 5초

# 체적 저항률 계산 설정 (50mm 전극)
inst.write(':CALC1:STAT ON')
inst.write(':CALC1:FORM VRES')
inst.write(':CALC1:RES:EAR 2.0612E-3')  # Effective Area
inst.write(':CALC1:RES:STH 1.0E-3')     # Sample Thickness 1mm

# 트리거 설정 및 측정
inst.write(':TRIG:SOUR BUS')
inst.write(':SOUR:VOLT:STAT ON')    # 전압 출력 ON
inst.write(':INIT')
inst.write('*TRG')
inst.query('*OPC?')                 # 측정 완료 대기

# 결과 읽기
result = inst.query(':FETC?')
print(f'Volume Resistivity: {result} Ω·cm')

# 전압 OFF
inst.write(':SOUR:VOLT:STAT OFF')
inst.close()
```

---

## 9. 16008B Resistivity Cell 상세

### 9.1 사양
| 항목 | 사양 |
|:---|:---|
| 사용 장비 | Agilent 4339B |
| 전극 크기 | 26mm / 50mm / 76mm (교환식) |
| 최대 인가 전압 | 1000V DC |
| 시료 최대 두께 | 약 10mm |
| 시료 최소 크기 | 전극 외경(D3) 이상 |
| 온도 범위 | 0 ~ 40°C |
| 습도 범위 | < 80% RH (비결로) |

### 9.2 전극 교환 절차
1. 상부 전극 어셈블리의 나비 나사를 풀어 전극 분리
2. 원하는 크기의 Main Electrode + Guard Ring 장착
3. 하부 Counter Electrode도 동일 크기로 교환
4. 나비 나사로 고정

### 9.3 시료 장착 절차
1. 전극 표면을 에탄올로 세척
2. 시료를 하부 Counter Electrode 위에 올림
3. 상부 어셈블리를 내려 시료 위에 밀착
4. 덮개를 완전히 닫음 (인터락 확인)
5. 시료 두께를 마이크로미터로 측정하여 기록

### 9.4 측정 모드 전환
- **체적 저항 모드**: 기본 연결 상태 (Main → HI, Counter → LO)
- **표면 저항 모드**: 16008B 전면의 스위치를 `SURFACE` 위치로 전환

---

## 10. 에러 코드
| 코드 | 메시지 | 원인 |
|:---|:---|:---|
| 0 | No error | 정상 |
| -100 | Command error | 잘못된 SCPI 커맨드 |
| -200 | Execution error | 실행 불가 (인터락 열림 등) |
| -300 | Device-specific error | 장비 하드웨어 이슈 |
| -400 | Query error | 쿼리 미응답 |
| +1 | Interlock open | 인터락 열림 → 전압 출력 불가 |

---

## 11. 참고 문서 링크
- [4339B Instruction Manual (287p)](https://agilent-technologies.manymanuals.com/multimeters/4339b/instruction-manual-36152)
- [16008B Operation Manual](https://www.manualzz.com/doc/62088159/keysight-16008b-resistivity-cell-operation-and-service-manual)
- [Keysight 4339B 공식 지원](https://www.keysight.com/us/en/support/4339B/high-resistance-meter.html)
