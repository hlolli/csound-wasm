/* eslint-disable */
import L from "@root/libcsound";
import getLibcsoundWasm, { wasmFs } from "./module";
import { makeLibcsoundFrontEnd, uint2Str } from "./utils";
import * as path from "path";
import {
  AUDIO_STATE,
  MAX_HARDWARE_BUFFER_SIZE,
  MAX_CHANNELS,
  initialSharedState
} from "./constants.js";

const Buffer = require("buffer/").Buffer;

// put all the realtime thread dependant functions here
const thisNamespace = {};

const decoder = new TextDecoder();

let wasm;
let audioStateSab;
let audioStreamInSab;
let audioStreamOutSab;
let callbackBufferSab;

let audioState;

const pipeAudioStream = async csound => {
  audioState = new Int32Array(audioStateSab);
  const callbackBuffer = new Uint8Array(callbackBufferSab);

  // In case of multiple performances, let's reset the sab state
  initialSharedState.forEach((value, index) => {
    Atomics.store(audioState, index, value);
  });

  // Share the Csound channel num
  const nchnls = csoundGetNchnls(csound);
  Atomics.store(audioState, AUDIO_STATE.NCHNLS, nchnls);

  const ksmps = csoundGetKsmps(csound);

  const zeroDbFs = csoundGet0dBFS(csound);
  // Hardware buffer size
  const _B = audioState[AUDIO_STATE.HW_BUFFER_SIZE];
  // Software buffer size
  const _b = audioState[AUDIO_STATE.SW_BUFFER_SIZE];

  // Get the Worklet channels
  const channels = [];
  for (let channelIndex = 0; channelIndex < nchnls; ++channelIndex) {
    channels.push(
      new Float64Array(
        audioStreamOutSab,
        MAX_HARDWARE_BUFFER_SIZE * channelIndex,
        MAX_HARDWARE_BUFFER_SIZE
      )
    );
  }

  // Indicator for csound performance
  // != 0 would mean the performance has ended
  let lastReturn = 0;

  // Let's notify that performance has started
  Atomics.store(audioState, AUDIO_STATE.IS_PERFORMING, 1);
  postMessage({ type: "playStateChange", data: "realtimePerformanceStarted" });

  while (Atomics.wait(audioState, AUDIO_STATE.ATOMIC_NOFITY, 0) === "ok") {
    if (Atomics.load(audioState, AUDIO_STATE.IS_PERFORMING) !== 1) {
      return;
    }
    const availCallbacks = Atomics.load(
      audioState,
      AUDIO_STATE.AVAIL_CALLBACKS
    );
    if (availCallbacks) {
      const callbackBufferIndex = Atomics.load(
        audioState,
        AUDIO_STATE.CALLBACK_BUFFER_INDEX
      );
      for (let x = 0; x < availCallbacks; x++) {
        const callbackBufferData = callbackBuffer.slice(
          callbackBufferIndex * x,
          1024
        );
        let jzon;
        try {
          jzon = JSON.parse(
            decoder.decode(callbackBufferData).replace(/\0.*$/g, "")
          );
        } catch (e) {}

        if (jzon) {
          const ret = thisNamespace[jzon["fnName"]].apply(null, jzon["args"]);
          postMessage({
            type: "returnValue",
            queueId: jzon["queueId"],
            returnValue: ret
          });
        }
      }
      Atomics.store(
        audioState,
        AUDIO_STATE.CALLBACK_BUFFER_INDEX,
        (callbackBufferIndex + availCallbacks) % 1024
      );
      Atomics.sub(audioState, AUDIO_STATE.AVAIL_CALLBACKS, availCallbacks);
    }
    const { buffer } = wasm.exports.memory;
    const framesRequested = _b;
    const bufferPtr = csoundGetSpout(csound);
    const csoundBuffer = new Float64Array(buffer, bufferPtr, ksmps * nchnls);
    const outputWriteIndex = Atomics.load(
      audioState,
      AUDIO_STATE.OUTPUT_WRITE_INDEX
    );

    for (let i = 0; i < framesRequested; i++) {
      const currentOutputWriteIndex = (outputWriteIndex + i) % _B;
      const currentCsoundBufferPos = currentOutputWriteIndex % ksmps;

      if (currentCsoundBufferPos === 0) {
        lastReturn = csoundPerformKsmps(csound);
        if (lastReturn !== 0) {
          // Let's notify that performance has ended
          postMessage({
            type: "playStateChange",
            data: "realtimePerformanceEnded"
          });
          Atomics.store(audioState, AUDIO_STATE.IS_PERFORMING, 0);
          Atomics.store(audioState, AUDIO_STATE.REQUEST_RENDER, 0);
          return;
        }
      }
      channels.forEach((channel, channelIndex) => {
        channel[currentOutputWriteIndex] =
          (csoundBuffer[currentCsoundBufferPos * nchnls + channelIndex] || 0) /
          zeroDbFs;
      });
      Atomics.add(audioState, AUDIO_STATE.OUTPUT_WRITE_INDEX, 1);

      if (audioState[AUDIO_STATE.OUTPUT_WRITE_INDEX] >= _B) {
        audioState[AUDIO_STATE.OUTPUT_WRITE_INDEX] = 0;
      }
    }
    Atomics.add(audioState, AUDIO_STATE.AVAIL_OUT_BUFS, framesRequested);
    Atomics.load(audioState, AUDIO_STATE.IS_PERFORMING) &&
      Atomics.store(audioState, AUDIO_STATE.REQUEST_RENDER, 0);
  }
};

export const initWasm = async ({
  audioState,
  audioStreamIn,
  audioStreamOut,
  callbackBuffer
}) => {
  audioStateSab = audioState;
  audioStreamInSab = audioStreamIn;
  audioStreamOutSab = audioStreamOut;
  callbackBufferSab = callbackBuffer;
  wasm = await getLibcsoundWasm();
  return 0;
};

// @module/attributes
export function csoundGetSr(...args) {
  return L.csoundGetSr(wasm).apply(null, args);
}
export function csoundGetKr(...args) {
  return L.csoundGetKr(wasm).apply(null, args);
}
export function csoundGetKsmps(...args) {
  return L.csoundGetKsmps(wasm).apply(null, args);
}
export function csoundGetNchnls(...args) {
  return L.csoundGetNchnls(wasm).apply(null, args);
}
export function csoundGetNchnlsInput(...args) {
  return L.csoundGetNchnlsInput(wasm).apply(null, args);
}
export function csoundGet0dBFS(...args) {
  return L.csoundGet0dBFS(wasm).apply(null, args);
}
export function csoundGetA4(...args) {
  return L.csoundGetA4(wasm).apply(null, args);
}
export function csoundGetCurrentTimeSamples(...args) {
  return L.csoundGetCurrentTimeSamples(wasm).apply(null, args);
}
export function csoundGetSizeOfMYFLT(...args) {
  return L.csoundGetSizeOfMYFLT(wasm).apply(null, args);
}
export function csoundSetOption(...args) {
  return L.csoundSetOption(wasm).apply(null, args);
}
export function csoundSetParams(...args) {
  return L.csoundSetParams(wasm).apply(null, args);
}
export function csoundGetParams(...args) {
  return L.csoundGetParams(wasm).apply(null, args);
}
export function csoundGetDebug(...args) {
  return L.csoundGetDebug(wasm).apply(null, args);
}
export function csoundSetDebug(...args) {
  return L.csoundSetDebug(wasm).apply(null, args);
}

// @module/performance
export function csoundParseOrc(...args) {
  return L.csoundParseOrc(wasm).apply(null, args);
}
export function csoundCompileTree(...args) {
  return L.csoundCompileTree(wasm).apply(null, args);
}
export function csoundCompileOrc(...args) {
  return L.csoundCompileOrc(wasm).apply(null, args);
}
export function csoundEvalCode(...args) {
  return L.csoundEvalCode(wasm).apply(null, args);
}
export function csoundStart(...args) {
  setTimeout(() => {
    L.csoundStart(wasm).apply(null, args);
    pipeAudioStream(args[0]);
  }, 0);
  return null;
}
export function csoundCompileCsd(...args) {
  return L.csoundCompileCsd(wasm).apply(null, args);
}
export function csoundCompileCsdText(...args) {
  return L.csoundCompileCsdText(wasm).apply(null, args);
}
export function csoundPerformKsmps(...args) {
  return L.csoundPerformKsmps(wasm).apply(null, args);
}
export function csoundPerformBuffer(...args) {
  return L.csoundPerformBuffer(wasm).apply(null, args);
}
export function csoundStop(...args) {
  csoundInputMessage(args[0], "e 0 0");
  return L.csoundStop(wasm).apply(null, args);
}
thisNamespace["csoundStop"] = csoundStop;
export function csoundCleanup(...args) {
  return L.csoundCleanup(wasm).apply(null, args);
}
export function csoundReset(...args) {
  return L.csoundReset(wasm).apply(null, args);
}

// @module/instantiation
export function csoundCreate(...args) {
  return L.csoundCreate(wasm).apply(null, args);
}
export function csoundDestroy(...args) {
  return L.csoundDestroy(wasm).apply(null, args);
}
export function csoundGetAPIVersion(...args) {
  return L.csoundGetAPIVersion(wasm).apply(null, args);
}
export function csoundGetVersion(...args) {
  return L.csoundGetVersion(wasm).apply(null, args);
}
export function csoundInitialize(...args) {
  return L.csoundInitialize(wasm).apply(null, args);
}

// @module/rtaudio
export function csoundGetInputBufferSize(...args) {
  return L.csoundGetInputBufferSize(wasm).apply(null, args);
}
export function csoundGetOutputBufferSize(...args) {
  return L.csoundGetOutputBufferSize(wasm).apply(null, args);
}
export function csoundGetInputBuffer(...args) {
  return L.csoundGetInputBuffer(wasm).apply(null, args);
}
export function csoundGetOutputBuffer(...args) {
  return L.csoundGetOutputBuffer(wasm).apply(null, args);
}
export function csoundGetSpin(...args) {
  return L.csoundGetSpin(wasm).apply(null, args);
}
export function csoundGetSpout(...args) {
  return L.csoundGetSpout(wasm).apply(null, args);
}

// @module/control_events
export function csoundInputMessage(...args) {
  return L.csoundInputMessage(wasm).apply(null, args);
}
thisNamespace["csoundInputMessage"] = csoundInputMessage;
export function csoundInputMessageAsync(...args) {
  return L.csoundInputMessageAsync(wasm).apply(null, args);
}
thisNamespace["csoundInputMessageAsync"] = csoundInputMessageAsync;

// FileSystem wrappers
export async function copyToFs(arrayBuffer, filePath) {
  const realPath = path.join("/csound", filePath);
  const buf = Buffer.from(new Uint8Array(arrayBuffer));
  wasmFs.fs.writeFileSync(realPath, buf);
  return null;
}

// All folders are stored under /csound, it seems as if
// sanboxing security increases, we are safer to have all assets
// nested from 1 and same root
// This implementation is hidden from the Csound runtime itself with a hack.
export async function mkdirp(filePath) {
  const result = wasmFs.volume.mkdirpSync(path.join("/csound", filePath), {
    mode: "0o777"
  });
  return null;
}
