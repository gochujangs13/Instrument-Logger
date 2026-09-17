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
  dist/3M_Instrument_Logger.exe   ← 항상 같은 이름의 단독 실행 파일 1개
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
import json
import shutil
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
    'function _post(u,b){try{fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).catch(function(){});}catch(_pe){}}'
    'try{'
    'Object.defineProperty(window,"localStorage",{configurable:true,get:function(){return {'
    'getItem:function(k){return k in d?d[k]:null;},'
    'setItem:function(k,v){d[k]=String(v);_post("/api/storage/set",{key:k,value:String(v)});},'
    'removeItem:function(k){delete d[k];_post("/api/storage/remove",{key:k});},'
    'clear:function(){for(var k in d)delete d[k];_post("/api/storage/clear",{});},'
    'key:function(i){return Object.keys(d)[i]||null;},'
    'get length(){return Object.keys(d).length;}'
    '};}});'
    '}catch(_dfErr){}'
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


def _load_release(dist_dir: str) -> dict:
    version_path = os.path.join(dist_dir, 'version.json')
    if not os.path.exists(version_path):
        raise RuntimeError(f'[검증 실패] version.json 없음: {version_path}')
    with open(version_path, encoding='utf-8') as handle:
        release = json.load(handle)
    for key in ('version', 'fileVersion'):
        if not release.get(key):
            raise RuntimeError(f'[검증 실패] version.json에 {key} 값이 없습니다.')
    return release


def _remove_other_release_exes(out_dir: str, keep_path: str) -> list[str]:
    """성공한 새 빌드를 남기고 이전 통합 EXE만 정리합니다."""
    keep_path = os.path.abspath(keep_path)
    removed = []
    if not os.path.isdir(out_dir):
        return removed
    for name in os.listdir(out_dir):
        lower = name.lower()
        if not lower.endswith('.exe'):
            continue
        if name != '3M_Instrument_Logger.exe' and not name.startswith('3M_Instrument_Logger_v'):
            continue
        candidate = os.path.abspath(os.path.join(out_dir, name))
        if candidate == keep_path:
            continue
        os.remove(candidate)
        removed.append(candidate)
    return removed


def _write_windows_version_file(build_tmp: str, release: dict) -> str:
    try:
        parts = [int(part) for part in release['fileVersion'].split('.')]
    except (TypeError, ValueError) as error:
        raise RuntimeError('[검증 실패] fileVersion은 숫자 형식이어야 합니다.') from error
    if len(parts) != 4:
        raise RuntimeError('[검증 실패] fileVersion은 숫자 4자리 형식이어야 합니다. 예: 1.0.0.1')
    numeric_version = ', '.join(str(part) for part in parts)
    original_filename = '3M_Instrument_Logger.exe'
    version_info = textwrap.dedent(f"""\
        VSVersionInfo(
          ffi=FixedFileInfo(
            filevers=({numeric_version}),
            prodvers=({numeric_version}),
            mask=0x3f,
            flags=0x0,
            OS=0x40004,
            fileType=0x1,
            subtype=0x0,
            date=(0, 0)
          ),
          kids=[
            StringFileInfo([
              StringTable(
                u'040904B0',
                [
                  StringStruct(u'CompanyName', u'3M'),
                  StringStruct(u'FileDescription', u'3M Instrument Logger'),
                  StringStruct(u'FileVersion', u'{release["fileVersion"]}'),
                  StringStruct(u'InternalName', u'3M_Instrument_Logger'),
                  StringStruct(u'OriginalFilename', u'{original_filename}'),
                  StringStruct(u'ProductName', u'3M Instrument Logger'),
                  StringStruct(u'ProductVersion', u'{release["version"]}')
                ]
              )
            ]),
            VarFileInfo([VarStruct(u'Translation', [1033, 1200])])
          ]
        )
    """)
    version_file = os.path.join(build_tmp, '3M_Instrument_Logger_version_info.txt')
    with open(version_file, 'w', encoding='utf-8') as handle:
        handle.write(version_info)
    return version_file


def package(dist_dir: str):
    dist_dir  = os.path.abspath(dist_dir)
    app_name  = os.path.basename(dist_dir)
    # PyInstaller one-file extracts bundled data below %TEMP%\_MEI....
    # The integrated module-list folder name can exceed Windows MAX_PATH once
    # nested instrument assets are appended, so keep the archive root short.
    bundle_dir = 'app'
    root      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build_tmp = os.path.join(root, 'build_tmp')
    os.makedirs(build_tmp, exist_ok=True)

    # ── 빌드 전 검증 ────────────────────────────────────────────────────────
    _validate_dist(dist_dir)
    release = _load_release(dist_dir)
    version_file = _write_windows_version_file(build_tmp, release)
    print(f"[검증] 릴리즈 버전: v{release['version']}")

    polyfill_repr = repr(_POLYFILL_TEMPLATE)

    # ── launcher.py 생성 ─────────────────────────────────────────────────────
    launcher_src = textwrap.dedent(f"""\
        import sys, os, threading, socket, webview, json, re, time, base64, tempfile, glob, shutil, subprocess, webbrowser
        from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

        def check_and_ensure_webview2():
            if os.name != 'nt':
                return
            found = False
            try:
                import winreg
                client_keys = [
                    'SOFTWARE\\\\WOW6432Node\\\\Microsoft\\\\EdgeUpdate\\\\Clients\\\\{{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}}',
                    'SOFTWARE\\\\Microsoft\\\\EdgeUpdate\\\\Clients\\\\{{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}}',
                ]
                for root_key in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                    for sub in client_keys:
                        try:
                            with winreg.OpenKey(root_key, sub) as k:
                                val, _ = winreg.QueryValueEx(k, 'pv')
                                if val and str(val).strip() not in ('0', '0.0.0.0', ''):
                                    found = True
                                    break
                        except OSError:
                            pass
                    if found:
                        break

                if not found:
                    edge_keys = [
                        'SOFTWARE\\\\WOW6432Node\\\\Microsoft\\\\Edge\\\\BLBeacon',
                        'SOFTWARE\\\\Microsoft\\\\Edge\\\\BLBeacon',
                    ]
                    for root_key in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                        for sub in edge_keys:
                            try:
                                with winreg.OpenKey(root_key, sub) as k:
                                    val, _ = winreg.QueryValueEx(k, 'version')
                                    if val and str(val).strip():
                                        found = True
                                        break
                            except OSError:
                                pass
                        if found:
                            break
            except Exception:
                pass

            if not found:
                try:
                    import ctypes
                    MB_YESNO = 0x04
                    MB_ICONEXCLAMATION = 0x30
                    IDYES = 6
                    msg = (
                        "3M Instrument Logger를 실행하려면 'Microsoft Edge WebView2 Runtime'이 필요합니다.\\n\\n"
                        "현재 PC에는 해당 런타임이 설치되어 있지 않아 계측기 화면을 정상적으로 표시할 수 없습니다.\\n\\n"
                        "마이크로소프트 공식 WebView2 런타임 다운로드 페이지를 열어 설치하시겠습니까?"
                    )
                    title = "3M Instrument Logger — 필수 런타임 필요"
                    res = ctypes.windll.user32.MessageBoxW(0, msg, title, MB_YESNO | MB_ICONEXCLAMATION)
                    if res == IDYES:
                        webbrowser.open('https://go.microsoft.com/fwlink/p/?LinkId=2124703')
                except Exception:
                    pass
                sys.exit(1)

        check_and_ensure_webview2()

        BASE    = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        APP_DIR = os.path.join(BASE, '{bundle_dir}')

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

        def find_oda_file_converter():
            candidates = []
            configured = os.environ.get('ODA_FILE_CONVERTER', '').strip()
            if configured:
                candidates.append(configured)
            located = shutil.which('ODAFileConverter.exe') or shutil.which('ODAFileConverter')
            if located:
                candidates.append(located)
            for pattern in (
                r'C:\\Program Files\\ODA\\*File*Converter*\\ODAFileConverter.exe',
                r'C:\\Program Files\\ODA\\ODAFileConverter.exe',
                r'C:\\Program Files\\Open Design Alliance\\*File*Converter*\\ODAFileConverter.exe',
                r'C:\\Program Files (x86)\\ODA\\*File*Converter*\\ODAFileConverter.exe',
            ):
                candidates.extend(glob.glob(pattern))
            for candidate in candidates:
                if candidate and os.path.isfile(candidate):
                    return os.path.abspath(candidate)
            return None

        def convert_dxf_to_autocad2007_dwg(dxf_bytes):
            converter = find_oda_file_converter()
            if not converter:
                raise FileNotFoundError('ODA File Converter가 설치되어 있지 않습니다.')
            if not dxf_bytes or len(dxf_bytes) > 50 * 1024 * 1024:
                raise ValueError('DXF 데이터가 없거나 허용 크기를 초과했습니다.')
            with tempfile.TemporaryDirectory(prefix='3m_etch_dwg_') as temp_root:
                input_dir = os.path.join(temp_root, 'input')
                output_dir = os.path.join(temp_root, 'output')
                os.makedirs(input_dir)
                os.makedirs(output_dir)
                input_path = os.path.join(input_dir, 'Etching_ODA_Input.dxf')
                output_path = os.path.join(output_dir, 'Etching_ODA_Input.dwg')
                with open(input_path, 'wb') as handle:
                    handle.write(dxf_bytes)
                command = [converter, input_dir, output_dir, 'ACAD2007', 'DWG', '0', '1', '*.dxf']
                result = subprocess.run(command, capture_output=True, text=True, timeout=120)
                if result.returncode != 0:
                    detail = (result.stderr or result.stdout or '변환기 오류').strip()
                    raise RuntimeError(f'ODA 변환 실패(exit {{result.returncode}}): {{detail[:1000]}}')
                if not os.path.isfile(output_path):
                    matches = glob.glob(os.path.join(output_dir, '*.dwg'))
                    if len(matches) == 1:
                        output_path = matches[0]
                    else:
                        raise RuntimeError('ODA 변환 결과 DWG를 찾을 수 없습니다.')
                with open(output_path, 'rb') as handle:
                    dwg_bytes = handle.read()
                if len(dwg_bytes) < 64 or dwg_bytes[:6] != b'AC1021':
                    signature = dwg_bytes[:6].decode('ascii', errors='replace')
                    raise RuntimeError(f'AutoCAD 2007 DWG 검증 실패: {{signature!r}}')
                return dwg_bytes, converter

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

        def windows_serial_ports():
            if os.name != 'nt':
                return []
            ports = set()
            try:
                import winreg
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'HARDWARE\\DEVICEMAP\\SERIALCOMM') as key:
                    index = 0
                    while True:
                        try:
                            _, value, _ = winreg.EnumValue(key, index)
                            if re.fullmatch(r'COM\\d+', str(value), re.IGNORECASE):
                                ports.add(str(value).upper())
                            index += 1
                        except OSError:
                            break
            except OSError:
                pass
            return sorted(ports, key=lambda port: int(port[3:]))

        def serial_port_resources():
            return [
                {{'port': port, 'address': f'ASRL{{int(port[3:])}}::INSTR'}}
                for port in windows_serial_ports()
            ]

        VISA_LONG_TIMEOUT_MS = 120000
        VISA_ASRL_PROBE_TIMEOUT_MS = 2000

        def is_asrl_address(address):
            upper = str(address or '').upper()
            return upper.startswith('ASRL') or 'COM' in upper

        def configure_visa_resource(inst, address, serial_read_termination='\\r'):
            inst.timeout = VISA_LONG_TIMEOUT_MS
            if is_asrl_address(address):
                inst.baud_rate = 9600
                # Model 2400 receives commands on CR. Its configurable serial
                # reply terminator is detected separately.
                inst.read_termination = serial_read_termination
                inst.write_termination = '\\r'
            else:
                inst.read_termination = '\\n'
                inst.write_termination = '\\n'

        def open_visa_resource(resource_manager, address, asrl_termination='cr'):
            if not is_asrl_address(address) or str(asrl_termination).lower() != 'auto':
                inst = resource_manager.open_resource(address)
                configure_visa_resource(inst, address, '\\r')
                return inst, ('CR' if is_asrl_address(address) else None)

            errors = []
            for termination, label in (('\\n', 'LF'), ('\\r', 'CR')):
                inst = None
                try:
                    inst = resource_manager.open_resource(address)
                    configure_visa_resource(inst, address, termination)
                    inst.timeout = VISA_ASRL_PROBE_TIMEOUT_MS
                    # Safety contract: this must remain the first instrument
                    # command for every auto-detection candidate.
                    inst.write(':OUTP OFF')
                    time.sleep(0.25)
                    output_state = str(inst.query(':OUTP?')).strip().upper()
                    if output_state not in {{'0', '0.0', 'OFF'}}:
                        raise RuntimeError(f'OUTPUT OFF verification returned {{output_state!r}}')
                    try:
                        inst.clear()
                    except Exception:
                        pass
                    inst.timeout = VISA_LONG_TIMEOUT_MS
                    print(f'[VISA] RS-232 termination detected: {{label}}', flush=True)
                    return inst, label
                except Exception as error:
                    errors.append(f'{{label}}: {{error}}')
                    if inst is not None:
                        try:
                            inst.clear()
                        except Exception:
                            pass
                        try:
                            inst.close()
                        except Exception:
                            pass

            raise RuntimeError('RS-232 termination auto-detection failed (' + '; '.join(errors) + ')')

        # ── HTTP Handler ──────────────────────────────────────────────────────
        class CustomThreadingServer(ThreadingHTTPServer):
            request_queue_size = 128
            daemon_threads = True
            allow_reuse_address = True

        class Handler(SimpleHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
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

            def _send_json(self, data, code=200):
                body = json.dumps(data).encode('utf-8')
                self.send_response(code)
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
                if self.path == '/favicon.ico':
                    self.send_response(204)
                    self.end_headers()
                    return

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
                        self._send_json({{'success': True, 'resources': res, 'serialPorts': serial_port_resources()}})
                    except Exception as e:
                        err = str(e)
                        if 'Could not locate VISA library' in err:
                            err = 'NI-VISA 드라이버를 찾을 수 없습니다. NI-VISA 또는 Keysight Connection Expert를 설치해 주세요.'
                        self._send_json({{'success': False, 'error': err}})
                    return

                # ── 계측기별 평가 기록 (EXE 옆 JSON 파일) ──
                elif self.path in ('/api/evaldata', '/api/keithley2400/evaldata'):
                    try:
                        eval_name = 'Keithley2400_eval_data.json' if self.path == '/api/keithley2400/evaldata' else 'PST3202_eval_data.json'
                        eval_path = os.path.join(os.path.dirname(sys.executable), eval_name)
                        if os.path.exists(eval_path):
                            with open(eval_path, 'r', encoding='utf-8') as _f:
                                raw = _f.read()
                        else:
                            raw = '{{"schema":"3m-instrument-logger/keithley2400-evaluations","version":1,"rows":[]}}' if self.path == '/api/keithley2400/evaldata' else '[]'
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

                elif self.path == '/api/update/config':
                    try:
                        import updater_backend
                        self._send_json(updater_backend.get_masked_config())
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                elif self.path == '/api/update/check':
                    try:
                        import updater_backend
                        cur_ver = '1.0.0'
                        v_path = os.path.join(APP_DIR, 'version.json')
                        if os.path.exists(v_path):
                            with open(v_path, 'r', encoding='utf-8') as vf:
                                cur_ver = json.load(vf).get('version', cur_ver)
                        self._send_json(updater_backend.check_for_updates(cur_ver))
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                elif self.path == '/api/update/progress':
                    try:
                        import updater_backend
                        self._send_json(updater_backend.get_download_status())
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

                # ── Updater API ───────────────────────────────────────────────
                elif self.path == '/api/update/config':
                    try:
                        import updater_backend
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        saved = updater_backend.save_config(body.get('repo'), body.get('token'))
                        self._send_json({{'ok': True, 'config': updater_backend.get_masked_config()}})
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                elif self.path == '/api/update/download':
                    try:
                        import updater_backend
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        res = updater_backend.start_download_task(body.get('asset_id'), body.get('asset_name'), body.get('asset_size', 0))
                        self._send_json(res)
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                elif self.path == '/api/update/apply':
                    try:
                        import updater_backend
                        length = int(self.headers.get('Content-Length', 0))
                        body = json.loads(self.rfile.read(length)) if length > 0 else {{}}
                        res = updater_backend.apply_update_and_restart(body)
                        self._send_json(res)
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}})
                    return

                # ── VISA API ──────────────────────────────────────────────────
                elif self.path == '/api/visa/connect':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        body   = json.loads(self.rfile.read(length))
                        addr   = body.get('address', '')
                        asrl_termination = body.get('asrlTermination', 'cr')
                        rm     = get_visa_rm()
                        if VISA_DEV:
                            try: VISA_DEV.close()
                            except: pass
                            VISA_DEV = None
                        VISA_DEV, detected_termination = open_visa_resource(
                            rm, addr, asrl_termination
                        )
                        self._send_json({{
                            'success': True,
                            'asrlTermination': detected_termination,
                        }})
                    except Exception as e:
                        if VISA_DEV:
                            try: VISA_DEV.close()
                            except Exception: pass
                            VISA_DEV = None
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
                        cmd    = body.get('cmd', '').strip()
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
                        cmd    = body.get('cmd', '').strip()
                        if not VISA_DEV:
                            raise Exception('Not connected to any VISA device.')
                        resp = VISA_DEV.query(cmd)
                        self._send_json({{'success': True, 'response': resp}})
                    except Exception as e:
                        try:
                            if VISA_DEV: VISA_DEV.clear()
                        except Exception:
                            pass
                        self._send_json({{'success': False, 'error': str(e)}})

                elif self.path == '/api/visa/read':
                    try:
                        if not VISA_DEV:
                            raise Exception('Not connected to any VISA device.')
                        resp = VISA_DEV.read()
                        self._send_json({{'success': True, 'response': resp}})
                    except Exception as e:
                        try:
                            if VISA_DEV: VISA_DEV.clear()
                        except Exception:
                            pass
                        self._send_json({{'success': False, 'error': str(e)}})

                # ── 계측기별 평가 기록 저장 (EXE 옆 JSON 파일) ──
                elif self.path in ('/api/evaldata', '/api/keithley2400/evaldata'):
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        raw = self.rfile.read(length)
                        json.loads(raw.decode('utf-8'))  # JSON 유효성 검증
                        eval_name = 'Keithley2400_eval_data.json' if self.path == '/api/keithley2400/evaldata' else 'PST3202_eval_data.json'
                        eval_path = os.path.join(os.path.dirname(sys.executable), eval_name)
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

                # ── Photo Editor USB 촬영 원본 자동 백업 ─────────────────
                elif self.path == '/api/photo-editor/capture-backup':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        if length <= 0 or length > 30 * 1024 * 1024:
                            raise ValueError('촬영 이미지가 없거나 허용 크기를 초과했습니다.')
                        data = self.rfile.read(length)
                        filename = os.path.basename(self.headers.get('X-Filename', 'capture.jpg'))
                        filename = re.sub(r'[^0-9A-Za-z가-힣._-]+', '_', filename) or 'capture.jpg'
                        day_dir = os.path.join(os.path.dirname(sys.executable), 'Photo_Editor_Capture_Backup', time.strftime('%Y%m%d'))
                        os.makedirs(day_dir, exist_ok=True)
                        unique = time.strftime('%H%M%S') + '_' + str(time.time_ns())[-9:] + '_' + filename
                        save_path = os.path.join(day_dir, unique)
                        with open(save_path, 'wb') as _f:
                            _f.write(data)
                        self._send_json({{'ok': True, 'path': save_path}})
                    except Exception as e:
                        self._send_json({{'ok': False, 'error': str(e)}}, 400)
                    return

                # ── Etching DXF → 정식 AutoCAD 2007 DWG 변환 ──────────────
                elif self.path == '/api/cad/convert-dwg':
                    try:
                        length = int(self.headers.get('Content-Length', 0))
                        body = json.loads(self.rfile.read(length))
                        dxf_bytes = base64.b64decode(body.get('dxfBase64', ''), validate=True)
                        dwg_bytes, converter = convert_dxf_to_autocad2007_dwg(dxf_bytes)
                        self._send_json({{
                            'success': True,
                            'dwgBase64': base64.b64encode(dwg_bytes).decode('ascii'),
                            'version': 'AC1021',
                            'converter': os.path.basename(converter),
                        }})
                    except FileNotFoundError as e:
                        self._send_json({{'success': False, 'code': 'converter_not_found', 'error': str(e)}}, 503)
                    except Exception as e:
                        self._send_json({{'success': False, 'code': 'conversion_failed', 'error': str(e)}}, 400)
                    return

                # ── 파일 저장 API (EXE 옆에 저장) ───────────────────────────
                elif self.path == '/api/save-file':
                    try:
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
        server = CustomThreadingServer(('127.0.0.1', port), Handler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()

        _webview2_cache = os.path.join(_storage_path, 'webview2_cache')
        os.makedirs(_webview2_cache, exist_ok=True)

        window = webview.create_window(
            '3M Instrument Logger',
            f'http://127.0.0.1:{{port}}/index.html',
            width=1600, height=900, resizable=True,
        )
        try:
            webview.start(gui='edgechromium', storage_path=_webview2_cache)
        except Exception:
            webview.start(storage_path=_webview2_cache)

        if VISA_DEV:
            try: VISA_DEV.close()
            except: pass
        server.shutdown()
    """)

    launcher_path = os.path.join(build_tmp, 'integrated_launcher.py')
    with open(launcher_path, 'w', encoding='utf-8') as f:
        f.write(launcher_src)
    print(f"[build] launcher: {launcher_path}")

    shutil.copy2(os.path.join(root, 'updater_backend.py'), os.path.join(build_tmp, 'updater_backend.py'))

    # ── PyInstaller 실행 ──────────────────────────────────────────────────────
    exe_name = '3M_Instrument_Logger'
    out_dir  = os.path.join(root, 'dist')
    staging_out_dir = os.path.join(build_tmp, 'release_out')
    os.makedirs(staging_out_dir, exist_ok=True)
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onefile',
        '--windowed',
        '--hidden-import=pyvisa',
        '--hidden-import=updater_backend',
        f'--name={exe_name}',
        f'--version-file={version_file}',
        f'--add-data={dist_dir}{os.pathsep}{bundle_dir}',
        f'--distpath={staging_out_dir}',
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

    extension = '.exe' if sys.platform == 'win32' else ''
    staged_exe = os.path.join(staging_out_dir, exe_name + extension)
    exe_path = os.path.join(out_dir, exe_name + extension)
    if os.path.exists(staged_exe):
        # 새 빌드가 완전히 성공한 뒤에만 기존 EXE를 원자적으로 교체합니다.
        # 빌드 실패 시에는 기존 배포 파일이 그대로 유지됩니다.
        os.makedirs(out_dir, exist_ok=True)
        os.replace(staged_exe, exe_path)
        removed = _remove_other_release_exes(out_dir, exe_path)
        print(f"\n[완료] 기존 EXE를 최신 빌드로 교체함: {exe_path}")
        if removed:
            print(f"[정리] 이전 통합 EXE {len(removed)}개 제거")
    else:
        print(f"\n[경고] 새 EXE 파일을 찾을 수 없음: {staged_exe}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("사용법: python build/package_exe.py dist/<폴더이름>")
        sys.exit(1)
    package(sys.argv[1])
