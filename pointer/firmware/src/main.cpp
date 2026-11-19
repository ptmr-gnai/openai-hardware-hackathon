#include <Arduino.h>
#include <M5Unified.h>
#include <cmath>

namespace {
constexpr uint32_t kSampleIntervalMs = 20;  // 50 Hz
uint32_t lastSampleMs = 0;
bool imuReady = false;

void drawStatus() {
  M5.Display.setRotation(1);
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_GREEN, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(10, 12);
  M5.Display.println("POINTER / USB");
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(10, 48);
  M5.Display.println("Tilt to aim");
  M5.Display.setCursor(10, 65);
  M5.Display.println("A: trigger  B: recenter");
  M5.Display.setCursor(10, 92);
  M5.Display.printf("IMU: %s", imuReady ? "READY" : "ERROR");
}
}  // namespace

void setup() {
  auto config = M5.config();
  M5.begin(config);
  Serial.begin(115200);
  delay(300);

  imuReady = M5.Imu.begin();
  drawStatus();
  Serial.println("{\"type\":\"ready\",\"device\":\"StickS3\",\"rateHz\":50}");
}

void loop() {
  M5.update();
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
  const float roll = atan2f(ay, az) * RAD_TO_DEG;
  const float pitch = atan2f(-ax, sqrtf(ay * ay + az * az)) * RAD_TO_DEG;

  Serial.printf(
      "{\"type\":\"imu\",\"ms\":%lu,\"pitch\":%.3f,\"roll\":%.3f,"
      "\"ax\":%.4f,\"ay\":%.4f,\"az\":%.4f,\"gx\":%.3f,"
      "\"gy\":%.3f,\"gz\":%.3f,\"trigger\":%s,\"recenter\":%s}\n",
      static_cast<unsigned long>(millis()), pitch, roll, ax, ay, az,
      data.gyro.x, data.gyro.y, data.gyro.z,
      M5.BtnA.isPressed() ? "true" : "false",
      M5.BtnB.wasPressed() ? "true" : "false");
}

