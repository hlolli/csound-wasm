import * as Comlink from 'comlink';
import { workerMessagePort } from '@root/filesystem';
import libcsoundFactory from '@root/libcsound';
import loadWasm from '@root/module';
import { handleCsoundStart } from '@root/workers/common.utils';
import { nearestPowerOf2 } from '@root/utils';
import { assoc, pipe } from 'ramda';

import { AUDIO_STATE, MAX_HARDWARE_BUFFER_SIZE, initialSharedState } from '@root/constants.js';

let wasm;
let libraryCsound;
let combined;

const sabCreateRealtimeAudioThread = ({ audioStateBuffer, audioStreamIn, audioStreamOut, csound }) => {
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
      'error: csoundStart failed in realtime-performance,' + ' look out for errors in options and syntax'
    );
    return -1;
  }

  const audioStatePointer = new Int32Array(audioStateBuffer);

  // In case of multiple performances, let's reset the sab state
  initialSharedState.forEach((value, index) => {
    Atomics.store(audioStatePointer, index, value);
  });

  // Prompt for microphone only on demand!
  const isExpectingInput = libraryCsound.csoundGetInputName(csound).includes('adc');

  // Store Csound AudioParams for upcoming performance
  const nchnls = libraryCsound.csoundGetNchnls(csound);
  const nchnlsInput = isExpectingInput ? libraryCsound.csoundGetNchnlsInput(csound) : 0;
  const sampleRate = libraryCsound.csoundGetSr(csound);

  Atomics.store(audioStatePointer, AUDIO_STATE.NCHNLS, nchnls);
  Atomics.store(audioStatePointer, AUDIO_STATE.NCHNLS_I, nchnlsInput);
  Atomics.store(audioStatePointer, AUDIO_STATE.SAMPLE_RATE, sampleRate);

  const ksmps = libraryCsound.csoundGetKsmps(csound);
  const ksmps2 = nearestPowerOf2(ksmps);

  if (ksmps !== ksmps2) {
    workerMessagePort.post(`warning: ksmps value ${ksmps} is not 2^n number, the audio will sound choppy`);
  }

  const zeroDecibelFullScale = libraryCsound.csoundGet0dBFS(csound);
  // Hardware buffer size
  const _B = Atomics.load(audioStatePointer, AUDIO_STATE.HW_BUFFER_SIZE);
  // Software buffer size
  const _b = Atomics.load(audioStatePointer, AUDIO_STATE.SW_BUFFER_SIZE);

  // Get the Worklet channels
  const channelsOutput = [];
  const channelsInput = [];
  for (let channelIndex = 0; channelIndex < nchnls; ++channelIndex) {
    channelsOutput.push(
      new Float64Array(audioStreamOut, MAX_HARDWARE_BUFFER_SIZE * channelIndex, MAX_HARDWARE_BUFFER_SIZE)
    );
  }

  for (let channelIndex = 0; channelIndex < nchnlsInput; ++channelIndex) {
    channelsInput.push(
      new Float64Array(audioStreamIn, MAX_HARDWARE_BUFFER_SIZE * channelIndex, MAX_HARDWARE_BUFFER_SIZE)
    );
  }

  // Indicator for csound performance
  // != 0 would mean the performance has ended
  let lastReturn = 0;

  // Let's notify the audio-worker that performance has started
  Atomics.store(audioStatePointer, AUDIO_STATE.IS_PERFORMING, 1);
  workerMessagePort.broadcastPlayState('realtimePerformanceStarted');

  while (Atomics.wait(audioStatePointer, AUDIO_STATE.ATOMIC_NOTIFY, 0, 1000) === 'ok') {
    if (Atomics.load(audioStatePointer, AUDIO_STATE.STOP) === 1) {
      libraryCsound.csoundStop(csound);
      // Trigger "performance ended"
      if (lastReturn === 0) {
        workerMessagePort.broadcastPlayState('realtimePerformanceEnded');
        libraryCsound.csoundPerformKsmps(csound);
      }
      Atomics.store(audioStatePointer, AUDIO_STATE.STOP, 0);
      break;
    }

    if (Atomics.load(audioStatePointer, AUDIO_STATE.IS_PAUSED) === 1) {
      // eslint-disable-next-line no-unused-expressions
      Atomics.wait(audioStatePointer, AUDIO_STATE.IS_PAUSED, 0) === 'ok';
    }

    if (Atomics.load(audioStatePointer, AUDIO_STATE.IS_PERFORMING) !== 1) {
      Atomics.store(audioStatePointer, AUDIO_STATE.STOP, 0);
      workerMessagePort.broadcastPlayState('realtimePerformanceEnded');
      break;
    }

    const framesRequested = _b;

    const availableInputFrames = Atomics.load(audioStatePointer, AUDIO_STATE.AVAIL_IN_BUFS);

    const hasInput = availableInputFrames >= framesRequested;
    const inputBufferPtr = libraryCsound.csoundGetSpin(csound);
    const outputBufferPtr = libraryCsound.csoundGetSpout(csound);

    const csoundInputBuffer =
      hasInput && new Float64Array(wasm.exports.memory.buffer, inputBufferPtr, ksmps * nchnlsInput);

    const csoundOutputBuffer = new Float64Array(wasm.exports.memory.buffer, outputBufferPtr, ksmps * nchnls);

    const inputReadIndex = hasInput && Atomics.load(audioStatePointer, AUDIO_STATE.INPUT_READ_INDEX);

    const outputWriteIndex = Atomics.load(audioStatePointer, AUDIO_STATE.OUTPUT_WRITE_INDEX);

    for (let i = 0; i < framesRequested; i++) {
      const currentInputReadIndex = hasInput && (inputReadIndex + i) % _B;
      const currentOutputWriteIndex = (outputWriteIndex + i) % _B;

      const currentCsoundInputBufferPos = hasInput && currentInputReadIndex % ksmps;
      const currentCsoundOutputBufferPos = currentOutputWriteIndex % ksmps;

      if (currentCsoundOutputBufferPos === 0) {
        lastReturn = libraryCsound.csoundPerformKsmps(csound);
        if (lastReturn !== 0) {
          // Let's notify that performance has ended
          workerMessagePort.broadcastPlayState('realtimePerformanceEnded');
          Atomics.store(audioStatePointer, AUDIO_STATE.IS_PERFORMING, 0);
          return;
        }
      }

      channelsOutput.forEach((channel, channelIndex) => {
        channel[currentOutputWriteIndex] =
          (csoundOutputBuffer[currentCsoundOutputBufferPos * nchnls + channelIndex] || 0) / zeroDecibelFullScale;
      });

      if (hasInput) {
        channelsInput.forEach((channel, channelIndex) => {
          csoundInputBuffer[currentCsoundInputBufferPos * nchnlsInput + channelIndex] =
            (channel[currentInputReadIndex] || 0) * zeroDecibelFullScale;
        });

        Atomics.add(audioStatePointer, AUDIO_STATE.INPUT_READ_INDEX, 1);

        if (Atomics.load(audioStatePointer, AUDIO_STATE.INPUT_READ_INDEX) >= _B) {
          Atomics.store(audioStatePointer, AUDIO_STATE.INPUT_READ_INDEX, 0);
        }
      }

      Atomics.add(audioStatePointer, AUDIO_STATE.OUTPUT_WRITE_INDEX, 1);

      if (Atomics.load(audioStatePointer, AUDIO_STATE.OUTPUT_WRITE_INDEX) >= _B) {
        Atomics.store(audioStatePointer, AUDIO_STATE.OUTPUT_WRITE_INDEX, 0);
      }
    }

    // only decrease available input buffers if
    // they were actually consumed
    hasInput && Atomics.sub(audioStatePointer, AUDIO_STATE.AVAIL_IN_BUFS, framesRequested);
    Atomics.add(audioStatePointer, AUDIO_STATE.AVAIL_OUT_BUFS, framesRequested);
    // perpare to wait
    Atomics.store(audioStatePointer, AUDIO_STATE.ATOMIC_NOTIFY, 0);
  }
};

const callUncloned = async (k, arguments_) => {
  const caller = combined.get(k);
  return caller && caller.apply({}, arguments_ || []);
};

self.addEventListener('message', event => {
  if (event.data.msg === 'initMessagePort') {
    const port = event.ports[0];
    workerMessagePort.post = log => port.postMessage({ log });
    workerMessagePort.broadcastPlayState = playStateChange => port.postMessage({ playStateChange });
    workerMessagePort.ready = true;
  }
});

const initialize = async wasmDataURI => {
  wasm = await loadWasm(wasmDataURI);
  libraryCsound = libcsoundFactory(wasm);
  const startHandler = handleCsoundStart(workerMessagePort, libraryCsound, sabCreateRealtimeAudioThread);
  const allAPI = pipe(assoc('csoundStart', startHandler), assoc('wasm', wasm))(libraryCsound);
  combined = new Map(Object.entries(allAPI));
};

Comlink.expose({ initialize, callUncloned });
