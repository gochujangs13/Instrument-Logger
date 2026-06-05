import serial
import time
import os

def diagnose():
    # 사용 가능한 포트 후보들
    ports = ["COM1", "COM2", "COM3", "COM4", "COM5"]
    baud = 9600
    log_file = r"c:\Users\Oven 3\.gemini\antigravity\scratch\3M Instrument Logger\keithley_diag_log.txt"
    
    with open(log_file, "w") as f:
        f.write("--- Keithley 2700 Diagnosis Start ---\n")
        
        for port in ports:
            try:
                f.write(f"\nTrying {port}...\n")
                ser = serial.Serial(port, baud, timeout=2)
                time.sleep(1)
                
                # 1. 클리어 및 IDN 요청
                ser.write(b"*CLS\n")
                ser.write(b"*IDN?\n")
                time.sleep(0.5)
                idn = ser.readline().decode().strip()
                f.write(f"IDN Response: {idn}\n")
                
                if not idn:
                    f.write("No response. Skipping.\n")
                    ser.close()
                    continue

                # 2. 기능 테스트
                variants = [
                    ":FUNC 'FRES'",
                    ":FRES:REL ON",
                    "FRES:REL ON",
                    ":SENS:FRES:REL:STAT ON",
                    ":FRES:NULL:STAT ON",
                    ":CALC:REL:STAT ON"
                ]
                
                for v in variants:
                    f.write(f"Testing [{v}]: ")
                    ser.write(f"{v}\n".encode())
                    time.sleep(0.5)
                    ser.write(b"SYST:ERR?\n")
                    err = ser.readline().decode().strip()
                    f.write(f"{err}\n")
                
                ser.close()
                f.write(f"Diagnosis on {port} completed.\n")
                break # 하나라도 성공하면 중단
                
            except Exception as e:
                f.write(f"Failed to open {port}: {e}\n")

    print(f"Diagnosis finished. Results saved to {log_file}")

if __name__ == "__main__":
    diagnose()
