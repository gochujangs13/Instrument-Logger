# SP-2100 / TL-2200 통신·파싱 프로토콜 — 표준 참조 문서

> ⚠️ **이 문서가 SP-2100/TL-2200 관련 작업의 최종 기준(SSOT)입니다.**
> 이후 `instruments/sp2100_logger.js`를 수정할 때는 **반드시 이 문서에 명시된 파싱/판정 규칙을 그대로 따라야 하며**,
> 임의로 "숫자 N개면 측정값으로 간주" 같은 단순화를 다시 적용하지 말 것.
> 본 문서는 사용자가 제공한 **원본 standalone `index.html`** (실측 검증된 구현) + 동봉된 `MANUAL.md`을 근거로 작성됨.

---

## 1. 문제 현상

통합 프로그램(`instruments/sp2100_logger.js`)에서 SP-2100 측정 중 **테이블에 기록되는 값이 실제 측정(힘) 값과 일치하지 않음**.
예: 로그에 `SP=-2100.0 KP=2.0 Val=4.0 Avg=46.0 RMS=2020.0`이 찍히고 그대로 기록됨 — 이 숫자들은 실제 힘(g) 측정치가 아님.

## 2. 근본 원인 (Root Cause)

### 2-1. 현재 구현 (`instruments/sp2100_logger.js` `parseLine`, line 27-34)
```js
function parseLine(raw) {
  const s = (raw || '').replace(/[^\x20-\x7E]/g, ' ').trim();
  if (!s) return null;
  const nums = (s.match(/[-+]?\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length < 5) return null;
  const [spV, kpV, valV, avgV, rmsV] = nums;
  return { SP: spV, KP: kpV, VAL: valV, AVG: avgV, RMS: rmsV };
}
```
→ **수신 라인에 숫자가 5개 이상이면 무조건** 처음 5개를 `[SP,KP,VAL,AVG,RMS]`로 간주. 라인의 "종류"(측정 데이터인지 설정/핸드셰이크인지)를 전혀 구분하지 않음.

### 2-2. 원본 `index.html`의 실제 동작
SP-2100 장비는 시리얼 라인으로 **두 종류의 문자열**을 섞어서 보냄:

1. **측정 데이터 문자열** — `"PEAK"`, `"SP"`, `"KP"`, `"VAL"`, `"AVG"`, `"RMS"` 같은 **따옴표+키 라벨**을 포함한 CSV (`"KEY",value` 쌍의 나열)
2. **설정/핸드셰이크 문자열** — `"POINTS"`, `"SCALE"`, `"FACTOR"`, `"OFFSET"`, `"PEAK"`, `"SPEED"`, `"TRAVEL"`, `"T2"` 등 **장비 설정값**(파형 디코딩/시간축 계산용). 이 안에도 5개 이상의 숫자가 들어있을 수 있음.

원본 `processFrame()` (index.html line ~145-157):
```js
if($('#model').value==='SP-2100' && (/"AVG"/.test(fullText) || /"PEAK"/.test(fullText))) {
  const r = parseLine(fullText, 'SP-2100');
  if (r.ok) { ... commitMeasurement(f, r.val, r.unit||'g'); ... }
}
mergeCfg(parseConfig(prevText + fullText));   // 설정값은 별도 처리, 측정 기록에 안 들어감
```

원본 `parseLine()`의 SP-2100 분기 (index.html line ~62-72):
```js
if (/"AVG"/.test(s) || /"PEAK"/.test(s)) {
  const g = k => { const m = s.match(new RegExp('"'+k+'"\\s*,\\s*([-+]?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) : null; };
  const fields = { PEAK:g('PEAK'), SP:g('SP'), KP:g('KP'), VAL:g('VAL'), AVG:g('AVG'), RMS:g('RMS') };
  const val = (fields.AVG !== null) ? fields.AVG : fields.PEAK;
  if (val !== null) return { ok:true, val, unit:'g', fields };
}
```
→ **`"AVG"` 또는 `"PEAK"` 라벨이 문자열에 존재할 때만** 측정으로 인정하고, 각 필드를 **라벨 이름으로** 직접 추출 (`"AVG",46.0` → AVG=46.0). 위치(순서)가 아니라 **이름**으로 매칭하므로 설정 라인의 숫자와 절대 섞이지 않음.

TL-2200 분기는 더 엄격함 (index.html line ~58-61):
```js
const m = s.match(/^\d+,[^,]*,[^,]*,[^,]*,TL-22[O0]+,[^,]*,([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),([-+]?\d*\.?\d+),/i);
```
→ 라인에 리터럴 `TL-22O0` / `TL-2200` 토큰이 포함된 정확한 포맷일 때만 매칭.

### 2-3. 결론
현재 통합 모듈은 **"숫자 5개 이상이면 측정값"**이라는 너무 느슨한 규칙을 쓰고 있어서, 장비가 보내는 **설정/핸드셰이크 문자열**(POINTS/SCALE/OFFSET/PEAK/SPEED/TRAVEL/T2 등 5개 이상 숫자 포함 가능)을 측정값으로 오인·기록함. → **이것이 "기록값 ≠ 실제 측정값"의 직접적 원인.**

---

## 3. 표준 파싱 규칙 (향후 코드 수정 시 반드시 준수)

### 3-1. SP-2100 모드
- 수신 문자열에 **`"AVG"` 또는 `"PEAK"` 리터럴 라벨이 포함된 경우에만** 측정 데이터로 처리
- 각 필드는 **라벨 이름 기반 정규식**으로 추출: `"KEY"\s*,\s*([-+]?\d*\.?\d+)` (KEY ∈ PEAK, SP, KP, VAL, AVG, RMS)
- `Val`(기록값) = `AVG`가 있으면 `AVG`, 없으면 `PEAK` (원본 `const val=(fields.AVG!==null)?fields.AVG:fields.PEAK;`)
- 라벨이 없는 문자열(POINTS/SCALE/FACTOR/OFFSET/SPEED/TRAVEL/T2 등) → **측정 기록에 추가 금지**. 필요하면 파형/시간축 계산용 설정값으로만 별도 보관(`parseConfig` 상당 로직).

### 3-2. TL-2200 모드
- 라인에 `TL-2200` (또는 OCR 오인식 대비 `TL-22[O0]+`) 토큰이 포함된 정확한 CSV 포맷일 때만 매칭:
  `^\d+,[^,]*,[^,]*,[^,]*,TL-22[O0]+,[^,]*,(SP),(KP),(VAL),(AVG),(RMS),`
- 5개 캡처그룹 순서 = `SP, KP, VAL, AVG, RMS` (MANUAL.md §1과 일치)
- 이 토큰이 없는 라인은 무시.

### 3-3. 공통 (MANUAL.md 규칙, 변경 금지)
- §2: 장비가 보내는 N값은 무시하고, 소프트웨어 내부에서 1부터 증가하는 카운터를 사용 (현재 `S.nCounter` 로직은 올바름 — 유지)
- §3: 모든 표시값(Val/SP/Avg/KP/RMS)은 화면/CSV 모두 **소수점 1자리 반올림** (`fmt1`, 현재 구현 유지)
- §4: 체크된 행이 1개일 때 새 측정값은 그 행을 덮어쓰기 (현재 `commitMeasurement`의 overwrite 로직 유지)
- §5: SP-2100 기본 baudrate 38400(TL-2200 기준) — 단, 모델 드롭다운에서 SP-2100 선택 시 57600 (현재 `get serial()` 로직 유지)
- 측정 AVG 값은 우측 통계(Box/Whisker) 그래프로 표시한다.
- TL-2200 ASCII Delta 파형과 SP-2100 디코더가 유효한 `{force[], time[]}`를 반환한 경우 중앙 힘-시간 파형도 표시한다.
- 파형 화면은 마우스 드래그로 복수 구간을 누적 선택할 수 있으며, 구간별 통계와 중복 포인트를 제거한 통합 평균·최소·최대를 계산한다. 이 통계는 사용자가 `적용하기`를 눌렀을 때만 측정 행에 반영되고, 원본 장비값은 별도로 보존한다.
- SP-2100 바이너리 프레임의 물리적 변환식은 장비별 검증이 필요하므로 디코더 후보가 유효하지 않으면 파형을 측정값으로 저장하지 않는다. 검증되지 않은 바이트를 임의 ADC 데이터로 취급하지 않는다.

---

## 4. 초기 구현 계획 (2026-06-11 기록)

`instruments/sp2100_logger.js`의 `parseLine()` / `onLine()`을 위 §3-1, §3-2 규칙대로 재작성 필요:
- SP-2100: `"AVG"`/`"PEAK"` 라벨 검사 + 라벨별 정규식 추출로 교체
- TL-2200: `TL-22[O0]+` 토큰 포함 여부 검사 추가
- 라벨/토큰 불일치 라인은 `onLine`에서 조용히 무시 (return, 기록 안 함)

위 문장은 초기 참조 문서 작성 당시의 계획이다. 현재 구현에는 라벨 기반 요약 파싱,
TL-2200 토큰 기반 파싱, 유효 파형 디코더 결과의 힘-시간 표시, 복수 구간 통계 UI가
반영되어 있다. 통신 파서 규칙 자체는 아래 §3-1/§3-2를 계속 SSOT로 사용한다.
