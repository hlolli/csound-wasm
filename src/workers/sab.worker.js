import * as Comlink from 'comlink/dist/esm/comlink.js';
import { workerMessagePort } from '@root/filesystem';
import { assoc, construct, curry, invoker, pipe } from 'ramda';
import libcsoundFactory from '@root/libcsound';
import loadWasm from '@root/module';
import { nearestPowerOf2 } from '@root/utils';
import { Buffer } from 'buffer';

import {
  AUDIO_STATE,
  MAX_HARDWARE_BUFFER_SIZE,
  initialSharedState
} from '@root/constants.js';

let wasm;
let libraryCsound;
let combined;

const sabCreateRealtimeAudioThread = ({
  audioStateBuffer,
  audioStreamIn,
  audioStreamOut,
  csound
}) => {
  if (!wasm || !libraryCsound) {
    workerMessagePort.post("error: csound wasn't initialized before starting");
    return -1;
  }

  // The actual realtime start
  // doing this early to detect errors
  // derive options and attributes for the performance
  const startError = libraryCsound.csoundStart(csound);
  if (startError !== 0) {
    workerMessagePort.post(
      'error: csoundStart failed in realtime-performance,' +
        ' look out for errors in options and syntax'
    );
    return -1;
  }

  const audioStatePointer = new Int32Array(audioStateBuffer);

  // In case of multiple performances, let's reset the sab state
  initialSharedState.forEach((value, index) => {
    Atomics.store(audioStatePointer, index, value);
  });

  // Prompt for microphone only on demand!
  const isExpectingInput = libraryCsound
    .csoundGetInputName(csound)
    .includes('adc');

  // Store Csound AudioParams for upcoming performance
  const nchnls = libraryCsound.csoundGetNchnls(csound);
  const nchnlsInput = isExpectingInput ? 1 : 0;
  const sampleRate = libraryCsound.csoundGetSr(csound);

  Atomics.store(audioStatePointer, AUDIO_STATE.NCHNLS, nchnls);
  Atomics.store(audioStatePointer, AUDIO_STATE.NCHNLS_I, nchnlsInput);
  Atomics.store(audioStatePointer, AUDIO_STATE.SAMPLE_RATE, sampleRate);

  let ksmps = libraryCsound.csoundGetKsmps(csound);
  const ksmps2 = nearestPowerOf2(ksmps);

  if (ksmps !== ksmps2) {
    orkerMessagePort.post(
      `warning: ksmps value ${ksmps} is not 2^n number, the audio will sound choppy`
    );
  }

  const zeroDecibelFullScale = libraryCsound.csoundGet0dBFS(csound);
  // Hardware buffer size
  const _B = audioStatePointer[AUDIO_STATE.HW_BUFFER_SIZE];
  // Software buffer size
  const _b = audioStatePointer[AUDIO_STATE.SW_BUFFER_SIZE];

  // Get the Worklet channels
  const channelsOutput = [];
  const channelsInput = [];
  for (let channelIndex = 0; channelIndex < nchnls; ++channelIndex) {
    channelsOutput.push(
      new Float64Array(
        audioStreamOut,
        MAX_HARDWARE_BUFFER_SIZE * channelIndex,
        MAX_HARDWARE_BUFFER_SIZE
      )
    );
  }

  for (let channelIndex = 0; channelIndex < nchnlsInput; ++channelIndex) {
    channelsInput.push(
      new Float64Array(
        audioStreamIn,
        MAX_HARDWARE_BUFFER_SIZE * channelIndex,
        MAX_HARDWARE_BUFFER_SIZE
      )
    );
  }

  const { buffer } = wasm.exports.memory;

  // Indicator for csound performance
  // != 0 would mean the performance has ended
  let lastReturn = 0;

  // Let's notify the audio-worker that performance has started
  Atomics.store(audioStatePointer, AUDIO_STATE.IS_PERFORMING, 1);
  workerMessagePort.broadcastPlayState('realtimePerformanceStarted');

  while (
    Atomics.wait(audioStatePointer, AUDIO_STATE.ATOMIC_NOFITY, 0) === 'ok'
  ) {
    if (Atomics.load(audioStatePointer, AUDIO_STATE.IS_PERFORMING) !== 1) {
      return;
    }

    const framesRequested = _b;

    const inputBufferPtr = libraryCsound.csoundGetSpin(csound);
    // const inputBufferSize = libraryCsound.csoundGetInputBufferSize(csound);
    const outputBufferPtr = libraryCsound.csoundGetSpout(csound);

    const csoundInputBuffer = new Float64Array(
      buffer,
      inputBufferPtr,
      ksmps * nchnls
    );

    const csoundOutputBuffer = new Float64Array(
      buffer,
      outputBufferPtr,
      ksmps * nchnls
    );

    const outputWriteIndex = Atomics.load(
      audioStatePointer,
      AUDIO_STATE.OUTPUT_WRITE_INDEX
    );

    for (let i = 0; i < framesRequested; i++) {
      const currentOutputWriteIndex = (outputWriteIndex + i) % _B;
      const currentCsoundBufferPos = currentOutputWriteIndex % ksmps;

      if (currentCsoundBufferPos === 0) {
        lastReturn = libraryCsound.csoundPerformKsmps(csound);
        if (lastReturn !== 0) {
          // Let's notify that performance has ended
          workerMessagePort.broadcastPlayState('realtimePerformanceEnded');
          Atomics.store(audioStatePointer, AUDIO_STATE.IS_PERFORMING, 0);
          Atomics.store(audioStatePointer, AUDIO_STATE.REQUEST_RENDER, 0);
          return;
        }
      }

      channelsOutput.forEach((channel, channelIndex) => {
        channel[currentOutputWriteIndex] =
          (csoundOutputBuffer[currentCsoundBufferPos * nchnls + channelIndex] ||
            0) / zeroDecibelFullScale;
      });

      // (nchnls_i * i + channelIndex) % csoundInputBuffer.length

      channelsInput.forEach((channel, channelIndex) => {
        csoundInputBuffer[currentCsoundBufferPos * nchnls + channelIndex] =
          (channel[currentOutputWriteIndex] || 0) * zeroDecibelFullScale;
      });

      Atomics.add(audioStatePointer, AUDIO_STATE.OUTPUT_WRITE_INDEX, 1);

      if (audioStatePointer[AUDIO_STATE.OUTPUT_WRITE_INDEX] >= _B) {
        audioStatePointer[AUDIO_STATE.OUTPUT_WRITE_INDEX] = 0;
      }
    }

    Atomics.add(audioStatePointer, AUDIO_STATE.AVAIL_OUT_BUFS, framesRequested);
    if (Atomics.load(audioStatePointer, AUDIO_STATE.IS_PERFORMING)) {
      Atomics.store(audioStatePointer, AUDIO_STATE.REQUEST_RENDER, 0);
    }
  }
};

const callUncloned = async (k, arguments_) => {
  const caller = combined.get(k);
  return caller && caller.apply(null, arguments_ || []);
};

onmessage = function(event) {
  if (event.data.msg === 'initMessagePort') {
    const port = event.ports[0];
    workerMessagePort.post = log => port.postMessage({ log });
    workerMessagePort.broadcastPlayState = playStateChange =>
      port.postMessage({ playStateChange });
    workerMessagePort.ready = true;
  }
};

const handleCsoundStart = ({
  audioStateBuffer,
  audioStreamIn,
  audioStreamOut,
  csound
}) => {
  // account for slash csound in wasi-memfs system
  libraryCsound.csoundAppendEnv(csound, 'SFDIR', '/csound');
  const startError = libraryCsound.csoundStart(csound);
  if (startError !== 0) {
    workerMessagePort.post(
      `error: csoundStart failed while trying to render ${outputName},` +
        ' look out for errors in options and syntax'
    );
    return startError;
  }

  const outputName = libraryCsound.csoundGetOutputName(csound) || 'test.wav';
  const isExpectingRealtimeOutput = outputName.includes('dac');

  if (isExpectingRealtimeOutput) {
    sabCreateRealtimeAudioThread({
      audioStateBuffer,
      audioStreamIn,
      audioStreamOut,
      csound
    });
  }
};

const initialize = async wasmDataURI => {
  wasm = await loadWasm(wasmDataURI);
  libraryCsound = libcsoundFactory(wasm);
  const allAPI = pipe(
    assoc('csoundStart', handleCsoundStart),
    assoc('wasm', wasm)
  )(libraryCsound);
  combined = new Map(Object.entries(allAPI));
};

Comlink.expose({ initialize, callUncloned });
