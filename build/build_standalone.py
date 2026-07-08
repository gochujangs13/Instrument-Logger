"""
build_standalone.py — 특정 계측기만 포함한 standalone 배포 폴더를 생성합니다.

사용법:
  python build/build_standalone.py <계측기이름> [<계측기이름2> ...]

예시:
  python build/build_standalone.py SP2100          # 단일 계측기
  python build/build_standalone.py SP2100 Keithley2700  # 런처 포함 2개

결과:
  dist/<이름>/         ← 모든 필요 파일이 복사된 배포 폴더
    index.html         (standalone.html 복사)
    index.css
    core.js
    standalone_entry.js  (자동 생성)
    instruments/       (선택한 계측기 파일만)
    instruments/_utils.js

이 폴더를 pywebview exe로 패키징하려면:
  python build/package_exe.py dist/<이름>
"""
import sys
import os
import shutil
import re

# ── 계측기명 → JS 파일 매핑 ──────────────────────────────────────────────────
# instruments/ 디렉터리에 있는 .js 파일 + 하위 디렉터리 모두 포함할 필요 없이
# 각 계측기 모듈이 import하는 파일만 복사하면 됨.
# 아래 맵은 계측기 display name → (import alias, js 파일 경로) 매핑.
INSTRUMENT_MAP = {
    'Hioki3540':      ('Hioki3540',     'instruments/hioki_3540.js'),
    'Keithley2700':   ('Keithley2700',  'instruments/keithley_2700.js'),
    'MitutoyoVL50':   ('MitutoyoVL50',  'instruments/mitutoyo_vl50.js'),
    'Agilent4339B':   ('Agilent4339B',  'instruments/agilent_4339b.js'),
    'DAQ6510':        ('DAQ6510',       'instruments/daq_6510.js'),
    'SP2100':         ('SP2100',        'instruments/sp2100_logger.js'),
    'PT2000':         ('PT2000',        'instruments/pt2000_probe_tack.js'),
    'LT1000':         ('LT1000',        'instruments/lt1000_loop_tack.js'),
    'AIPhotoEditor':  ('AIPhotoEditor', 'instruments/photo_editor.js'),
    'PST3202':        ('PST3202',       'instruments/pst3202.js'),
    'ClubExpense':    ('ClubExpense',   'instruments/club_expense.js'),
}

# ── 공통 파일 (항상 복사) ──────────────────────────────────────────────────
COMMON_FILES = [
    'core.js',
    'index.css',
    'instruments/_utils.js',
]


def collect_instrument_deps(js_path: str, root: str) -> list[str]:
    """계측기 JS 파일이 import하는 로컬 파일 목록을 재귀 수집합니다."""
    found = []
    full = os.path.join(root, js_path)
    if not os.path.exists(full):
        return found
    found.append(js_path)
    try:
        src = open(full, encoding='utf-8').read()
    except Exception:
        return found
    for m in re.finditer(r"from\s+'([^']+)'", src):
        dep = m.group(1)
        if dep.startswith('./') or dep.startswith('../'):
            dep_path = os.path.normpath(
                os.path.join(os.path.dirname(js_path), dep)
            ).replace('\\', '/')
            if dep_path not in found:
                found += collect_instrument_deps(dep_path, root)
    return found


def make_standalone_entry(names: list[str]) -> str:
    """standalone_entry.js 내용을 생성합니다."""
    lines = []

    # 1) imports
    for n in names:
        alias, path = INSTRUMENT_MAP[n]
        lines.append(f"import {alias} from './{path}';")
    lines.append("import { App } from './core.js';")
    lines.append("")

    # 2) registry
    lines.append("const INSTRUMENTS = {};")
    arr = ', '.join(INSTRUMENT_MAP[n][0] for n in names)
    lines.append(f"[{arr}].forEach(m => {{ INSTRUMENTS[m.name] = m; }});")
    lines.append("")

    # 3) 앱 초기화 — try-catch로 감싸 오류 시 화면에 표시
    lines.append("try {")
    if len(names) == 1:
        alias = INSTRUMENT_MAP[names[0]][0]
        lines.append("  // 단일 계측기: 런처 없이 바로 실행")
        lines.append(f"  window.app = new App(INSTRUMENTS);")
        lines.append(f"  app.launchInstrument({alias}.name);")
    else:
        lines.append("  // 2개 이상 계측기: 런처 화면으로 시작")
        lines.append("  window.app = new App(INSTRUMENTS);")
    lines.append("} catch (_initErr) {")
    lines.append("  document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;font-family:sans-serif;background:#1a1a1a;color:#e55;margin:0';")
    lines.append("  document.body.innerHTML = '<h2>⚠ 앱 초기화 오류</h2><pre style=\"font-size:12px;color:#ccc;max-width:80%;white-space:pre-wrap\">' + (_initErr.stack || _initErr.message) + '</pre><p style=\"color:#888\">개발자에게 위 오류 내용을 전달해 주세요.</p>';")
    lines.append("  throw _initErr;")
    lines.append("}")
    lines.append("")
    lines.append("window.addEventListener('resize', () => {")
    lines.append("  if (app.instr?.viewType === 'grid') app._redrawChart();")
    lines.append("});")
    lines.append("")
    lines.append("(function () {")
    lines.append("  const REF_W = 1600, MIN_Z = 0.6, MAX_Z = 1.6;")
    lines.append("  function apply() {")
    lines.append("    const zoom = Math.max(MIN_Z, Math.min(MAX_Z, window.innerWidth / REF_W));")
    lines.append("    document.documentElement.style.zoom = zoom;")
    lines.append("  }")
    lines.append("  apply();")
    lines.append("  window.addEventListener('resize', apply);")
    lines.append("})();")

    return '\n'.join(lines) + '\n'


def build(names: list[str], root: str):
    dist_name = '_'.join(names)
    dist_dir  = os.path.join(root, 'dist', dist_name)
    os.makedirs(dist_dir, exist_ok=True)
    print(f"[build] 출력 폴더: {dist_dir}")

    # ── 공통 파일 복사 ─────────────────────────────────────────────────────
    for f in COMMON_FILES:
        src = os.path.join(root, f)
        dst = os.path.join(dist_dir, f)
        if os.path.exists(src):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            print(f"  복사: {f}")
        else:
            print(f"  [WARN] 없음: {f}")

    # ── assets 디렉터리 내 모든 파일 복사 ─────────────────────────────────────────
    assets_src = os.path.join(root, 'assets')
    assets_dst = os.path.join(dist_dir, 'assets')
    if os.path.exists(assets_src):
        os.makedirs(assets_dst, exist_ok=True)
        for filename in os.listdir(assets_src):
            src_file = os.path.join(assets_src, filename)
            dst_file = os.path.join(assets_dst, filename)
            if os.path.isfile(src_file):
                shutil.copy2(src_file, dst_file)
                print(f"  복사: assets/{filename}")

    # standalone.html → dist/index.html
    src_html = os.path.join(root, 'standalone.html')
    dst_html = os.path.join(dist_dir, 'index.html')
    shutil.copy2(src_html, dst_html)
    print("  복사: standalone.html → index.html")

    # ── 계측기 파일 + 의존성 복사 ─────────────────────────────────────────
    all_deps = set(COMMON_FILES)
    for n in names:
        _, js_path = INSTRUMENT_MAP[n]
        deps = collect_instrument_deps(js_path, root)
        for dep in deps:
            if dep not in all_deps:
                src = os.path.join(root, dep)
                dst = os.path.join(dist_dir, dep)
                if os.path.exists(src):
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.copy2(src, dst)
                    print(f"  복사: {dep}")
                else:
                    print(f"  [WARN] 없음: {dep}")
                all_deps.add(dep)

    # ── standalone_entry.js 생성 ─────────────────────────────────────────
    entry_js = make_standalone_entry(names)
    entry_path = os.path.join(dist_dir, 'standalone_entry.js')
    with open(entry_path, 'w', encoding='utf-8') as f:
        f.write(entry_js)
    print("  생성: standalone_entry.js")

    print(f"\n[완료] dist/{dist_name}/ 폴더 생성됨")
    print(f"       http://localhost:8000/ 로 열거나  package_exe.py  로 EXE 패키징")


if __name__ == '__main__':
    names = sys.argv[1:]
    if not names:
        print("사용법: python build/build_standalone.py <계측기명> [<계측기명2> ...]")
        print(f"사용 가능: {', '.join(INSTRUMENT_MAP)}")
        sys.exit(1)
    for n in names:
        if n not in INSTRUMENT_MAP:
            print(f"[오류] 알 수 없는 계측기: {n}")
            print(f"사용 가능: {', '.join(INSTRUMENT_MAP)}")
            sys.exit(1)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build(names, root)
