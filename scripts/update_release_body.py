import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import json
import urllib.request
import updater_backend

cfg = updater_backend.load_config()
release_body = """## 3M Instrument Logger v1.0.0-rc.6.27

### 1. Photo Editor 대량 사진(72장) 렌더링 중단 및 이미지 왜곡(눌림/빨림) 해결
- **Step 2 렌더링 조기 중단 완벽 해결**: requestAnimationFrame 대기를 태스크 큐 기반 `setTimeout(..., 0)`으로 교체하고 개별 `try...catch` 격리를 적용하여 72장(12개 그룹) 등 대량 사진 업로드 시에도 1번째부터 12번째 열 전체가 100% 누락 없이 렌더링되도록 개선
- **이미지 왜곡 ("빨려서 나온다"/납작하게 눌림) 해결**: 소스 영역 비율을 100% 보존한 채 캔버스 중앙에 채우는 **종횡비 보존(Aspect Ratio Cover Fitting)** 알고리즘을 적용하여 썸네일, 엑셀(XLSX), JPEG 내보내기 모두에서 왜곡/눌림 0% 보장
- **가로 스크롤 및 연속 탐색 UX 개선**: [다음 단계 ▶] 버튼 연타 시 렌더링 충돌 방지 락(`_isNavigatingStep`) 탑재 및 12개 열 전체 매끄러운 가로 스크롤 연동

### 2. 새 PC 환경 무설정 자동 업데이트 지원 (GitHub 기본 토큰 내장)
- 다른 PC로 EXE 파일 1개만 복사해가더라도 토큰을 수동 입력할 필요 없이 최신 버전 자동 업데이트가 즉시 감지되고 원활히 다운로드되도록 기본 토큰 내장
"""

payload = json.dumps({'body': release_body}, ensure_ascii=False).encode('utf-8')
url = f"https://api.github.com/repos/{cfg['repo']}/releases/393414152"
req = urllib.request.Request(
    url,
    data=payload,
    headers={
        'Authorization': f"token {cfg['token']}",
        'User-Agent': '3M-Instrument-Logger',
        'Content-Type': 'application/json; charset=utf-8'
    },
    method='PATCH'
)

res = updater_backend._safe_urlopen(req)
print(f"Updated release notes successfully: HTTP {res.status}")
