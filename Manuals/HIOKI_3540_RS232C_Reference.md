# HIOKI 3540 mΩ HiTESTER RS-232C Communication Reference Guide

**DO NOT MODIFY THIS FILE. THIS IS A READ-ONLY REFERENCE.**

## 1. RS-232C Interface Specifications (Fixed)
- **Transmission Mode**: Start-stop synchronization, Full duplex
- **Baud Rate**: **9600 bps (Fixed, cannot be changed)**
- **Data Length**: 8 bit
- **Parity**: None
- **Stop Bit**: 1 bit
- **Flow Control**: None
- **Cable Required**: Cross (Null-modem) cable with D-sub 9-Pin connector.
- **Delimiter (CR/LF)**: HIOKI 3540 responds with `\r\n`. Sending `\r` or `\r\n` is accepted, but `\r` alone is recommended for preventing buffer misreads on older models.

## 2. Firmware-Specific Command Discrepancies
The HIOKI 3540 has differing firmware/hardware versions over its lifecycle. Depending on the device, one of the two command sets below must be used. Sending commands from the wrong set will result in a `CMD ERR`.

### Set A (Typically modern/standard documentation)
- **Measurement Output**: `D`
- **Sampling Speed**: `S F` (Fast) / `S S` (Slow)
- **Range Setting**: `R 0` to `R 6`

### Set B (Legacy/Alternate versions - *Currently used by this UI*)
- **Measurement Output**: `RMES`
- **Sampling Speed**: `SMP 1` (Fast) / `SMP 0` (Slow)
- **Range Setting**: `RNG 0` to `RNG 6`

*IMPORTANT: Do NOT mix SCPI-style commands like `:HEAD OFF`. The 3540 does not natively support complex SCPI syntax without triggering `CMD ERR`.*

## 3. Data Format & Parsing Rules
When the device responds to a measurement command (`RMES` or `D`), the data is returned in an exponential ascii format:
`±XXXXX E±XX\r\n`

**Regex Parsing Recommendation**: `r'([+-]?\d+\.?\d*[Ee][+-]?\d+)'`
**Example**: `+1.2345E-01` translates to `0.12345 Ω`.

### Edge Cases and Error Responses
- `+OF\r\n`: Over Flow (Overload). Value exceeds the current measurement range.
- `+----\r\n`: Current Error (CCERR). Probe contact failure, open circuit, or broken lead.
- `CMD ERR\r\n`: Command Error. The device did not understand the query.

## 4. Range Index Reference (`RNG` / `R`)
| Code | Range | Resolution | Current |
|---|---|---|---|
| `0` | 30 mΩ | 10 µΩ | 100 mA |
| `1` | 300 mΩ | 100 µΩ | 100 mA |
| `2` | 3 Ω | 1 mΩ | 1 mA |
| `3` | 30 Ω | 10 mΩ | 1 mA |
| `4` | 300 Ω | 100 mΩ | 1 mA |
| `5` | 3 kΩ | 1 Ω | 10 µA |
| `6` | 30 kΩ | 10 Ω | 10 µA |

## 5. Sampling Speed Performance
- **FAST (1 / F)**: ~16 samples/sec (approx. 80ms processing time)
- **SLOW (0 / S)**: ~4 samples/sec (approx. 300ms processing time)

> **Programming Note**: Always allow a delay of at least 80-100ms when transmitting commands to prevent overrun, and set serial timeout high enough (e.g., 1.0s or 2.0s) to absorb mechanical relays engaging on range changes.
