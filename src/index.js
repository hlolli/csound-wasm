/* eslint-disable */
if (process.env.NODE_ENV !== "production") {
  require("./development.js");
}
// import * as worker from "./worker";
import Worker from "workerize-loader?ready&inline!./worker";
import * as worklet from "./worklet.bundle";
import { AUDIO_STATE } from "./constants";
import * as getUserMedia from "get-user-media-promise";
import MicrophoneStream from "microphone-stream";

import {
  audioState,
  audioStreamIn,
  audioStreamOut,
  callbackBuffer
} from "./sab";

let hackyCsnd;
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
        // starting csound is 2 step process
        // because of atomic wait, we need to trigger
        // all webaudio stuff from event
        if (data.data === "realtimePerformanceStarted") {
          hackyCsnd && startWebAudio(hackyCsnd);
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

const startWebAudio = async csound => {
  const nchnls = Atomics.load(audioStateMainThread, AUDIO_STATE.NCHNLS);
  const nchnls_i = Atomics.load(audioStateMainThread, AUDIO_STATE.NCHNLS_I);
  const sampleRate = Atomics.load(
    audioStateMainThread,
    AUDIO_STATE.SAMPLE_RATE
  );
  let micStream;

  if (nchnls_i > 0) {
    const stream = await getUserMedia({ video: false, audio: true });
    micStream = new MicrophoneStream({
      sampleRate,
      channels: 1,
      bitDepth: 64,
      signed: true,
      float: true
    });
    micStream.setStream(stream);
  } else {
    micStream = null;
  }

  if (audioCtx) {
    audioCtx.close();
    audioWorker.disconnect();
  }

  audioCtx = new AudioContext({
    latencyHint: "interactive",
    sampleRate
  });

  audioModule = await audioCtx.audioWorklet.addModule(worklet);

  audioWorker = new AudioWorkletNode(audioCtx, "csound-worklet-processor", {
    numberOfOutputs: nchnls,
    numberOfInputs: nchnls_i
  });
  audioWorker.port.postMessage([
    "initializeSab",
    { audioState, audioStreamIn, audioStreamOut }
  ]);
  if (micStream) {
    audioCtx
      .createMediaStreamSource(micStream.stream)
      .connect(audioWorker)
      .connect(audioCtx.destination);
  } else {
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
  const csoundWorker = new Worker();
  await csoundWorker.ready;
  csoundWorker.addEventListener("message", onWorkerMessageEvent, false);
  await csoundWorker.initWasm({
    audioState,
    audioStreamIn,
    audioStreamOut,
    callbackBuffer
  });

  const exportedLib = {};
  Object.keys(csoundWorker).forEach(k => {
    exportedLib[k] = csoundWorker[k];
  });
  const originalCsoundStart = csoundWorker["csoundStart"];
  exportedLib["csoundStart"] = async csnd => {
    hackyCsnd = csnd;
    originalCsoundStart(csnd);
  };
  exportedLib["csoundPause"] = csoundPause;
  exportedLib["csoundResume"] = csoundResume;
  exportedLib["setMessageCallback"] = setMessageCallback;
  exportedLib["csoundStop"] = maybeUnlockThread(
    csoundWorker["csoundStop"],
    "csoundStop"
  );
  exportedLib[
    "setCsoundPlayStateChangeCallback"
  ] = setCsoundPlayStateChangeCallback;
  return exportedLib;
}
