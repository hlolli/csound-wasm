/* eslint-disable */
import worker from "workerize-loader?ready&inline!./worker";
import * as worklet from "./csound.worklet.js";
import { AUDIO_STATE } from "./constants";
import { audioState, audioStreamIn, audioStreamOut } from "./sab";

const audioStateMainThread = new Int32Array(audioState);

const csoundPause = () => {
  Atomics.store(audioStateMainThread, AUDIO_STATE.IS_PAUSED, 1);
  return null;
};

const csoundResume = () => {
  Atomics.store(audioStateMainThread, AUDIO_STATE.IS_PAUSED, 0);
  return null;
};

let audioCtx;
let audioModule;
let audioWorker;

const startWebAudio = async () => {
  if (!audioCtx) {
    audioCtx = new AudioContext({
      latencyHint: "playback",
      sampleRate: 44100
    });
  }

  if (!audioModule) {
    audioModule = await audioCtx.audioWorklet.addModule(worklet);
  }

  if (!audioWorker) {
    audioWorker = new AudioWorkletNode(audioCtx, "csound-worklet-processor", {
      numberOfOutputs: 2
    });
    audioWorker.port.postMessage([
      "initializeSab",
      { audioState, audioStreamIn, audioStreamOut }
    ]);
    audioWorker.connect(audioCtx.destination);
  }
};

/**
 * The default entry for libcsound es7 module
 * @async
 * @return {Promise.<Object>}
 */
export default async function init() {
  const csoundWorker = worker();
  await csoundWorker.ready;
  await csoundWorker.initWasm({ audioState, audioStreamIn, audioStreamOut });
  csoundWorker["startWebAudio"] = startWebAudio;
  csoundWorker["csoundPause"] = csoundPause;
  csoundWorker["csoundResume"] = csoundResume;
  return csoundWorker;
}
