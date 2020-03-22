/* eslint-disable */
import L from "@root/libcsound";
import getLibcsoundWasm, { wasmFs } from "./module";
import { makeLibcsoundFrontEnd } from "./utils";
import {
  AUDIO_STATE,
  MAX_HARDWARE_BUFFER_SIZE,
  MAX_CHANNELS,
  initialSharedState
} from "./constants.js";

let wasm;
let audioStateSab;
let audioStreamInSab;
let audioStreamOutSab;

const pipeAudioStream = async csound => {
  const audioState = new Int32Array(audioStateSab);

  // In case of multiple performances, let's reset the sab state
  initialSharedState.forEach((value, index) => {
    Atomics.store(audioState, index, value);
  });

  // Share the Csound channel num
  const nchnls = csoundGetNchnls(csound);
  Atomics.store(audioState, AUDIO_STATE.NCHNLS, nchnls);

  const ksmps = csoundGetKsmps(csound);
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

  while (Atomics.wait(audioState, AUDIO_STATE.ATOMIC_NOFITY, 0) === "ok") {
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
          Atomics.store(audioState, AUDIO_STATE.IS_PERFORMING, 0);
          Atomics.store(audioState, AUDIO_STATE.REQUEST_RENDER, 0);
          return;
        }
      }
      channels.forEach((channel, channelIndex) => {
        channel[currentOutputWriteIndex] =
          csoundBuffer[currentCsoundBufferPos * nchnls + channelIndex] || 0;
      });
      Atomics.add(audioState, AUDIO_STATE.OUTPUT_WRITE_INDEX, 1);

      if (audioState[AUDIO_STATE.OUTPUT_WRITE_INDEX] >= _B) {
        audioState[AUDIO_STATE.OUTPUT_WRITE_INDEX] = 0;
      }
    }
    Atomics.add(audioState, AUDIO_STATE.AVAIL_OUT_BUFS, framesRequested);
    Atomics.store(audioState, AUDIO_STATE.REQUEST_RENDER, 0);
  }
};

export const initWasm = async ({
  audioState,
  audioStreamIn,
  audioStreamOut
}) => {
  audioStateSab = audioState;
  audioStreamInSab = audioStreamIn;
  audioStreamOutSab = audioStreamOut;
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
  return L.csoundStop(wasm).apply(null, args);
}
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

// @module/helpers
export function csoundPrepareRT(...args) {
  return L.csoundPrepareRT(wasm).apply(null, args);
}
