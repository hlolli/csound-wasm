/* eslint-disable */
import worker from "workerize-loader?ready&inline!./worker";
import * as worklet from "./csound.worklet.js";
import { AUDIO_STATE } from "./constants";
import { audioState, audioStreamIn, audioStreamOut } from "./sab";

let messageCallback = () => {};
const setMessageCallback = callback => {
  if (typeof callback === "function") {
    messageCallback = callback;
  } else {
    console.error(`Can't assign ${typeof callback} as a message callback`);
  }
};

let csoundPlayStateChangeCallback = () => {};
const setCsoundPlayStateChangeCallback = callback => {
  if (typeof callback === "function") {
    csoundPlayStateChangeCallback = callback;
  } else {
    console.error(
      `Can't assign ${typeof callback} as a playstate change callback`
    );
  }
};

let messageEventListener = null;
let onWorkerMessageEvent = event => {
  const data = event["data"] || {};
  if (typeof data === "object") {
    switch (data.type) {
      case "log": {
        if (typeof messageCallback === "function") {
          messageCallback(data.data);
        }
        return;
      }
      case "playStateChange": {
        if (typeof csoundPlayStateChangeCallback === "function") {
          csoundPlayStateChangeCallback(data.data);
        }
        return;
      }
      default: {
        return;
      }
    }
  }
};

const audioStateMainThread = new Int32Array(audioState);

const csoundPause = () => {
  Atomics.store(audioStateMainThread, AUDIO_STATE.IS_PAUSED, 1);
  if (typeof csoundPlayStateChangeCallback === "function") {
    csoundPlayStateChangeCallback("realtimePerformancePaused");
  }
  return null;
};

const csoundResume = () => {
  Atomics.store(audioStateMainThread, AUDIO_STATE.IS_PAUSED, 0);
  if (typeof csoundPlayStateChangeCallback === "function") {
    csoundPlayStateChangeCallback("realtimePerformanceResumed");
  }
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
  csoundWorker.addEventListener("message", onWorkerMessageEvent, false);
  await csoundWorker.initWasm({ audioState, audioStreamIn, audioStreamOut });
  csoundWorker["startWebAudio"] = startWebAudio;
  csoundWorker["csoundPause"] = csoundPause;
  csoundWorker["csoundResume"] = csoundResume;
  csoundWorker["setMessageCallback"] = setMessageCallback;
  csoundWorker[
    "setCsoundPlayStateChangeCallback"
  ] = setCsoundPlayStateChangeCallback;
  return csoundWorker;
}
