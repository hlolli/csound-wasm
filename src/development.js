/* eslint-disable */

const onGesture = async () => {
  if (window.audioCtx === null) {
    window.audioCtx = new AudioContext({
      latencyHint: "playback",
      sampleRate: 44100
    });
    const module = await audioCtx.audioWorklet.addModule(worklet);
    const audioWorker = new AudioWorkletNode(
      audioCtx,
      "csound-worklet-processor",
      { numberOfOutputs: 2 }
    );
    audioWorker.port.postMessage([
      "initializeSab",
      { audioState, audioStreamIn, audioStreamOut }
    ]);
    audioWorker.connect(audioCtx.destination);
  }
};

export default async function init() {
  document
    .getElementById("gesture-sensor")
    .addEventListener("click", onGesture);
  const csoundWorker = worker();
  await csoundWorker.ready;
  window.csndWorker = csoundWorker;
  await csoundWorker.storeSab({ audioState, audioStreamIn, audioStreamOut });
  await csoundWorker.initWasm();
  const csound = await csoundWorker.csoundCreate();
  await csoundWorker.csoundInitialize(0);
  await csoundWorker.csoundSetOption(csound, "-odac");
  await csoundWorker.csoundSetOption(csound, "--0dbfs=1");
  await csoundWorker.csoundSetOption(csound, "--nchnls=2");
  await csoundWorker.csoundSetOption(csound, "--ksmps=1");
  await csoundWorker.csoundCompileOrc(csound, orcTest);
  let cnt = 0;
  await csoundWorker.csoundPrepareRT(csound);
  csoundWorker.csoundStart(csound);
  const sr = await csoundWorker.csoundGetSr(csound);
  return 0;
}

init().then(r => {});

if (module.hot) {
  module.hot.accept(["./worker.js", "./csound.worklet.js"], function() {
    console.log("Accepting the updated printMe module!");
    init().then(r => {});
  });
}
