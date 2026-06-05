import serial
import serial.tools.list_ports
import time
import sys
from datetime import datetime


def diagnose(port='COM3'):
    # [FIX #7] 사용 가능한 포트 목록 먼저 출력
    available_ports = [p.device for p in serial.tools.list_ports.comports()]
    log_lines = []

    def log(msg):
        print(msg)
        log_lines.append(msg)

    log("=" * 60)
    log(f"HIOKI 3540 진단 스크립트 | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log("=" * 60)
    log(f"사용 가능한 포트: {available_ports if available_ports else '없음'}")

    if port not in available_ports:
        log(f"[경고] '{port}' 포트가 목록에 없습니다. 그래도 연결을 시도합니다.")

    log(f"대상 포트: {port}")
    log("")

    ser = None
    try:
        ser = serial.Serial(port, 9600, timeout=1)
        log(f"[OK] {port} 연결 성공")
        log("")

        commands = ["D", "V", "S", "R", "*IDN?", "RMES"]
        delimiters = ["\r\n", "\r"]

        for cmd in commands:
            log(f"--- 명령: {repr(cmd)} ---")
            for delim in delimiters:
                full_cmd = f"{cmd}{delim}"
                ser.reset_input_buffer()
                ser.write(full_cmd.encode('ascii'))
                ser.flush()

                # [FIX #4] write 직후 장비 처리 대기 (readline의 timeout과 별개)
                time.sleep(0.2)

                # [FIX #1] 비ASCII 바이트 수신 시 UnicodeDecodeError 방지
                resp = ser.readline().decode('ascii', errors='ignore').strip()

                # [FIX #3] 타임아웃(빈 응답)과 실제 응답을 명확히 구분
                recv_display = repr(resp) if resp else "<<TIMEOUT / NO RESPONSE>>"
                log(f"  SENT: {repr(full_cmd):<20} -> RECV: {recv_display}")

                # [FIX #5] 구분자 전환 전 장비 내부 버퍼 안정화 대기
                time.sleep(0.15)

            log("")

    except Exception as e:
        log(f"[ERROR] {e}")

    finally:
        # [FIX #2] 예외 발생 여부와 관계없이 포트 항상 해제
        if ser and ser.is_open:
            ser.close()
            log(f"[OK] {port} 포트 해제 완료")

    # [FIX #6] 진단 결과를 파일로 저장
    result_filename = f"diagnose_result_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    try:
        with open(result_filename, "w", encoding="utf-8") as f:
            f.write("\n".join(log_lines))
        print(f"\n[OK] 진단 결과 저장 완료: {result_filename}")
    except Exception as e:
        print(f"[경고] 결과 파일 저장 실패: {e}")


if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else 'COM3'
    diagnose(port)
