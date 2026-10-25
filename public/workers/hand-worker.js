// 손 인식 Web Worker
// 카메라 이미지 처리를 별도 스레드에서 수행하여 60fps 3D 렌더링 프레임 드랍을 원천 방지합니다.

let lm = null;

self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try {
      const code = await (await fetch(d.cjs)).text();
      const module = { exports: {} };
      (new Function('module', 'exports', code))(module, module.exports);
      const { FilesetResolver, HandLandmarker } = module.exports;
      const files = await FilesetResolver.forVisionTasks(d.wasm);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: d.model, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      let delegate = 'GPU';
      try {
        lm = await HandLandmarker.createFromOptions(files, opts('GPU'));
      } catch (err) {
        delegate = 'CPU';
        lm = await HandLandmarker.createFromOptions(files, opts('CPU'));
      }
      self.postMessage({ type: 'ready', delegate });
    } catch (err) {
      self.postMessage({ type: 'error', message: String((err && err.message) || err) });
    }
  } else if (d.type === 'frame') {
    const t0 = performance.now();
    let res = null;
    try {
      res = lm.detectForVideo(d.bitmap, d.ts);
    } catch (err) {
      // frame detection error catch
    }
    if (d.bitmap && typeof d.bitmap.close === 'function') {
      d.bitmap.close();
    }
    self.postMessage({
      type: 'result',
      landmarks: res ? res.landmarks : [],
      ms: performance.now() - t0
    });
  }
};
