# ROBO Drive - Landscape Fixed (PlatformIO)

This version fixes the **missing/covered car** on phones. The 3D car was hidden under an oversized steering panel due to a mobile CSS grid conflict. Speed and steering now sit in the side corners; the middle of the game stays open. The ESP32 hardware controls are unchanged.

## Upload

1. In VS Code choose **File > Open Folder**, and select `ROBO_Drive_Fixed_Landscape_PlatformIO` (the directory with `platformio.ini`).
2. Connect your classic ESP32-WROOM / ESP32 DevKit (4MB flash) to USB.
3. In PlatformIO Project Tasks, choose `esp32dev > General > Upload` to upload firmware.
4. In PlatformIO Project Tasks, choose `esp32dev > Platform > Upload Filesystem Image` to upload the game assets.
5. Reboot ESP32 and reconnect your phone to the Wi-Fi below. Close and reopen the old game page; if it appears cached, clear site data for `192.168.4.1`.

**When only the page styling or JavaScript changes**, you only need to do Step 4 (`Upload Filesystem Image`), not the firmware upload.

## Wi-Fi
- Name: `ROBO-Drive-ESP32`
- Password: `drive2026`
- Open `http://192.168.4.1` on your phone, in landscape.

The phone will show **No Internet** for the ESP32 hotspot. This is normal and the local game still works.

## ESP32 pins
- Encoder CLK GPIO 32; DT GPIO 33; SW GPIO 25; VCC 3.3V; GND GND
- Accelerator: GPIO 26 to momentary button to GND
- Brake: GPIO 27 to momentary button to GND

If you use an ESP32-S3/C3 or a board without 4MB flash, verify the board/pins and firmware configuration first.

## Test
- Choose **chase camera** to see your car. The **hood camera** intentionally hides the external car.
- Release both hardware buttons after connecting Wi-Fi; otherwise the controller stays disarmed for safety.
- The browser game is a 2D canvas software 3D renderer. No internet resources or Three.js downloads are needed.
