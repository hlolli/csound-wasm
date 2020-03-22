/* eslint-disable */
import worker from "workerize-loader?ready&inline!./worker";
import * as worklet from "./csound.worklet.js";
import { AUDIO_STATE } from "./constants";
import {
  audioState,
  audioStreamIn,
  audioStreamOut,
  callbackBuffer
} from "./sab";

const audioStateMainThread = new Int32Array(audioState);
const callbackBufferMainThread = new Uint8Array(callbackBuffer);

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
const onWorkerMessageEvent = event => {
  const data = event["data"] || {};
  if (typeof data === "object") {
    switch (data.type) {
      case "returnValue": {
        const promiseReturn = mainThreadCallbackQueue[queueId];
        if (
          typeof promiseReturn === "object" &&
          typeof promiseReturn.resolve === "function"
        ) {
          promiseReturn.resolve(data.returnValue);
        }
      }
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

const encoder = new TextEncoder();
let queueId = -1;
const mainThreadCallbackQueue = {};

const getQueueId = () => {
  queueId += 1;
  const nextQueueId = queueId % 1024;
  const maybeZombie = mainThreadCallbackQueue[nextQueueId];
  maybeZombie && maybeZombie.reject();
  return nextQueueId;
};

function maybeUnlockThread(fn, fnName) {
  return async function(...args) {
    if (Atomics.load(audioStateMainThread, AUDIO_STATE.IS_PERFORMING)) {
      return new Promise((resolve, reject) => {
        // maybe reject on timeout?
        const thisQueueId = getQueueId();
        mainThreadCallbackQueue[thisQueueId] = { resolve, reject };
        Atomics.add(audioStateMainThread, AUDIO_STATE.AVAIL_CALLBACKS, 1);
        const jsonDebug = JSON.stringify({
          queueId: thisQueueId,
          fnName,
          args
        });
        const encodeDebug = encoder.encode(jsonDebug);
        callbackBufferMainThread.set(encodeDebug, thisQueueId * 1024, 1024);
      });
    } else {
      return await fn.apply(null, args);
    }
  };
}

/**
 * The default entry for libcsound es7 module
 * @async
 * @return {Promise.<Object>}
 */
export default async function init() {
  const csoundWorker = worker();
  await csoundWorker.ready;
  csoundWorker.addEventListener("message", onWorkerMessageEvent, false);
  await csoundWorker.initWasm({
    audioState,
    audioStreamIn,
    audioStreamOut,
    callbackBuffer
  });
  csoundWorker["startWebAudio"] = startWebAudio;
  csoundWorker["csoundPause"] = csoundPause;
  csoundWorker["csoundResume"] = csoundResume;
  csoundWorker["setMessageCallback"] = setMessageCallback;
  csoundWorker["csoundStop"] = maybeUnlockThread(
    csoundWorker["csoundStop"],
    "csoundStop"
  );

  csoundWorker[
    "setCsoundPlayStateChangeCallback"
  ] = setCsoundPlayStateChangeCallback;
  return csoundWorker;
}
