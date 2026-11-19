#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <M5Unified.h>
#include <VL53L0X.h>
#include <Wire.h>
#include <cmath>

// Wand firmware: on-device orientation tracking.
//
// The BMI270 gyro produces ~200 samples/s. Every sample feeds a Mahony AHRS
// filter (gyro integration + gravity correction from the accelerometer, but
// only while the stick is not accelerating). From the resulting orientation we
// report, for each body axis (x, y, z), its compass-style HEADING around the
// vertical and its ELEVATION above the horizon. These are functions of the
// pose itself, so aiming at the same spot always reads the same — unlike
// summing yaw rates, which drifts with the path you took to get there.
// Gyro bias is learned on-device whenever the stick is still.
//
// Optional ToF Distance HAT (VL53L0X) on the front: distance to whatever the
// wand points at, read non-blocking in long-range mode (~2 m, ~30 Hz).
//
// Output at 100 Hz over BOTH transports:
//  - USB serial: newline-delimited JSON {"type":"ori", ...}
//  - Bluetooth LE: 16-byte notifications on kOriCharUuid (see OriPacket)
// The laptop bridge (pointer/pointer_bridge.py) accepts either.

namespace {
constexpr uint32_t kReportIntervalMs = 10;  // 100 Hz
constexpr char kDeviceName[] = "StickS3-Wand";
constexpr char kServiceUuid[] = "6e9b0001-5a1d-4c8e-9b1a-57a9c4e5a301";
constexpr char kOriCharUuid[] = "6e9b0003-5a1d-4c8e-9b1a-57a9c4e5a301";

// Mahony gains. Gravity correction only while |accel| ≈ 1 g.
constexpr float kKpMoving = 0.6f;
constexpr float kKpStill = 3.0f;
constexpr float kStillGyroDps = 2.5f;     // raw rate below this…
constexpr float kStillAccelTol = 0.03f;   // …and |a| within 1 g ± this…
constexpr int kStillSamples = 100;        // …for 0.5 s at 200 Hz = still
constexpr float kBiasRate = 0.004f;

// Little-endian, fits the default 20-byte BLE payload.
struct __attribute__((packed)) OriPacket {
  uint16_t ms;            // millis() & 0xFFFF
  int16_t heading[3];     // degrees * 100, body x/y/z axis heading (−180..180)
  int16_t elevation[3];   // degrees * 100, body x/y/z axis elevation (−90..90)
  uint8_t buttons;        // bit0 = A held, bit1 = still
  uint8_t recenterCount;  // increments on each B press
  uint16_t distanceMm;    // ToF distance; 0 = no sensor / out of range
};
static_assert(sizeof(OriPacket) == 18, "packet layout");

// ToF HAT wiring on StickS3: an 8-pin StickC HAT sits on the odd column of the
// 16-pin Hat2 header, so StickC G0 (SDA) -> GPIO8 and G26 (SCL) -> GPIO0 (Boot),
// powered from 3V3_L2 (PM1 LDO). Grove Port A (SDA 9 / SCL 10) is a fallback.
// Uses Arduino `Wire` (I2C controller 0): M5Unified's internal bus (IMU, PM1 on
// G47/G48) owns controller 1 on ESP32-S3, so `Wire1` reads got hijacked (0xFF).
constexpr uint8_t kTofAddr = 0x29;
VL53L0X tof;
bool tofReady = false;
int tofSda = -1, tofScl = -1;
uint16_t distanceMm = 0;
uint16_t tofRawMm = 0;      // diagnostics: last raw reading before filtering
uint8_t tofLastInt = 0;     // last RESULT_INTERRUPT_STATUS
uint8_t tofRangeStatus = 0; // last RESULT_RANGE_STATUS (bits 6:3 = device status)
uint32_t tofReads = 0;
uint32_t lastTofPollMs = 0;
uint32_t lastDistanceDrawMs = 0;
char i2cScan[96] = "";

struct Quat { float w = 1, x = 0, y = 0, z = 0; } q;
float bias[3] = {0, 0, 0};  // deg/s
float lastAccel[3] = {0, 0, 1};
float lastGyro[3] = {0, 0, 0};
int stillCount = 0;
uint32_t lastGyroMicros = 0;
bool orientationReady = false;

uint32_t lastReportMs = 0;
uint32_t lastDiagnosticMs = 0;
uint32_t gyroSamples = 0;
bool imuReady = false;
uint8_t recenterCount = 0;
BLECharacteristic* oriCharacteristic = nullptr;
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

// Start with gravity aligned to the accelerometer (heading arbitrary = 0).
void initOrientation(float ax, float ay, float az) {
  const float roll = atan2f(ay, az);
  const float pitch = atan2f(-ax, sqrtf(ay * ay + az * az));
  const float cr = cosf(roll / 2), sr = sinf(roll / 2);
  const float cp = cosf(pitch / 2), sp = sinf(pitch / 2);
  q.w = cr * cp;
  q.x = sr * cp;
  q.y = cr * sp;
  q.z = -sr * sp;
  orientationReady = true;
}

// Mahony AHRS update. gyro in deg/s (bias removed), accel in g, dt in s.
void mahonyUpdate(float gx, float gy, float gz, float ax, float ay, float az, float dt, bool still) {
  constexpr float kDegToRad = 0.017453292f;
  gx *= kDegToRad;
  gy *= kDegToRad;
  gz *= kDegToRad;
  const float norm = sqrtf(ax * ax + ay * ay + az * az);
  // Trust gravity only when the stick isn't being accelerated by the hand.
  if (norm > 0.85f && norm < 1.15f) {
    ax /= norm;
    ay /= norm;
    az /= norm;
    // Gravity direction predicted by the current orientation (body frame).
    const float vx = 2 * (q.x * q.z - q.w * q.y);
    const float vy = 2 * (q.w * q.x + q.y * q.z);
    const float vz = q.w * q.w - q.x * q.x - q.y * q.y + q.z * q.z;
    const float ex = ay * vz - az * vy;
    const float ey = az * vx - ax * vz;
    const float ez = ax * vy - ay * vx;
    const float trust = 1.0f - fminf(1.0f, fabsf(norm - 1.0f) / 0.15f);
    const float kp = (still ? kKpStill : kKpMoving) * trust;
    gx += kp * ex;
    gy += kp * ey;
    gz += kp * ez;
  }
  const float qw = q.w, qx = q.x, qy = q.y, qz = q.z;
  q.w += 0.5f * (-qx * gx - qy * gy - qz * gz) * dt;
  q.x += 0.5f * (qw * gx + qy * gz - qz * gy) * dt;
  q.y += 0.5f * (qw * gy - qx * gz + qz * gx) * dt;
  q.z += 0.5f * (qw * gz + qx * gy - qy * gx) * dt;
  const float n = sqrtf(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  q.w /= n;
  q.x /= n;
  q.y /= n;
  q.z /= n;
}

// Body axis `i` expressed in the world frame (column i of the rotation matrix).
void bodyAxisInWorld(int i, float out[3]) {
  const float w = q.w, x = q.x, y = q.y, z = q.z;
  if (i == 0) {
    out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y + w * z); out[2] = 2 * (x * z - w * y);
  } else if (i == 1) {
    out[0] = 2 * (x * y - w * z); out[1] = 1 - 2 * (x * x + z * z); out[2] = 2 * (y * z + w * x);
  } else {
    out[0] = 2 * (x * z + w * y); out[1] = 2 * (y * z - w * x); out[2] = 1 - 2 * (x * x + y * y);
  }
}

void processImu() {
  const auto mask = M5.Imu.update();
  if (!mask) return;
  const auto data = M5.Imu.getImuData();
  if (mask & m5::IMU_Class::sensor_mask_accel) {
    lastAccel[0] = data.accel.x;
    lastAccel[1] = data.accel.y;
    lastAccel[2] = data.accel.z;
  }
  if (!(mask & m5::IMU_Class::sensor_mask_gyro)) return;
  const uint32_t now = micros();
  const float dt = lastGyroMicros ? fminf(0.02f, (now - lastGyroMicros) * 1e-6f) : 0.005f;
  lastGyroMicros = now;
  gyroSamples++;
  lastGyro[0] = data.gyro.x;
  lastGyro[1] = data.gyro.y;
  lastGyro[2] = data.gyro.z;

  const float* a = lastAccel;
  const float accelNorm = sqrtf(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const float rate = sqrtf(lastGyro[0] * lastGyro[0] + lastGyro[1] * lastGyro[1] + lastGyro[2] * lastGyro[2]);
  // Judge stillness on the RAW rate so a wrong bias can't lock itself in.
  stillCount = (rate < kStillGyroDps && fabsf(accelNorm - 1.0f) < kStillAccelTol) ? stillCount + 1 : 0;
  const bool still = stillCount > kStillSamples;
  if (still) {
    for (int i = 0; i < 3; i++) bias[i] += (lastGyro[i] - bias[i]) * kBiasRate;
  }
  if (!orientationReady) initOrientation(a[0], a[1], a[2]);
  mahonyUpdate(lastGyro[0] - bias[0], lastGyro[1] - bias[1], lastGyro[2] - bias[2], a[0], a[1], a[2], dt, still);
}

bool probeTof(int sda, int scl) {
  Wire.end();
  Wire.begin(sda, scl, 400000);
  Wire.beginTransmission(kTofAddr);
  return Wire.endTransmission() == 0;
}

void scanBus() {
  size_t n = 0;
  i2cScan[0] = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0 && n < sizeof(i2cScan) - 6) n += snprintf(i2cScan + n, sizeof(i2cScan) - n, "%s%02x", n ? " " : "", addr);
  }
}

void setupTof() {
  // The header's 3.3 V rail comes from the PM1 LDO, which StickS3 init leaves off.
  M5.Power.M5pm1.setLDOOutput(true);
  delay(30);  // VL53L0X boot time after power-up
  const int pairs[][2] = {{8, 0}, {0, 8}, {9, 10}, {10, 9}};  // {SDA, SCL}
  for (auto& p : pairs) {
    if (probeTof(p[0], p[1])) { tofSda = p[0]; tofScl = p[1]; break; }
  }
  if (tofSda < 0) {
    probeTof(8, 0);
    scanBus();  // report whatever else is on the bus, for diagnosis
    return;
  }
  scanBus();
  tof.setBus(&Wire);
  tof.setTimeout(50);
  if (!tof.init()) return;
  // Long-range profile (~2 m): lower return-signal limit, longer VCSEL pulses.
  tof.setSignalRateLimit(0.1);
  tof.setVcselPulsePeriod(VL53L0X::VcselPeriodPreRange, 18);
  tof.setVcselPulsePeriod(VL53L0X::VcselPeriodFinalRange, 14);
  tof.setMeasurementTimingBudget(33000);
  tof.startContinuous(0);
  tofReady = true;
}

// Non-blocking read: only fetch when the sensor flags a new measurement.
void pollTof() {
  if (!tofReady || millis() - lastTofPollMs < 10) return;
  lastTofPollMs = millis();
  tofLastInt = tof.readReg(VL53L0X::RESULT_INTERRUPT_STATUS);
  if ((tofLastInt & 0x07) == 0) return;
  tofRangeStatus = tof.readReg(VL53L0X::RESULT_RANGE_STATUS);
  const uint16_t mm = tof.readReg16Bit(VL53L0X::RESULT_RANGE_STATUS + 10);
  tofRawMm = mm;
  tofReads++;
  tof.writeReg(VL53L0X::SYSTEM_INTERRUPT_CLEAR, 0x01);
  distanceMm = (mm >= 8000 || mm == 0) ? 0 : mm;  // 8190/8191 = nothing in range
}

void drawDistance() {
  M5.Display.setTextSize(1);
  M5.Display.setCursor(10, 99);
  M5.Display.setTextColor(tofReady ? TFT_YELLOW : TFT_DARKGREY, TFT_BLACK);
  if (!tofReady) M5.Display.printf("ToF: not found (i2c: %s)      ", i2cScan[0] ? i2cScan : "none");
  else if (distanceMm) M5.Display.printf("ToF: %4u mm               ", distanceMm);
  else M5.Display.printf("ToF: out of range         ");
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
  M5.Display.printf("IMU: %s  AHRS 200Hz", imuReady ? "READY" : "ERROR");
  M5.Display.setCursor(10, 82);
  M5.Display.setTextColor(bleConnected ? TFT_CYAN : TFT_DARKGREY, TFT_BLACK);
  M5.Display.printf("BLE: %s", bleConnected ? "CONNECTED   " : "advertising ");
  drawnBleState = bleConnected;
  drawDistance();
}

void setupBle() {
  BLEDevice::init(kDeviceName);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(kServiceUuid);
  oriCharacteristic = service->createCharacteristic(
      kOriCharUuid, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  oriCharacteristic->addDescriptor(new BLE2902());
  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(kServiceUuid);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void report() {
  float heading[3], elevation[3];
  for (int i = 0; i < 3; i++) {
    float axis[3];
    bodyAxisInWorld(i, axis);
    heading[i] = atan2f(axis[1], axis[0]) * RAD_TO_DEG;
    elevation[i] = asinf(fmaxf(-1.0f, fminf(1.0f, axis[2]))) * RAD_TO_DEG;
  }
  const bool trigger = M5.BtnA.isPressed();
  const bool still = stillCount > kStillSamples;

  if (bleConnected && oriCharacteristic != nullptr) {
    OriPacket packet{};
    packet.ms = static_cast<uint16_t>(millis() & 0xFFFF);
    for (int i = 0; i < 3; i++) {
      packet.heading[i] = clamp16(heading[i] * 100);
      packet.elevation[i] = clamp16(elevation[i] * 100);
    }
    packet.buttons = (trigger ? 1 : 0) | (still ? 2 : 0);
    packet.recenterCount = recenterCount;
    packet.distanceMm = distanceMm;
    oriCharacteristic->setValue(reinterpret_cast<uint8_t*>(&packet), sizeof(packet));
    oriCharacteristic->notify();
  }

  if (Serial) {
    Serial.printf(
        "{\"type\":\"ori\",\"ms\":%lu,\"h\":[%.2f,%.2f,%.2f],\"e\":[%.2f,%.2f,%.2f],"
        "\"still\":%s,\"trigger\":%s,\"rc\":%u,\"d\":%u,"
        "\"raw\":[%.3f,%.3f,%.3f,%.2f,%.2f,%.2f]}\n",
        static_cast<unsigned long>(millis()), heading[0], heading[1], heading[2],
        elevation[0], elevation[1], elevation[2], still ? "true" : "false",
        trigger ? "true" : "false", recenterCount, distanceMm, lastAccel[0], lastAccel[1], lastAccel[2],
        lastGyro[0], lastGyro[1], lastGyro[2]);
  }
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
  setupTof();
  setupBle();
  drawStatus();
  Serial.printf(
      "{\"type\":\"ready\",\"device\":\"StickS3\",\"imuReady\":%s,\"imuType\":%d,"
      "\"mode\":\"ahrs\",\"reportHz\":100,\"ble\":\"%s\",\"tof\":%s,\"tofPins\":[%d,%d],\"i2c\":\"%s\"}\n",
      imuReady ? "true" : "false", static_cast<int>(M5.Imu.getType()), kDeviceName,
      tofReady ? "true" : "false", tofSda, tofScl, i2cScan);
}

void loop() {
  M5.update();
  if (M5.BtnB.wasPressed()) recenterCount++;
  if (drawnBleState != bleConnected) drawStatus();
  if (imuReady) processImu();
  pollTof();
  if (millis() - lastDistanceDrawMs >= 200) {
    lastDistanceDrawMs = millis();
    drawDistance();
  }

  const uint32_t now = millis();
  if (now - lastDiagnosticMs >= 1000) {
    Serial.printf("{\"type\":\"status\",\"gyroHz\":%lu,\"ble\":%s,\"bias\":[%.3f,%.3f,%.3f],\"tof\":%s,\"d\":%u,\"i2c\":\"%s\",\"tofRaw\":%u,\"tofReads\":%lu,\"tofInt\":%u,\"tofRs\":%u,\"tofTimeout\":%s}\n",
                  static_cast<unsigned long>(gyroSamples * 1000 / (now - lastDiagnosticMs)),
                  bleConnected ? "true" : "false", bias[0], bias[1], bias[2],
                  tofReady ? "true" : "false", distanceMm, i2cScan, tofRawMm,
                  static_cast<unsigned long>(tofReads), tofLastInt, tofRangeStatus,
                  tof.timeoutOccurred() ? "true" : "false");
    tofReads = 0;
    gyroSamples = 0;
    lastDiagnosticMs = now;
  }
  if (orientationReady && now - lastReportMs >= kReportIntervalMs) {
    lastReportMs = now;
    report();
  }
}
