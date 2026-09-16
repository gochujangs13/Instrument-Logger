"""Regression test for Windows COM ports omitted from NI-VISA discovery."""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class _FakeRegistryKey:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeVisaResource:
    def __init__(self, reply_termination):
        self.reply_termination = reply_termination
        self.timeout = None
        self.baud_rate = None
        self.read_termination = None
        self.write_termination = None
        self.commands = []
        self.clear_count = 0
        self.closed = False

    def write(self, command):
        self.commands.append(command)

    def query(self, command):
        self.commands.append(command)
        if self.read_termination != self.reply_termination:
            raise TimeoutError("simulated reply terminator mismatch")
        return "0"

    def clear(self):
        self.clear_count += 1

    def close(self):
        self.closed = True


class _FakeVisaManager:
    def __init__(self, reply_termination):
        self.reply_termination = reply_termination
        self.resources = []

    def open_resource(self, _address):
        resource = _FakeVisaResource(self.reply_termination)
        self.resources.append(resource)
        return resource


def main():
    values = [
        (r"\Device\VCP0", "COM12", 1),
        (r"\Device\Serial0", "COM3", 1),
        (r"\Device\Parallel0", "LPT1", 1),
        (r"\Device\Duplicate", "com3", 1),
    ]

    def enum_value(_key, index):
        if index >= len(values):
            raise OSError("end of registry values")
        return values[index]

    with (
        patch("winreg.OpenKey", return_value=_FakeRegistryKey()),
        patch("winreg.EnumValue", side_effect=enum_value),
    ):
        assert server._windows_serial_ports() == ["COM3", "COM12"]
        assert server._serial_port_resources() == [
            {"port": "COM3", "address": "ASRL3::INSTR"},
            {"port": "COM12", "address": "ASRL12::INSTR"},
        ]

    with patch("server.time.sleep", return_value=None):
        # LF replies are the current physical 2400 setting. Commands must still
        # use CR and the first command must always force OUTPUT OFF.
        lf_manager = _FakeVisaManager("\n")
        lf_resource, lf_label = server._open_visa_resource(
            lf_manager, "ASRL4::INSTR", "auto"
        )
        assert lf_label == "LF"
        assert lf_resource.commands[:2] == [":OUTP OFF", ":OUTP?"]
        assert lf_resource.write_termination == "\r"
        assert lf_resource.read_termination == "\n"
        assert lf_resource.timeout == server._VISA_LONG_TIMEOUT_MS

        # A CR-reply unit first rejects LF, closes that session, then succeeds
        # with CR; each candidate independently starts with OUTPUT OFF.
        cr_manager = _FakeVisaManager("\r")
        cr_resource, cr_label = server._open_visa_resource(
            cr_manager, "ASRL4::INSTR", "auto"
        )
        assert cr_label == "CR"
        assert len(cr_manager.resources) == 2
        assert cr_manager.resources[0].commands[:2] == [":OUTP OFF", ":OUTP?"]
        assert cr_manager.resources[0].closed is True
        assert cr_resource.commands[:2] == [":OUTP OFF", ":OUTP?"]
        assert cr_resource.write_termination == "\r"

        # GPIB and non-opted-in ASRL behavior remains unchanged.
        gpib_manager = _FakeVisaManager("\n")
        gpib_resource, gpib_label = server._open_visa_resource(
            gpib_manager, "GPIB0::2::INSTR", "auto"
        )
        assert gpib_label is None
        assert gpib_resource.read_termination == "\n"
        assert gpib_resource.write_termination == "\n"
        assert gpib_resource.commands == []

    print("COM port discovery and VISA ASRL termination tests passed")


if __name__ == "__main__":
    main()
