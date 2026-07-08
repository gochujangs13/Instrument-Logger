"""
package_exe.py — dist/<폴더>를 pywebview + PyInstaller로 EXE 파일로 패키징합니다.

사전 준비:
  pip install pywebview pyinstaller

사용법:
  python build/package_exe.py dist/<폴더이름>

예시:
  python build/package_exe.py dist/SP2100
  python build/package_exe.py dist/SP2100_Keithley2700

결과:
  dist/3M_Instrument_Logger.exe   ← 단독 실행 파일
  (pyinstaller 임시 파일은 build_tmp/ 에 생성됨)

동작 방식:
  - dist/<폴더> 안의 파일 전체를 PyInstaller 데이터로 묶음
  - 내장 Python HTTP 서버(http.server)로 localhost:임의포트 에 파일 제공
  - pywebview 창으로 브라우저 없이 index.html 실행
  - localStorage는 %APPDATA%/3M_Instrument_Logger/app_storage.json 에 영구 저장
  - 창 닫으면 HTTP 서버도 종료
"""
import sys
import os
import subprocess
import textwrap

# localStorage를 파일로 영구 저장하는 JS 폴리필
# 인라인 데이터 삽입 대신 동기 XHR로 /api/storage/data 에서 데이터를 받아옴
# (app_storage.json이 사진 데이터 등으로 수십 KB가 되면 인라인 삽입 시
#  Qt WebEngine이 파싱에 실패하여 카드가 표시되지 않는 문제 방지)
_POLYFILL_TEMPLATE = (
    '<script>'
    'window.__EXE_MODE=true;'   # EXE 모드 플래그 — 다운로드 인터셉터가 참조
    '(function(){'
    'var _x=new XMLHttpRequest();'
    '_x.open("GET","/api/storage/data",false);'
    'try{_x.send();}catch(_e){}'
    'var d={};try{if(_x.status===200&&_x.responseText){d=JSON.parse(_x.responseText);}}catch(_e2){}'
    'function _post(u,b){fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).catch(()=>{});}'
    'Object.defineProperty(window,"localStorage",{configurable:true,get:()=>({'
    'getItem:k=>k in d?d[k]:null,'
    'setItem:(k,v)=>{d[k]=String(v);_post("/api/storage/set",{key:k,value:String(v)});},'
    'removeItem:k=>{delete d[k];_post("/api/storage/remove",{key:k});},'
    'clear:()=>{for(const k in d)delete d[k];_post("/api/storage/clear",{});},'
    'key:i=>Object.keys(d)[i]||null,'
    'get length(){return Object.keys(d).length;}'
    '})});'
    '})();'
    '</script>'
)


def _validate_dist(dist_dir: str):
    """빌드 전 core.js 핵심 클래스 존재 여부를 검증합니다."""
    core_path = os.path.join(dist_dir, 'core.js')
    if not os.path.exists(core_path):
        raise RuntimeError(f'[검증 실패] core.js 없음: {core_path}')
    content = open(core_path, encoding='utf-8').read()
    required = ['class BoxPlot', 'class EditableGrid', 'class StateMachine', 'class App']
    missing = [r for r in required if r not in content]
    if missing:
        raise RuntimeError(
            f'[검증 실패] core.js에서 다음 클래스가 누락되었습니다:\n  ' +
            '\n  '.join(missing) +
            '\n\ncore.js가 손상되었을 수 있습니다. 소스 파일을 확인하세요.'
        )
    print('[검증] core.js 핵심 클래스 확인 완료 OK')


def package(dist_dir: str):
    dist_dir  = os.path.abspath(dist_dir)
    app_name  = os.path.basename(dist_dir)
    root      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build_tmp = os.path.join(root, 'build_tmp')
    os.makedirs(build_tmp, exist_ok=True)

    # ── 빌드 전 검증 ────────────────────────────────────────────────────────
    _validate_dist(dist_dir)

    polyfill_repr = repr(_POLYFILL_TEMPLATE)

    # ── launcher.py 생성 ─────────────────────────────────────────────────────
    launcher_src = textwrap.dedent(f"""\
        import sys, os, threading, socket, webview, json
        from http.server import HTTPServer, SimpleHTTPRequestHandler

        BASE    = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        APP_DIR = os.path.join(BASE, '{app_name}')

        def find_free_port():
            with socket.socket() as s:
                s.bind(('127.0.0.1', 0))
                return s.getsockname()[1]

        # ── 영구 스토리지 (%APPDATA%/3M_Instrument_Logger/app_storage.json) ──
        _storage_path = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), '3M_Instrument_Logger')
        os.makedirs(_storage_path, exist_ok=True)
        _STORAGE_FILE = os.path.join(_storage_path, 'app_storage.json')
        _storage_lock = threading.Lock()
        _storage = {{}}
        if os.path.exists(_STORAGE_FILE):
            try:
                with open(_STORAGE_FILE, 'r', encoding='utf-8') as _f:
                    _storage = json.load(_f)
            except Exception:
                _storage = {{}}

        def _save_storage():
            try:
                with open(_STORAGE_FILE, 'w', encoding='utf-8') as _f:
                    json.dump(_storage, _f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        _POLYFILL_TEMPLATE = {polyfill_repr}

        # ── VISA ─────────────────────────────────────────────────────────────
        VISA_RM  = None
        VISA_DEV = None

        def get_visa_rm():
            global VISA_RM
            if VISA_RM is None:
                import pyvisa
                try:
                    VISA_RM = pyvisa.ResourceManager()
                except Exception as e:
                    try:
                        VISA_RM = pyvisa.ResourceManager('@py')
                    except:
                        raise e
            return VISA_RM

        # ── HTTP Handler ──────────────────────────────────────────────────────
        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=APP_DIR, **kw)
            def log_message(self, *a): pass

            def guess_type(self, path):
                # PyInstaller 번들 환경에서는 레지스트리 MIME 조회가 불가능해
                # .js 파일이 application/octet-stream으로 서빙될 수 있음.
                # Chromium은 잘못된 MIME의 ES 모듈을 조용히 거부하므로 명시적으로 지정.
                ext = os.path.splitext(path)[-1].lower()
                if ext in ('.js', '.mjs'): return 'application/javascript'
                if ext == '.css': return 'text/css'
                if ext in ('.html', '.htm'): return 'text/html; charset=utf-8'
                if ext == '.json': return 'application/json'
                if ext in ('.jpg', '.jpeg'): return 'image/jpeg'
                if ext == '.png': return 'image/png'
                if ext == '.svg': return 'image/svg+xml'
                if ext == '.woff2': return 'font/woff2'
                if ext == '.woff': return 'font/woff'
                return super().guess_type(path)

            def _send_json(self, data):
                body = json.dumps(data).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_OPTIONS(self):
                self.send_response(204)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.end_headers()

            def do_GET(self):
                # index.html 요청 시 localStorage 폴리필 주입 (데이터는 /api/storage/data 로 별도 요청)
                if self.path in ('/', '/index.html'):
                    try:
                        with open(os.path.join(APP_DIR, 'index.html'), 'r', encoding='utf-8') as _f:
                            html = _f.read()
                        html = html.replace('<head>', '<head>' + _POLYFILL_TEMPLATE, 1)
                        body = html.encode('utf-8')
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/html; charset=utf-8')
                        self.send_header('Content-Length', str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                    except Exception as e:
                        self.send_error(500, str(e))
                    return

                # localStorage 데이터 — 폴리필이 동기 XHR로 이 엔드포인트를 요청
                if self.path == '/api/storage/data':
                    try:
                        with _storage_lock:
                            js_data = json.dumps(_storage)
                        body = js_data.encode('utf-8')
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json; charset=utf-8')
                        self.send_header('Content-Length', str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                    except Exception as e:
                        self.send_error(500, str(e))
                    return

                if self.path == '/api/visa/list':
                    try:
                        rm  = get_visa_rm()
                        res = list(rm.list_resources())
                        self._send_json({{'success': True, 'resources': res}})
                    except Exception as e:
                        err = str(e)
                        if 'Could not locate VISA library' in err:
                            err = 'NI-VISA 드라이버를 찾을 수 없습니다. NI-VISA 또는 Keysight Connection Expert를 설치해 주세요.'
                        self._send_json({{'success': False, 'error': err}})
                    return

                # ── PST-3202 평가 기록 (EXE 옆에 PST3202_eval_data.json 으로 저장) ──
                elif self.path == '/api/evaldata':
                    try:
                        eval_path = os.path.join(os.path.dirname(sys.executable), 'PST3202_eval_data.json')
                        if os.path.exists(eval_path):
                            with open(eval_path, 'r', encoding='utf-8') as _f:
                                raw = _f.read()
                        else:
                            raw = '[]'
                        body = raw.encode('utf-8')
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json; charset=utf-8')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Content-Length', str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                else:
                    super().do_GET()

            def do_POST(self):
                global VISA_DEV

                # ── 스토리지 API ──────────────────────────────────────────────
                if self.path == '/api/storage/set':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        with _storage_lock:
                            _storage[body['key']] = body['value']
                            _save_storage()
                    except Exception:
                        pass
                    self._send_json({{'ok': True}})
                    return

                elif self.path == '/api/storage/remove':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        with _storage_lock:
                            _storage.pop(body.get('key', ''), None)
                            _save_storage()
                    except Exception:
                        pass
                    self._send_json({{'ok': True}})
                    return

                elif self.path == '/api/storage/clear':
                    with _storage_lock:
                        _storage.clear()
                        _save_storage()
                    self._send_json({{'ok': True}})
                    return

                # ── VISA API ──────────────────────────────────────────────────
                elif self.path == '/api/visa/connect':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        addr   = body.get('address', '')
                        rm     = get_visa_rm()
                        if VISA_DEV:
                            try: VISA_DEV.close()
                            except: pass
                        VISA_DEV = rm.open_resource(addr)
                        if addr.upper().startswith('ASRL') or 'COM' in addr.upper():
                            VISA_DEV.baud_rate       = 9600
                            VISA_DEV.read_termination = '\\r'
                        else:
                            VISA_DEV.timeout = 5000
                        self._send_json({{'success': True}})
                    except Exception as e:
                        self._send_json({{'success': False, 'error': str(e)}})

                elif self.path == '/api/visa/disconnect':
                    try:
                        if VISA_DEV:
                            VISA_DEV.close()
                            VISA_DEV = None
                        self._send_json({{'success': True}})
                    except Exception as e:
                        self._send_json({{'success': False, 'error': str(e)}})

                elif self.path == '/api/visa/write':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        cmd    = body.get('cmd', '')
                        if not VISA_DEV:
                            raise Exception('Not connected to any VISA device.')
                        VISA_DEV.write(cmd)
                        self._send_json({{'success': True}})
                    except Exception as e:
                        self._send_json({{'success': False, 'error': str(e)}})

                elif self.path == '/api/visa/query':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        cmd    = body.get('cmd', '')
                        if not VISA_DEV:
                            raise Exception('Not connected to any VISA device.')
                        resp = VISA_DEV.query(cmd)
                        self._send_json({{'success': True, 'response': resp}})
                    except Exception as e:
                        self._send_json({{'success': False, 'error': str(e)}})

                # ── PST-3202 평가 기록 저장 (EXE 옆에 PST3202_eval_data.json 으로 저장) ──
                elif self.path == '/api/evaldata':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        raw = self.rfile.read(length)
                        json.loads(raw.decode('utf-8'))  # JSON 유효성 검증
                        eval_path = os.path.join(os.path.dirname(sys.executable), 'PST3202_eval_data.json')
                        tmp = eval_path + '.tmp'
                        with open(tmp, 'wb') as _f:
                            _f.write(raw)
                        os.replace(tmp, eval_path)
                        self._send_json({{'ok': True}})
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                # ── PST-3202 엑셀(Raw Data) 저장 (EXE 옆에 저장) ────────────────
                elif self.path == '/api/export':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        raw = self.rfile.read(length)
                        filename = os.path.basename(self.headers.get('X-Filename', 'export.xlsx')) or 'export.xlsx'
                        save_path = os.path.join(os.path.dirname(sys.executable), filename)
                        with open(save_path, 'wb') as _f:
                            _f.write(raw)
                        self._send_json({{'ok': True, 'path': save_path}})
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                # ── 파일 저장 API (EXE 옆에 저장) ───────────────────────────
                elif self.path == '/api/save-file':
                    try:
                        import base64
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        filename = body.get('filename', 'export')
                        data = base64.b64decode(body['data'])
                        # EXE 위치 (frozen) 또는 스크립트 위치 (개발)
                        if getattr(sys, 'frozen', False):
                            save_dir = os.path.dirname(sys.executable)
                        else:
                            save_dir = os.path.dirname(os.path.abspath(__file__))
                        save_path = os.path.join(save_dir, filename)
                        with open(save_path, 'wb') as _f:
                            _f.write(data)
                        self._send_json({{'ok': True, 'path': save_path}})
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                else:
                    super().do_POST()

        # ── 서버 / 창 시작 ────────────────────────────────────────────────────
        port   = find_free_port()
        server = HTTPServer(('127.0.0.1', port), Handler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()

        window = webview.create_window(
            '3M Instrument Logger',
            f'http://127.0.0.1:{{port}}/index.html',
            width=1600, height=900, resizable=True,
        )
        webview.start()

        if VISA_DEV:
            try: VISA_DEV.close()
            except: pass
        server.shutdown()
    """)

    launcher_path = os.path.join(build_tmp, f'{app_name}_launcher.py')
    with open(launcher_path, 'w', encoding='utf-8') as f:
        f.write(launcher_src)
    print(f"[build] launcher: {launcher_path}")

    # ── PyInstaller 실행 ──────────────────────────────────────────────────────
    exe_name = '3M_Instrument_Logger'
    out_dir  = os.path.join(root, 'dist')
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onefile',
        '--windowed',
        '--hidden-import=pyvisa',
        f'--name={exe_name}',
        f'--add-data={dist_dir}{os.pathsep}{app_name}',
        f'--distpath={out_dir}',
        f'--workpath={build_tmp}',
        f'--specpath={build_tmp}',
        '--noconfirm',
        launcher_path,
    ]
    print(f"[build] PyInstaller 실행 중...")
    print("  " + " ".join(cmd))
    result = subprocess.run(cmd, cwd=root)
    if result.returncode != 0:
        print("[오류] PyInstaller 실패. pip install pywebview pyinstaller 확인")
        sys.exit(1)

    exe_path = os.path.join(out_dir, exe_name + ('.exe' if sys.platform == 'win32' else ''))
    if os.path.exists(exe_path):
        print(f"\n[완료] EXE 생성됨: {exe_path}")
    else:
        print(f"\n[경고] EXE 파일을 찾을 수 없음: {exe_path}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("사용법: python build/package_exe.py dist/<폴더이름>")
        sys.exit(1)
    package(sys.argv[1])
