import serial
import time

def brute_force_keithley():
    # 이전 진단에서 PermissionError가 났던 COM3를 주 타겟으로 설정
    port = "COM3"
    baud = 9600
    log_file = r"c:\Users\Oven 3\.gemini\antigravity\scratch\3M Instrument Logger\keithley_key_search.txt"
    
    print(f"Brute-forcing Keithley on {port}...")
    try:
        ser = serial.Serial(port, baud, timeout=1)
        with open(log_file, "w") as f:
            def send(cmd):
                ser.write((cmd + "\n").encode())
                time.sleep(0.3)
                ser.write(b"SYST:ERR?\n")
                res = ser.readline().decode().strip()
                return res

            # 0. 기본 상태 확보
            ser.write(b"*CLS\n")
            ser.write(b"*IDN?\n")
            idn = ser.readline().decode().strip()
            f.write(f"IDENTIFICATION: {idn}\n\n")

            # 1. 시도해볼 키워드 조합들
            prefixes = ["", ":", ":SENS:", "SENS:"]
            funcs = ["FRES", "RES"]
            actions = ["REL", "NULL", "REF"]
            suffixes = [" ON", ":STAT ON", ":STATE ON", " 1", ":STAT 1"]

            for p in prefixes:
                for func in funcs:
                    for act in actions:
                        for s in suffixes:
                            cmd = f"{p}{func}:{act}{s}"
                            err = send(cmd)
                            if "No error" in err:
                                f.write(f"[SUCCESS] {cmd} -> {err}\n")
                                print(f"FOUND KEY: {cmd}")
                            else:
                                f.write(f"[FAILED] {cmd} -> {err}\n")
            
            f.write("\n--- Search Finished ---\n")
        ser.close()
    except Exception as e:
        print(f"Error during brute force: {e}")

if __name__ == "__main__":
    brute_force_keithley()
