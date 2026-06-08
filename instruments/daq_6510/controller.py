import pyvisa
import threading
import time
import csv
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class DAQ6510Controller:
    def __init__(self):
        self.is_connected = False
        self.is_running = False
        self.thread = None
        self.visa_addr = ""
        self.active_channels = []
        
        self.on_data = None # callback(now_str, readings, elapsed_h)
        self.on_live_ch = None # callback(ch, val)
        self.on_error = None # callback(msg)
        self.on_stop = None # callback()

    def connect(self, addr):
        # We don't actually hold the connection open, pyvisa handles it in the thread
        self.visa_addr = addr
        self.is_connected = True
        return True

    def disconnect(self):
        self.is_connected = False
        self.stop_measurement()

    def start_measurement(self, filename, target_sec, mode, ch_delay, selected_channels, get_ch_name_cb):
        if self.is_running: return False
        self.is_running = True
        if not filename.lower().endswith('.csv'):
            filename += '.csv'
        self.active_channels = selected_channels
        
        self.thread = threading.Thread(
            target=self._daq_task,
            args=(filename, target_sec, mode, ch_delay, selected_channels, get_ch_name_cb),
            daemon=True
        )
        self.thread.start()
        return True

    def stop_measurement(self):
        self.is_running = False

    def _daq_task(self, filename, target_sec, mode, ch_delay, selected_channels, get_ch_name_cb):
        rm = pyvisa.ResourceManager()
        daq = None
        try:
            daq = rm.open_resource(self.visa_addr)
            if self.visa_addr.upper().startswith("ASRL") or "COM" in self.visa_addr.upper():
                daq.baud_rate = 9600
                daq.read_termination = '\r'
            daq.timeout = 10000
            
            daq.write('*RST')
            time.sleep(0.5)
            
            func = "FRES" if mode == '4-Wire' else "RES"
            ch_list_str = f"(@{','.join(selected_channels)})"
            daq.write(f'SENS:FUNC "{func}", {ch_list_str}')
            
            if func == "FRES":
                daq.write(f'SENS:FRES:OCOM ON, {ch_list_str}')
            
            daq.write(f'SENS:{func}:NPLC 1.0, {ch_list_str}')
            daq.write(f'SENS:{func}:RANG:AUTO ON, {ch_list_str}')
            
            # Configure scan list natively on the instrument
            daq.write(f'ROUT:SCAN {ch_list_str}')
            
            # Set channel delay natively on the instrument if requested
            if ch_delay > 0:
                daq.write(f'ROUT:SCAN:DELay {ch_delay}, {ch_list_str}')
            
            start_time = datetime.now()
            
            # Increase PyVISA timeout if scan duration exceeds default timeout
            total_scan_time = len(selected_channels) * max(0.05, ch_delay)
            if total_scan_time * 1000 > daq.timeout:
                daq.timeout = int(total_scan_time * 1000 + 5000)
            
            with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f)
                writer.writerow(['Time (Hours)'] + [get_ch_name_cb(c) for c in selected_channels])
                
                while self.is_running and (datetime.now() - start_time).total_seconds() < target_sec:
                    # Query all channels in the scan list in a single native sweep
                    raw_data = daq.query('READ?')
                    
                    # Parse comma-separated float readings
                    readings = []
                    parts = raw_data.split(',')
                    for i, p in enumerate(parts):
                        if i >= len(selected_channels): break
                        try:
                            val = float(p.strip())
                        except:
                            val = float('nan')
                        readings.append(val)
                        
                        # Trigger live channel update
                        ch = selected_channels[i]
                        if self.on_live_ch:
                            self.on_live_ch(ch, val)
                    
                    if not self.is_running: break
                    
                    elapsed_h = (datetime.now() - start_time).total_seconds() / 3600.0
                    writer.writerow([f"{elapsed_h:.6f}"] + readings)
                    f.flush()
                    
                    now_str = datetime.now().strftime('%H:%M:%S')
                    if self.on_data:
                        self.on_data(now_str, readings, elapsed_h)
                    
                    # Sleep slightly between scan sweeps
                    time.sleep(1.0)
                    
        except Exception as e:
            logger.error(f"[SmartLogger Error] {e}")
            if self.on_error: self.on_error(str(e))
        finally:
            if daq:
                try: 
                    daq.write('SYST:LOC') # 로컬 모드로 복구
                    if selected_channels:
                        daq.write(f'ROUT:OPEN (@{",".join(selected_channels)})')
                    daq.close()
                except: pass
            self.is_running = False
            if self.on_stop: self.on_stop()
