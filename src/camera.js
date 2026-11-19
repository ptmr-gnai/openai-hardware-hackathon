import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { clamp } from './engine.js';
export class CameraInput {
  constructor(video,onStatus) { this.video=video; this.onStatus=onStatus; this.hands=[]; this.duck=false; this.baseline=null; this.samples=[]; this.lastSeen=0; this.lastFrame=-1; this.running=false; }
  async start() {
    try {
      this.onStatus('Loading local pose model…');
      const files=await FilesetResolver.forVisionTasks('/wasm');
      this.model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6});
      this.stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});
      this.video.srcObject=this.stream; await this.video.play(); this.running=true; this.calibrate(); this.loop();
    } catch(e) { this.stop(); throw e; }
  }
  calibrate() { this.baseline=null; this.samples=[]; this.onStatus('Stand upright — calibrating…'); }
  loop() {
    if(!this.running) return;
    try {
      if(this.video.currentTime!==this.lastFrame) {
        this.lastFrame=this.video.currentTime;
        const p=this.model.detectForVideo(this.video,performance.now()).landmarks[0];
        if(p && p[0].visibility>.6 && p[11].visibility>.6 && p[12].visibility>.6) {
          this.lastSeen=performance.now();
          this.hands=[15,16].filter(i=>p[i].visibility>.55).map(i=>({x:clamp(1-p[i].x),y:clamp(p[i].y)}));
          if(this.baseline===null) {
            this.samples.push(p[0].y);
            if(this.samples.length>=45) { this.baseline=this.samples.reduce((a,b)=>a+b,0)/this.samples.length; this.onStatus('Tracking · either hand to reach'); }
          }
          const shoulderWidth=Math.abs(p[11].x-p[12].x);
          this.duck=this.baseline!==null && p[0].y-this.baseline>Math.max(.07,shoulderWidth*.35);
        } else { this.hands=[]; this.duck=false; this.onStatus('Step into view · show head & hands'); }
      }
    } catch(e) { this.onStatus('Tracking interrupted · try reconnecting'); this.stop(); return; }
    this.raf=requestAnimationFrame(()=>this.loop());
  }
  get fresh() { return this.running && performance.now()-this.lastSeen<600 && this.baseline!==null; }
  stop() { this.running=false; cancelAnimationFrame(this.raf); this.stream?.getTracks().forEach(t=>t.stop()); this.video.srcObject=null; this.model?.close(); this.model=null; this.hands=[]; this.duck=false; }
}
