#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <M5Unified.h>
#include <cmath>

// Streams the BMI270 IMU at 50 Hz over BOTH transports:
//  - USB serial: newline-delimited JSON (unchanged format)
//  - Bluetooth LE: 16-byte binary notifications (see WandPacket)
// The laptop bridge (pointer/pointer_bridge.py) accepts either.

namespace {
constexpr uint32_t kSampleIntervalMs = 20;  // 50 Hz
constexpr char kDeviceName[] = "StickS3-Wand";
constexpr char kServiceUuid[] = "6e9b0001-5a1d-4c8e-9b1a-57a9c4e5a301";
constexpr char kImuCharUuid[] = "6e9b0002-5a1d-4c8e-9b1a-57a9c4e5a301";

// Little-endian, fits the default 20-byte BLE payload.
struct __attribute__((packed)) WandPacket {
  uint16_t ms;            // millis() & 0xFFFF
  int16_t accel[3];       // g * 4096   (±8 g)
  int16_t gyro[3];        // deg/s * 16 (±2048 deg/s)
  uint8_t buttons;        // bit0 = A held
  uint8_t recenterCount;  // increments on each B press
};
static_assert(sizeof(WandPacket) == 16, "packet layout");

uint32_t lastSampleMs = 0;
uint32_t lastDiagnosticMs = 0;
bool imuReady = false;
uint8_t recenterCount = 0;
BLECharacteristic* imuCharacteristic = nullptr;
volatile bool bleConnected = false;
bool drawnBleState = false;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { bleConnected = true; }
  void onDisconnect(BLEServer*) override {
    bleConnected = false;
    BLEDevice::startAdvertising();
  }
};

int16_t clamp16(float value) {
  return static_cast<int16_t>(fmaxf(-32768.0f, fminf(32767.0f, roundf(value))));
}

void drawStatus() {
  M5.Display.setRotation(1);
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_GREEN, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(10, 12);
  M5.Display.println("WAND");
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(10, 48);
  M5.Display.println("A: trigger  B: recenter");
  M5.Display.setCursor(10, 65);
  M5.Display.printf("IMU: %s", imuReady ? "READY" : "ERROR");
  M5.Display.setCursor(10, 82);
  M5.Display.setTextColor(bleConnected ? TFT_CYAN : TFT_DARKGREY, TFT_BLACK);
  M5.Display.printf("BLE: %s", bleConnected ? "CONNECTED   " : "advertising ");
  drawnBleState = bleConnected;
}

void setupBle() {
  BLEDevice::init(kDeviceName);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(kServiceUuid);
  imuCharacteristic = service->createCharacteristic(
      kImuCharUuid, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  imuCharacteristic->addDescriptor(new BLE2902());
  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(kServiceUuid);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}
}  // namespace

void setup() {
  auto config = M5.config();
  M5.begin(config);
  Serial.begin(115200);
  // Never let serial writes stall the loop (and BLE) when the cable is plugged
  // in but nothing on the laptop is reading. Note: 0 is NOT "non-blocking" in
  // HWCDC 2.0.x — its retry counter underflows and waits ~forever. Use 1 ms.
  Serial.setTxTimeoutMs(1);
  delay(300);

  // M5.begin() performs board detection and initializes the built-in IMU.
  // Calling M5.Imu.begin() a second time can reset the already-active device.
  imuReady = M5.Imu.getType() != m5::imu_t::imu_none;
  setupBle();
  drawStatus();
  Serial.printf(
      "{\"type\":\"ready\",\"device\":\"StickS3\",\"board\":%d,"
      "\"imuReady\":%s,\"imuType\":%d,\"rateHz\":50,\"ble\":\"%s\"}\n",
      static_cast<int>(M5.getBoard()), imuReady ? "true" : "false",
      static_cast<int>(M5.Imu.getType()), kDeviceName);
}

void loop() {
  M5.update();
  const bool recenter = M5.BtnB.wasPressed();
  if (recenter) recenterCount++;
  if (drawnBleState != bleConnected) drawStatus();

  if (millis() - lastDiagnosticMs >= 1000) {
    lastDiagnosticMs = millis();
    Serial.printf("{\"type\":\"status\",\"imuReady\":%s,\"ble\":%s,\"ms\":%lu}\n",
                  imuReady ? "true" : "false", bleConnected ? "true" : "false",
                  static_cast<unsigned long>(millis()));
  }
  if (!imuReady || millis() - lastSampleMs < kSampleIntervalMs) {
    delay(1);
    return;
  }
  lastSampleMs = millis();

  if (!M5.Imu.update()) return;
  const auto data = M5.Imu.getImuData();
  const float ax = data.accel.x;
  const float ay = data.accel.y;
  const float az = data.accel.z;
  const bool trigger = M5.BtnA.isPressed();

  if (bleConnected && imuCharacteristic != nullptr) {
    WandPacket packet{};
    packet.ms = static_cast<uint16_t>(millis() & 0xFFFF);
    packet.accel[0] = clamp16(ax * 4096);
    packet.accel[1] = clamp16(ay * 4096);
    packet.accel[2] = clamp16(az * 4096);
    packet.gyro[0] = clamp16(data.gyro.x * 16);
    packet.gyro[1] = clamp16(data.gyro.y * 16);
    packet.gyro[2] = clamp16(data.gyro.z * 16);
    packet.buttons = trigger ? 1 : 0;
    packet.recenterCount = recenterCount;
    imuCharacteristic->setValue(reinterpret_cast<uint8_t*>(&packet), sizeof(packet));
    imuCharacteristic->notify();
  }

  if (Serial) {
    const float roll = atan2f(ay, az) * RAD_TO_DEG;
    const float pitch = atan2f(-ax, sqrtf(ay * ay + az * az)) * RAD_TO_DEG;
    Serial.printf(
        "{\"type\":\"imu\",\"ms\":%lu,\"pitch\":%.3f,\"roll\":%.3f,"
        "\"ax\":%.4f,\"ay\":%.4f,\"az\":%.4f,\"gx\":%.3f,"
        "\"gy\":%.3f,\"gz\":%.3f,\"trigger\":%s,\"recenter\":%s}\n",
        static_cast<unsigned long>(millis()), pitch, roll, ax, ay, az,
        data.gyro.x, data.gyro.y, data.gyro.z, trigger ? "true" : "false",
        recenter ? "true" : "false");
  }
}
