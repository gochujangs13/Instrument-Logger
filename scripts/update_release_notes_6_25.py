# -*- coding: utf-8 -*-
import json
import ssl
import urllib.request
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import updater_backend

TAG = "v1.0.0-rc.6.25"

BODY = """## 3M Instrument Logger v1.0.0-rc.6.25

### 1. Keithley 2700 측정 속도(FAST / MED / SLOW) 설정 교정 및 폴링 충돌 방지
- **공식 규격 NPLC 교정**: FAST(0.1 NPLC), MED(1 NPLC), SLOW(5 NPLC)로 매핑 교정하여 장비 전면 패널의 FAST/MED/SLOW 인디케이터가 즉시 정확히 점등되도록 수정 (기존 'MIN'으로 인한 파라미터 에러 및 LED 미점등 문제 해결)
- **폴링 충돌 방지**: 속도 및 와이어 모드 변경 시 `:READ?` 폴링을 일시 중지하고 120ms 안정화 후 재개하여 SCPI `-410 Query INTERRUPTED` 충돌 방지
- **루트 콜론 부여**: 모든 설정 명령에 선두 루트 콜론(`:SENS:...`) 및 작은따옴표(`'FRES'`) 적용

### 2. Keithley 2700 미세 저항 지수 왜곡 표기 버그 수정 (소수점 5자리 고정 표기)
- **지수 표기 제거**: 4선식 측정 시 리드선 접촉이나 미세 열기전력으로 0.001 Ω 미만(-0.0003 Ω 등)이 측정될 때 `-3.00e-4`처럼 "몇의 몇 승" 형태로 강제 왜곡 표시되던 `fmt()` 버그 해결
- 계측기 전면 패널(6.5 Digit)과 100% 일치하도록 `-0.00xxx Ω` 소수점 5자리 고정 소수점(`toFixed(5)`) 표기 적용
- **`:FORM:ELEM READ` 적용**: `*RST` 후 기본값으로 유입되던 타임스탬프/상태 워드/샘플 번호를 원천 차단하고 순수 측정값 1개만 수신하도록 초기화 시퀀스 고정
- **SYSTEM LOG 피드백**: 장비가 보낸 원시 응답과 화면 표시값을 SYSTEM LOG에 즉시 출력하여 실시간 대조 지원

### 3. 작업표시줄 최소화 없이 즉시 화면에 팝업되는 ContentRendered 엔진 탑재
- `Add_ContentRendered` 및 `Dispatcher.BeginInvoke` 비동기 분리로 업데이트 창이 작업표시줄에만 머물지 않고 화면 맨 앞에 즉시 팝업
- 창 활성화 속성(`ShowActivated=True`, `WindowState=Normal`) 및 탐색기 독립 셸 기동(`explorer.exe`) 유지
"""

def main():
    cfg = updater_backend.load_config()
    repo, token = cfg["repo"], cfg["token"]
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "3M-Release-Uploader",
    }

    ctx = ssl._create_unverified_context()

    # 1. 릴리즈 조회
    list_req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases?per_page=100", headers=headers
    )
    releases = json.loads(urllib.request.urlopen(list_req, context=ctx).read().decode("utf-8"))
    target = next((rel for rel in releases if rel["tag_name"] == TAG), None)

    if not target:
        raise RuntimeError(f"GitHub release {TAG} not found!")

    rel_id = target["id"]
    print(f"Target release ID: {rel_id}")

    patch_payload = json.dumps({
        "name": f"3M Instrument Logger {TAG}",
        "body": BODY,
        "draft": False,
        "prerelease": False,
        "make_latest": "true"
    }, ensure_ascii=False).encode("utf-8")

    patch_req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/releases/{rel_id}",
        data=patch_payload,
        headers={**headers, "Content-Type": "application/json; charset=utf-8"},
        method="PATCH"
    )
    urllib.request.urlopen(patch_req, context=ctx)
    print("[SUCCESS] Release notes updated cleanly!")

if __name__ == "__main__":
    main()
