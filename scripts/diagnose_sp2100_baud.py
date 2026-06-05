import serial
import serial.tools.list_ports
import time
import sys
from datetime import datetime

def diagnose_sp2100(port='COM3'):
    available_ports = [p.device for p in serial.tools.list_ports.comports()]
    log_lines = []

    def log(msg):
        print(msg)
        log_lines.append(msg)

    log("=" * 60)
    log(f"IMASS SP-2100 Baud Rate / Protocol Diagnosis")
    log(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"Available Ports: {available_ports}")
    log(f"Target Port: {port}")
    log("=" * 60)

    if port not in available_ports:
        log(f"[ERROR] Port '{port}' is not available. Exiting.")
        return

    baud_rates = [1200, 2400, 4800, 9600, 19200, 38400, 115200]
    formats = [
        {"name": "8-N-1", "bytesize": serial.EIGHTBITS, "parity": serial.PARITY_NONE},
        {"name": "7-E-1", "bytesize": serial.SEVENBITS, "parity": serial.PARITY_EVEN},
    ]

    for baud in baud_rates:
        for fmt in formats:
            log(f"\n--- Testing Baud: {baud} | Format: {fmt['name']} ---")
            
            # Test with DTR/RTS False first, then True
            for dtr_rts in [False, True]:
                log(f"  [DTR/RTS: {dtr_rts}] Connecting...")
                try:
                    ser = serial.Serial(
                        port=port,
                        baudrate=baud,
                        bytesize=fmt["bytesize"],
                        parity=fmt["parity"],
                        stopbits=serial.STOPBITS_ONE,
                        timeout=0.5
                    )
                    ser.dtr = dtr_rts
                    ser.rts = dtr_rts
                    
                    # Clear buffers
                    ser.reset_input_buffer()
                    ser.reset_output_buffer()
                    
                    # Send Start Streaming command S\r
                    log("    Sending S\\r command...")
                    ser.write(b"S\r")
                    ser.flush()
                    
                    # Read for 1 second
                    t_end = time.time() + 1.0
                    data_received = b""
                    while time.time() < t_end:
                        if ser.in_waiting:
                            b = ser.read(ser.in_waiting)
                            data_received += b
                        time.sleep(0.05)
                        
                    if data_received:
                        hex_data = ' '.join(f'{x:02X}' for x in data_received)
                        ascii_data = data_received.decode('ascii', errors='ignore').strip()
                        log(f"    [SUCCESS] Received after S\\r: HEX: {hex_data} | ASCII: '{ascii_data}'")
                        ser.close()
                        continue
                        
                    # Send Read command R\r
                    log("    No streaming. Sending R\\r query command...")
                    ser.write(b"R\r")
                    ser.flush()
                    
                    # Read for 1 second
                    t_end = time.time() + 1.0
                    while time.time() < t_end:
                        if ser.in_waiting:
                            b = ser.read(ser.in_waiting)
                            data_received += b
                        time.sleep(0.05)
                        
                    if data_received:
                        hex_data = ' '.join(f'{x:02X}' for x in data_received)
                        ascii_data = data_received.decode('ascii', errors='ignore').strip()
                        log(f"    [SUCCESS] Received after R\\r: HEX: {hex_data} | ASCII: '{ascii_data}'")
                    else:
                        log("    [TIMEOUT] No response received.")
                        
                    ser.close()
                except Exception as e:
                    log(f"    [ERROR] {e}")

    # Save log
    filename = f"sp2100_diag_result_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(log_lines))
    log(f"\n[OK] Diagnosis finished. Result saved to: {filename}")

if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else 'COM3'
    diagnose_sp2100(port)
