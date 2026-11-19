// Starter firmware: StickS3 tilt controller (not an absolute screen pointer).
// Arduino: M5Stack board package >=3.2.5, board M5StickS3,
// M5Unified >=0.2.12 and M5GFX >=0.2.18. Enable USB CDC On Boot.
// Not compiled or flashed against hardware in the cloud.
#include <M5Unified.h>
#include <math.h>
float centerX=0, centerY=0, sx=.5f, sy=.5f;
bool centered=false;
void setup() {
  auto cfg=M5.config();
  M5.begin(cfg);
  Serial.begin(115200);
  M5.Display.setRotation(1);
  M5.Display.setTextSize(2);
  M5.Display.println("PULSE WAND");
  M5.Display.println("B: center");
  M5.Display.println("A: duck");
}
void loop() {
  M5.update();
  if(M5.Imu.update()) {
    auto data=M5.Imu.getImuData();
    // Gravity-based two-axis tilt. Hold still; press B to re-center.
    float tx=atan2f(data.accel.x, sqrtf(data.accel.y*data.accel.y+data.accel.z*data.accel.z));
    float ty=atan2f(data.accel.y, sqrtf(data.accel.x*data.accel.x+data.accel.z*data.accel.z));
    if(!centered || M5.BtnB.wasPressed()) { centerX=tx; centerY=ty; centered=true; }
    float x=constrain(.5f+(tx-centerX)/1.4f,0.f,1.f);
    float y=constrain(.5f+(ty-centerY)/1.4f,0.f,1.f);
    sx+=.22f*(x-sx); sy+=.22f*(y-sy);
    Serial.printf("{\"x\":%.4f,\"y\":%.4f,\"duck\":%s}\n",sx,sy,M5.BtnA.isPressed()?"true":"false");
  }
  delay(20);
}
