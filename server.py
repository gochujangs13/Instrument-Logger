# -*- coding: utf-8 -*-
"""
3M Instrument Logger — 통합 로컬 서버
- 웹 앱:     http://localhost:8000/index.html
- 폰 카메라: https://<LAN-IP>:8443/phone.html  (HTTPS 필요)
- VISA API:  /api/visa/* (pyvisa를 통해 GPIB/USB-TMC 계측기 제어)

실행:  python server.py
"""
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
import os, io, ssl, json, time, base64, socket, threading, ipaddress, datetime, subprocess, shutil, re, tempfile, glob
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

def _find_adb():
    """PATH 또는 일반 설치 경로에서 adb 실행 파일을 찾아 반환."""
    if shutil.which("adb"):
        return "adb"
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, "Downloads", "platform-tools-latest-windows", "platform-tools", "adb.exe"),
        os.path.join(home, "Downloads", "platform-tools", "adb.exe"),
        os.path.join(home, "AppData", "Local", "Android", "Sdk", "platform-tools", "adb.exe"),
        r"C:\Program Files\Android\android-studio\sdk\platform-tools\adb.exe",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

# ── PyVISA (선택적) ────────────────────────────────────────────────────────────
try:
    import pyvisa
    _rm = pyvisa.ResourceManager()
    VISA_OK = True
except Exception as _visa_err:
    _rm = None
    VISA_OK = False
    print(f"[VISA] pyvisa 로드 실패 — VISA 기능 비활성화: {_visa_err}")

_visa_lock    = threading.Lock()
_visa_session = None   # 현재 열려 있는 pyvisa Resource

_VISA_LONG_TIMEOUT_MS = 120000
_VISA_ASRL_PROBE_TIMEOUT_MS = 2000


def _is_asrl_address(address):
    upper = str(address or "").upper()
    return upper.startswith("ASRL") or "COM" in upper


def _configure_visa_resource(inst, address, serial_read_termination="\r"):
    """Apply bridge defaults without sending an instrument command."""
    inst.timeout = _VISA_LONG_TIMEOUT_MS
    if _is_asrl_address(address):
        inst.baud_rate = 9600
        # Model 2400 receives commands on CR. Its front-panel setting changes
        # only the terminator used for replies, so write termination stays CR.
        inst.read_termination = serial_read_termination
        inst.write_termination = "\r"
    else:
        inst.read_termination = "\n"
        inst.write_termination = "\n"


def _open_visa_resource(resource_manager, address, asrl_termination="cr"):
    """Open a VISA resource and optionally detect CR/LF in a safe state.

    Keithley 2400 serial termination is configurable at the front panel. A
    wrong setting makes even ``:OUTP?`` wait until the VISA timeout. For the
    opt-in ``auto`` mode every candidate session sends ``:OUTP OFF`` as its
    first instrument command and is accepted only after ``:OUTP?`` reports OFF.
    """
    if not _is_asrl_address(address) or str(asrl_termination).lower() != "auto":
        inst = resource_manager.open_resource(address)
        _configure_visa_resource(inst, address, "\r")
        return inst, ("CR" if _is_asrl_address(address) else None)

    errors = []
    for termination, label in (("\n", "LF"), ("\r", "CR")):
        inst = None
        try:
            inst = resource_manager.open_resource(address)
            _configure_visa_resource(inst, address, termination)
            inst.timeout = _VISA_ASRL_PROBE_TIMEOUT_MS
            inst.write(":OUTP OFF")
            time.sleep(0.25)
            output_state = str(inst.query(":OUTP?")).strip().upper()
            if output_state not in {"0", "0.0", "OFF"}:
                raise RuntimeError(f"OUTPUT OFF verification returned {output_state!r}")
            # CR+LF or LF+CR replies can leave the second byte buffered after
            # read_termination matched. Flush it before module initialization.
            try:
                inst.clear()
            except Exception:
                pass
            inst.timeout = _VISA_LONG_TIMEOUT_MS
            print(f"[VISA] RS-232 termination detected: {label}", flush=True)
            return inst, label
        except Exception as error:
            errors.append(f"{label}: {error}")
            if inst is not None:
                try:
                    inst.clear()
                except Exception:
                    pass
                try:
                    inst.close()
                except Exception:
                    pass

    raise RuntimeError("RS-232 termination auto-detection failed (" + "; ".join(errors) + ")")


def _windows_serial_ports():
    """Return active Windows COM ports even when NI-VISA omits ASRL resources."""
    if os.name != "nt":
        return []
    ports = set()
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DEVICEMAP\SERIALCOMM") as key:
            index = 0
            while True:
                try:
                    _, value, _ = winreg.EnumValue(key, index)
                    if re.fullmatch(r"COM\d+", str(value), re.IGNORECASE):
                        ports.add(str(value).upper())
                    index += 1
                except OSError:
                    break
    except OSError:
        pass
    return sorted(ports, key=lambda port: int(port[3:]))


def _serial_port_resources():
    return [
        {"port": port, "address": f"ASRL{int(port[3:])}::INSTR"}
        for port in _windows_serial_ports()
    ]

import sys

# PyInstaller 패키징(EXE) 실행 시, 임시 폴더(_MEIPASS)가 아닌 실제 실행한 EXE 파일이 위치한 폴더를 ROOT로 설정
if getattr(sys, 'frozen', False):
    ROOT = os.path.dirname(sys.executable)
else:
    ROOT = os.path.dirname(os.path.abspath(__file__))

UPLOAD_DIR = os.path.join(ROOT, "phone_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
PHOTO_CAPTURE_BACKUP_DIR = os.path.join(ROOT, "Photo_Editor_Capture_Backup")


def _save_photo_capture_backup(data, filename):
    if not data or len(data) > 30 * 1024 * 1024:
        raise ValueError("촬영 이미지가 없거나 허용 크기를 초과했습니다.")
    day_dir = os.path.join(PHOTO_CAPTURE_BACKUP_DIR, datetime.datetime.now().strftime("%Y%m%d"))
    os.makedirs(day_dir, exist_ok=True)
    safe_name = re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", os.path.basename(filename or "capture.jpg"))
    unique = datetime.datetime.now().strftime("%H%M%S_%f") + "_" + (safe_name or "capture.jpg")
    path = os.path.join(day_dir, unique)
    with open(path, "wb") as handle:
        handle.write(data)
    return path


def _find_oda_file_converter():
    """Locate an installed ODA File Converter without bundling its licensed binaries."""
    candidates = []
    configured = os.environ.get("ODA_FILE_CONVERTER", "").strip()
    if configured:
        candidates.append(configured)
    located = shutil.which("ODAFileConverter.exe") or shutil.which("ODAFileConverter")
    if located:
        candidates.append(located)
    patterns = [
        r"C:\Program Files\ODA\*File*Converter*\ODAFileConverter.exe",
        r"C:\Program Files\ODA\ODAFileConverter.exe",
        r"C:\Program Files\Open Design Alliance\*File*Converter*\ODAFileConverter.exe",
        r"C:\Program Files (x86)\ODA\*File*Converter*\ODAFileConverter.exe",
    ]
    for pattern in patterns:
        candidates.extend(glob.glob(pattern))
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return os.path.abspath(candidate)
    return None


def _convert_dxf_to_autocad2007_dwg(dxf_bytes):
    """Convert a verified DXF into a vendor-written AutoCAD 2007 DWG."""
    converter = _find_oda_file_converter()
    if not converter:
        raise FileNotFoundError("ODA File Converter가 설치되어 있지 않습니다.")
    if not dxf_bytes or len(dxf_bytes) > 50 * 1024 * 1024:
        raise ValueError("DXF 데이터가 없거나 허용 크기를 초과했습니다.")

    with tempfile.TemporaryDirectory(prefix="3m_etch_dwg_") as temp_root:
        input_dir = os.path.join(temp_root, "input")
        output_dir = os.path.join(temp_root, "output")
        os.makedirs(input_dir)
        os.makedirs(output_dir)
        input_path = os.path.join(input_dir, "Etching_ODA_Input.dxf")
        output_path = os.path.join(output_dir, "Etching_ODA_Input.dwg")
        with open(input_path, "wb") as handle:
            handle.write(dxf_bytes)

        # ODA CLI: input dir, output dir, version, type, recurse, audit, filter.
        command = ([sys.executable, converter] if converter.lower().endswith(".py") else [converter]) + [
            input_dir, output_dir, "ACAD2007", "DWG", "0", "1", "*.dxf"
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "변환기 오류").strip()
            raise RuntimeError(f"ODA 변환 실패(exit {result.returncode}): {detail[:1000]}")
        if not os.path.isfile(output_path):
            matches = glob.glob(os.path.join(output_dir, "*.dwg"))
            if len(matches) == 1:
                output_path = matches[0]
            else:
                raise RuntimeError("ODA 변환 결과 DWG를 찾을 수 없습니다.")
        with open(output_path, "rb") as handle:
            dwg_bytes = handle.read()
        if len(dwg_bytes) < 64 or dwg_bytes[:6] != b"AC1021":
            signature = dwg_bytes[:6].decode("ascii", errors="replace")
            raise RuntimeError(f"AutoCAD 2007 DWG 검증 실패: {signature!r}")
        return dwg_bytes, converter

HTTP_PORT = 8000
HTTPS_PORT = 8443

_lock = threading.Lock()
_photos = []      # [{id, name, file}]
_next_id = 1

# ── 카메라 스트리밍 ───────────────────────────────────────────────────────────
_camera_frame = None      # bytes (JPEG) — 최신 프리뷰 프레임
_camera_frame_lock = threading.Lock()
_camera_last_ts = 0.0    # 마지막 프레임 수신 시각
_camera_trigger = False  # 컴퓨터 → 폰 촬영 트리거
_camera_focus  = None   # {x, y, lock, ts} — 초점 명령


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


LAN_IP = lan_ip()


def add_photo(name, data_bytes, ext="png"):
    global _next_id
    with _lock:
        pid = _next_id
        _next_id += 1
        fn = f"{pid:04d}.{ext}"
        with open(os.path.join(UPLOAD_DIR, fn), "wb") as f:
            f.write(data_bytes)
        _photos.append({"id": pid, "name": name, "file": fn})
        return pid


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        # This is a local development server. Always revalidate app assets so
        # instrument-module changes are not hidden by a stale browser cache.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        try:
            print(f"[{self.address_string()}] {fmt % args}", flush=True)
        except Exception:
            pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/evaldata":
            return self._load_pst3202_evaldata()
        if u.path == "/api/keithley2400/evaldata":
            return self._load_evaldata_file("Keithley2400_eval_data.json", {"schema": "3m-instrument-logger/keithley2400-evaluations", "version": 1, "rows": []})
        if u.path == "/api/update/config":
            import updater_backend
            return self._json(updater_backend.get_masked_config())
        if u.path == "/api/update/check":
            import updater_backend
            cur_ver = "1.0.0"
            try:
                v_path = os.path.join(ROOT, "version.json")
                if os.path.exists(v_path):
                    with open(v_path, "r", encoding="utf-8") as vf:
                        cur_ver = json.load(vf).get("version", cur_ver)
            except Exception:
                pass
            return self._json(updater_backend.check_for_updates(cur_ver))
        if u.path == "/api/update/progress":
            import updater_backend
            return self._json(updater_backend.get_download_status())
        if u.path == "/api/visa/list":
            return self._visa_list()
        if u.path == "/api/info":
            return self._json({
                "lanIp": LAN_IP, "httpsPort": HTTPS_PORT,
                "phoneUrl": f"https://{LAN_IP}:{HTTPS_PORT}/phone.html",
                "phoneUrlUsb": f"http://localhost:{HTTP_PORT}/phone.html",
            })
        if u.path == "/api/camera/preview":
            with _camera_frame_lock:
                frame = _camera_frame
            if not frame:
                self.send_response(204); self._cors(); self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self._cors()
            self.send_header("Content-Length", str(len(frame)))
            self.end_headers()
            self.wfile.write(frame)
            return
        if u.path == "/api/camera/status":
            global _camera_trigger, _camera_last_ts
            with _camera_frame_lock:
                trig = _camera_trigger
                _camera_trigger = False
                last_ts = _camera_last_ts
            connected = (time.time() - last_ts) < 2.0
            return self._json({"connected": connected, "trigger": trig})
        if u.path == "/api/camera/focus":
            global _camera_focus
            with _camera_frame_lock:
                f = _camera_focus
                _camera_focus = None  # 소비 후 초기화
            return self._json(f or {})
        if u.path == "/api/photos":
            since = 0
            try:
                since = int(parse_qs(u.query).get("since", ["0"])[0])
            except Exception:
                since = 0
            with _lock:
                items = [{"id": p["id"], "name": p["name"]} for p in _photos if p["id"] > since]
                last = _photos[-1]["id"] if _photos else 0
            return self._json({"photos": items, "last": last})
        if u.path.startswith("/api/photo/"):
            try:
                pid = int(u.path.rsplit("/", 1)[1])
            except Exception:
                return self.send_error(404)
            with _lock:
                p = next((x for x in _photos if x["id"] == pid), None)
            if not p:
                return self.send_error(404)
            try:
                with open(os.path.join(UPLOAD_DIR, p["file"]), "rb") as f:
                    data = f.read()
            except Exception:
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self._cors()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if u.path == "/api/printers":
            try:
                from instruments.epson_ok900p.printer import PrinterController
                printers = PrinterController.get_printers()
                detected = PrinterController.auto_detect_ok900p()
                detected_tape = PrinterController.get_detected_tape_width(detected) if detected else None
                driver_dir = os.path.join(ROOT, "instruments", "epson_ok900p", "driver")
                driver_ready = os.path.exists(os.path.join(driver_dir, "LW900P.inf"))
                return self._json({
                    "ok": True,
                    "printers": printers,
                    "detected": detected,
                    "tapeWidth": detected_tape,
                    "driverInstalled": bool(detected),
                    "driverFilesAvailable": driver_ready
                })
            except Exception as e:
                return self._json({"ok": False, "error": str(e), "printers": []})
        if u.path == "/api/driver/download/ok900p":
            zip_path = os.path.join(ROOT, "instruments", "epson_ok900p", "driver", "ok900p_driver.zip")
            if not os.path.exists(zip_path):
                return self.send_error(404, "Driver zip file not found")
            try:
                with open(zip_path, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", 'attachment; filename="epson_ok900p_driver.zip"')
                self.send_header("Content-Length", str(len(data)))
                self._cors()
                self.end_headers()
                self.wfile.write(data)
                return
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 500)
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/api/evaldata":
            return self._save_pst3202_evaldata()
        if u.path == "/api/keithley2400/evaldata":
            return self._save_evaldata_file("Keithley2400_eval_data.json")
        if u.path == "/api/export":
            return self._save_pst3202_export()
        if u.path == "/api/photo-editor/capture-backup":
            try:
                ln = int(self.headers.get("Content-Length", "0"))
                data = self.rfile.read(ln)
                path = _save_photo_capture_backup(data, self.headers.get("X-Filename", "capture.jpg"))
                return self._json({"ok": True, "path": path})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        if u.path == "/api/cad/convert-dwg":
            try:
                body = self._read_body()
                encoded = body.get("dxfBase64", "")
                dxf_bytes = base64.b64decode(encoded, validate=True)
                dwg_bytes, converter = _convert_dxf_to_autocad2007_dwg(dxf_bytes)
                return self._json({
                    "success": True,
                    "dwgBase64": base64.b64encode(dwg_bytes).decode("ascii"),
                    "version": "AC1021",
                    "converter": os.path.basename(converter),
                })
            except FileNotFoundError as e:
                return self._json({"success": False, "code": "converter_not_found", "error": str(e)}, 503)
            except Exception as e:
                return self._json({"success": False, "code": "conversion_failed", "error": str(e)}, 400)
        if u.path == "/api/visa/connect":
            return self._visa_connect()
        if u.path == "/api/visa/disconnect":
            return self._visa_disconnect()
        if u.path == "/api/visa/query":
            return self._visa_query()
        if u.path == "/api/visa/read":
            return self._visa_read()
        if u.path == "/api/update/config":
            try:
                import updater_backend
                body = self._read_body()
                saved = updater_backend.save_config(body.get("repo"), body.get("token"))
                return self._json({"ok": True, "config": updater_backend.get_masked_config()})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        if u.path == "/api/update/download":
            try:
                import updater_backend
                body = self._read_body()
                res = updater_backend.start_download_task(body.get("asset_id"), body.get("asset_name"), body.get("asset_size", 0))
                return self._json(res)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        if u.path == "/api/update/apply":
            try:
                import updater_backend
                body = self._read_body()
                res = updater_backend.apply_update_and_restart(body)
                return self._json(res)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 500)
        if u.path == "/api/visa/write":
            return self._visa_write()
        if u.path == "/api/upload":
            try:
                ln = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(ln)
                obj = json.loads(raw)
                durl = obj["dataUrl"]
                b64 = durl.split(",", 1)[1]
                data = base64.b64decode(b64)
                name = obj.get("name") or ("phone_" + datetime.datetime.now().strftime("%H%M%S"))
                pid = add_photo(name, data)
                return self._json({"ok": True, "id": pid})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        if u.path == "/api/clear":
            with _lock:
                _photos.clear()
            return self._json({"ok": True})
        if u.path == "/api/camera/frame":
            global _camera_frame, _camera_last_ts
            try:
                ln = int(self.headers.get("Content-Length", "0"))
                data = self.rfile.read(ln)
                with _camera_frame_lock:
                    _camera_frame = data
                    _camera_last_ts = time.time()
                self.send_response(204); self._cors(); self.end_headers()
            except Exception:
                self.send_error(500)
            return
        if u.path == "/api/camera/trigger":
            global _camera_trigger
            with _camera_frame_lock:
                _camera_trigger = True
            return self._json({"ok": True})
        if u.path == "/api/camera/focus":
            global _camera_focus
            try:
                body = self._read_body()
                with _camera_frame_lock:
                    _camera_focus = {
                        "x": float(body.get("x", 0.5)),
                        "y": float(body.get("y", 0.5)),
                        "lock": bool(body.get("lock", False)),
                        "ts": time.time(),
                    }
                return self._json({"ok": True})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        if u.path == "/api/camera/open-phone":
            url = f"http://localhost:{HTTP_PORT}/phone.html"
            adb = _find_adb()
            if not adb:
                return self._json({"ok": False, "error": "adb 미설치"})
            try:
                subprocess.run(
                    [adb, "reverse", f"tcp:{HTTP_PORT}", f"tcp:{HTTP_PORT}"],
                    capture_output=True, text=True, timeout=5
                )
                r = subprocess.run(
                    [adb, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url],
                    capture_output=True, text=True, timeout=5
                )
                ok = r.returncode == 0
                return self._json({"ok": ok, "msg": (r.stdout.strip() or r.stderr.strip())})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)})
        if u.path == "/api/launch/ok900p":
            try:
                script = os.path.join(ROOT, "instruments", "epson_ok900p", "main.py")
                proc = subprocess.Popen([sys.executable, script], cwd=ROOT)
                return self._json({"ok": True, "pid": proc.pid, "message": "Epson PRIFIA OK900P App Launched"})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 500)
        if u.path == "/api/print/ok900p":
            try:
                from PIL import Image
                body = self._read_body()
                printer_name = body.get("printer", "")
                data_url = body.get("imageBase64", "")
                tape_width = float(body.get("tapeWidthMm", 24.0))
                length_mm = float(body.get("lengthMm", 60.0))
                copies = int(body.get("copies", 1))

                if not printer_name:
                    return self._json({"ok": False, "error": "프린터가 지정되지 않았습니다."}, 400)
                if not data_url:
                    return self._json({"ok": False, "error": "이미지 데이터가 없습니다."}, 400)

                b64_str = data_url.split(",", 1)[1] if "," in data_url else data_url
                img_data = base64.b64decode(b64_str)
                pil_img = Image.open(io.BytesIO(img_data))

                from instruments.epson_ok900p.printer import PrinterController
                from instruments.epson_ok900p.renderer import LabelModel
                model = LabelModel(tape_width_mm=tape_width, fixed_length_mm=length_mm, length_mode="fixed")

                ok, msg = PrinterController.print(printer_name, pil_img, model, copies=copies)
                return self._json({"ok": ok, "message": msg})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 500)
        if u.path == "/api/driver/install/ok900p":
            try:
                driver_dir = os.path.join(ROOT, "instruments", "epson_ok900p", "driver")
                bat_path = os.path.join(driver_dir, "install_driver.bat")
                if not os.path.exists(bat_path):
                    return self._json({"ok": False, "error": "드라이버 설치 스크립트(install_driver.bat)를 찾을 수 없습니다."}, 404)
                ps_cmd = f'Start-Process -FilePath cmd.exe -WorkingDirectory "{driver_dir}" -ArgumentList "/k \\"install_driver.bat\\"" -Verb RunAs'
                subprocess.Popen(["powershell.exe", "-NoProfile", "-Command", ps_cmd])
                return self._json({"ok": True, "message": "드라이버 설치 마법사가 실행되었습니다. 화면의 관리자 권한(UAC) 승인 창을 확인해주세요."})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 500)
        if u.path == "/api/driver/install-wizard/ok900p":
            try:
                driver_dir = os.path.join(ROOT, "instruments", "epson_ok900p", "driver")
                wizard_exe = os.path.join(driver_dir, "official_wizard", "dinst64.exe")
                if not os.path.exists(wizard_exe):
                    return self._json({"ok": False, "error": "공식 마법사 파일(dinst64.exe)을 찾을 수 없습니다."}, 404)
                wizard_dir = os.path.dirname(wizard_exe)
                ps_cmd = f'Start-Process -FilePath "{wizard_exe}" -WorkingDirectory "{wizard_dir}" -Verb RunAs'
                subprocess.Popen(["powershell.exe", "-NoProfile", "-Command", ps_cmd])
                return self._json({"ok": True, "message": "EPSON 공식 드라이버 설치 마법사가 실행되었습니다."})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 500)
        if u.path == "/api/driver/open-folder/ok900p":
            try:
                driver_dir = os.path.join(ROOT, "instruments", "epson_ok900p", "driver")
                if os.path.exists(driver_dir):
                    os.startfile(driver_dir)
                    return self._json({"ok": True, "message": "드라이버 설치 폴더를 열었습니다."})
                return self._json({"ok": False, "error": "드라이버 폴더를 찾을 수 없습니다."}, 404)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 500)
        return self.send_error(404)


    # ── VISA API 핸들러 ────────────────────────────────────────────────────────
    def _visa_list(self):
        global _rm
        if not VISA_OK:
            return self._json({"success": False, "error": "pyvisa not available"})
        try:
            resources = list(_rm.list_resources())
            return self._json({"success": True, "resources": resources, "serialPorts": _serial_port_resources()})
        except Exception as e:
            return self._json({"success": False, "error": str(e)})

    def _read_body(self):
        ln = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(ln)) if ln else {}

    def _load_pst3202_evaldata(self):
        return self._load_evaldata_file("PST3202_eval_data.json", [])

    def _load_evaldata_file(self, filename, default_value):
        try:
            path = os.path.join(ROOT, filename)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    raw = f.read()
            else:
                raw = json.dumps(default_value, ensure_ascii=False)
            body = raw.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 500)

    def _save_pst3202_evaldata(self):
        return self._save_evaldata_file("PST3202_eval_data.json")

    def _save_evaldata_file(self, filename):
        try:
            ln = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(ln)
            # Validate JSON
            json.loads(raw.decode("utf-8"))
            path = os.path.join(ROOT, filename)
            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(raw)
            os.replace(tmp, path)
            self._json({"ok": True})
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 400)

    def _save_pst3202_export(self):
        try:
            ln = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(ln)
            filename = self.headers.get("X-Filename", "export.xlsx")
            filename = os.path.basename(filename)
            if not filename:
                filename = "export.xlsx"
            path = os.path.join(ROOT, filename)
            with open(path, "wb") as f:
                f.write(raw)
            self._json({"ok": True, "path": path})
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 500)

    def _visa_connect(self):
        global _visa_session, _rm
        if not VISA_OK:
            return self._json({"success": False, "error": "pyvisa not available"})
        body = self._read_body()
        address = body.get("address", "")
        skip_idn = body.get("skipIdn") is True
        asrl_termination = body.get("asrlTermination", "cr")
        with _visa_lock:
            inst = None
            try:
                if _visa_session:
                    try: _visa_session.close()
                    except Exception: pass
                    _visa_session = None
                inst, detected_termination = _open_visa_resource(
                    _rm, address, asrl_termination
                )
                _visa_session = inst
                idn = ""
                if not skip_idn:
                    idn = inst.query("*IDN?").strip()
                    print(f"[VISA] Connected: {address}  →  {idn}", flush=True)
                else:
                    print(f"[VISA] Connected: {address} (identity deferred to module)", flush=True)
                return self._json({
                    "success": True,
                    "idn": idn,
                    "asrlTermination": detected_termination,
                })
            except Exception as e:
                if inst is not None and inst is not _visa_session:
                    try: inst.close()
                    except Exception: pass
                print(f"[VISA] Connect failed: {e}", flush=True)
                return self._json({"success": False, "error": str(e)})

    def _visa_disconnect(self):
        global _visa_session
        with _visa_lock:
            try:
                if _visa_session:
                    _visa_session.close()
                    _visa_session = None
                print("[VISA] Disconnected", flush=True)
                return self._json({"success": True})
            except Exception as e:
                return self._json({"success": False, "error": str(e)})

    def _visa_query(self):
        global _visa_session
        if not VISA_OK:
            return self._json({"success": False, "error": "pyvisa not available"})
        body = self._read_body()
        cmd  = body.get("cmd", "").strip()
        with _visa_lock:
            if not _visa_session:
                return self._json({"success": False, "error": "Not connected"})
            try:
                resp = _visa_session.query(cmd)
                return self._json({"success": True, "response": resp.strip()})
            except Exception as e:
                print(f"[VISA] Query error ({cmd!r}): {e}", flush=True)
                # A timed-out GPIB query can leave unread output queued in the
                # instrument. Clear the VISA session before the next command so
                # the following safety command does not trigger -420.
                try:
                    _visa_session.clear()
                except Exception as clear_err:
                    print(f"[VISA] Clear after query error failed: {clear_err}", flush=True)
                return self._json({"success": False, "error": str(e)})

    def _visa_read(self):
        """Read an already-queued VISA response without sending a command."""
        global _visa_session
        if not VISA_OK:
            return self._json({"success": False, "error": "pyvisa not available"})
        with _visa_lock:
            if not _visa_session:
                return self._json({"success": False, "error": "Not connected"})
            try:
                resp = _visa_session.read()
                return self._json({"success": True, "response": resp.strip()})
            except Exception as e:
                print(f"[VISA] Read error: {e}", flush=True)
                try:
                    _visa_session.clear()
                except Exception as clear_err:
                    print(f"[VISA] Clear after read error failed: {clear_err}", flush=True)
                return self._json({"success": False, "error": str(e)})

    def _visa_write(self):
        global _visa_session
        if not VISA_OK:
            return self._json({"success": False, "error": "pyvisa not available"})
        body = self._read_body()
        cmd  = body.get("cmd", "").strip()
        with _visa_lock:
            if not _visa_session:
                return self._json({"success": False, "error": "Not connected"})
            try:
                _visa_session.write(cmd)
                return self._json({"success": True})
            except Exception as e:
                print(f"[VISA] Write error ({cmd!r}): {e}", flush=True)
                return self._json({"success": False, "error": str(e)})


def make_self_signed(cert_path, key_path, ip):
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, ip)])
    alt = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    try:
        alt.append(x509.IPAddress(ipaddress.ip_address(ip)))
    except Exception:
        pass
    now = datetime.datetime.utcnow()
    cert = (x509.CertificateBuilder()
            .subject_name(name).issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=3650))
            .add_extension(x509.SubjectAlternativeName(alt), critical=False)
            .sign(key, hashes.SHA256()))
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM,
                                  serialization.PrivateFormat.TraditionalOpenSSL,
                                  serialization.NoEncryption()))
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))


def serve(port, ssl_ctx=None):
    while True:
        try:
            httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
            if ssl_ctx:
                httpd.socket = ssl_ctx.wrap_socket(httpd.socket, server_side=True)
            httpd.serve_forever()
        except Exception as e:
            print(f"[HTTP] Server notice on port {port}: {e}", flush=True)
            time.sleep(1)


def try_adb_reverse(http_port):
    """adb reverse 시도 → (성공여부, 메시지)"""
    try:
        r = subprocess.run(
            ["adb", "reverse", f"tcp:{http_port}", f"tcp:{http_port}"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0:
            return True, r.stdout.strip() or "OK"
        return False, (r.stderr.strip() or f"exit {r.returncode}")
    except FileNotFoundError:
        return False, "adb 미설치"
    except Exception as e:
        return False, str(e)


def main():
    cert = os.path.join(ROOT, "cert.pem")
    key = os.path.join(ROOT, "key.pem")
    https_ok = True
    try:
        if not (os.path.exists(cert) and os.path.exists(key)):
            print("자체 서명 인증서 생성 중...")
            make_self_signed(cert, key, LAN_IP)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
    except Exception as e:
        https_ok = False
        print(f"[경고] HTTPS 준비 실패: {e}\n폰 카메라 WiFi 모드를 사용할 수 없습니다.")

    if https_ok:
        threading.Thread(target=serve, args=(HTTPS_PORT, ctx), daemon=True).start()

    # ADB reverse 자동 시도 (USB 연결 + 디버깅 ON 상태이면 자동 설정됨)
    adb_ok, adb_msg = try_adb_reverse(HTTP_PORT)

    line = "=" * 60
    print(line)
    print("  3M Instrument Logger 서버 실행 중")
    print(line)
    print(f"  [웹 앱]      http://localhost:{HTTP_PORT}/index.html")
    print()
    print("  -- 폰 카메라 연결 방법 ------------------------------")
    print()
    print("  [방법 1] USB (ADB) - 권장, HTTPS 인증서 경고 없음")
    if adb_ok:
        print(f"  [OK] adb reverse 자동 설정 완료 ({adb_msg})")
        print(f"  -> 폰 브라우저에서: http://localhost:{HTTP_PORT}/phone.html")
    else:
        print(f"  [FAIL] adb reverse 자동 설정 실패: {adb_msg}")
        print("  수동 설정 순서:")
        print("    1. 갤럭시 S23: 설정 -> 개발자 옵션 -> USB 디버깅 ON")
        print("    2. USB 연결 후 팝업에서 '파일 전송' 또는 'PTP' 선택")
        print("    3. 이 PC 터미널에서:")
        print(f"         adb reverse tcp:{HTTP_PORT} tcp:{HTTP_PORT}")
        print(f"    4. 폰 브라우저에서: http://localhost:{HTTP_PORT}/phone.html")
    print()
    if https_ok:
        print("  [방법 2] WiFi - adb 없을 때 대안 (인증서 경고 '계속' 허용)")
        print(f"  -> 폰 브라우저에서: https://{LAN_IP}:{HTTPS_PORT}/phone.html")
    print()
    if VISA_OK:
        print(f"  [VISA API]   http://localhost:{HTTP_PORT}/api/visa/list  (pyvisa OK)")
    else:
        print("  [VISA API]   pyvisa 없음 -- pip install pyvisa")
    print(line)
    print("  종료: Ctrl+C")
    try:
        serve(HTTP_PORT)
    except KeyboardInterrupt:
        print("\n서버 종료")


if __name__ == "__main__":
    main()
