import * as Comlink from 'comlink/dist/esm/comlink.js';
import { assoc, construct, curry, invoker, pipe } from 'ramda';
import { workerMessagePort } from '@root/filesystem';
import { MAX_CHANNELS, MAX_HARDWARE_BUFFER_SIZE } from '@root/constants.js';
import { handleCsoundStart, instantiateAudioPacket } from '@root/workers/common.utils';
import libcsoundFactory from '@root/libcsound';
import loadWasm from '@root/module';

let wasm, combined, libraryCsound;

// const csoundPlayState = workerMessagePort.vanillaWorkerState;

let audioProcessCallback = () => {};

const audioInputs = {
  buffers: [],
  inputWriteIndex: 0,
  inputReadIndex: 0,
  availableFrames: 0,
};

const createAudioInputBuffers = inputsCount => {
  for (let channelIndex = 0; channelIndex < inputsCount; ++channelIndex) {
    audioInputs.buffers.push(new Float64Array(MAX_HARDWARE_BUFFER_SIZE));
  }
};

const generateAudioFrames = args => {
  if (workerMessagePort.vanillaWorkerState !== 'realtimePerformanceEnded') {
    return audioProcessCallback(args);
  }
};

const createRealtimeAudioThread = ({ csound }) => {
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

  // Prompt for microphone only on demand!
  const isExpectingInput = libraryCsound.csoundGetInputName(csound).includes('adc');

  // Store Csound AudioParams for upcoming performance
  const nchnls = libraryCsound.csoundGetNchnls(csound);
  const nchnlsInput = isExpectingInput ? libraryCsound.csoundGetNchnlsInput(csound) : 0;
  // const sampleRate = libraryCsound.csoundGetSr(csound);

  const zeroDecibelFullScale = libraryCsound.csoundGet0dBFS(csound);

  workerMessagePort.broadcastPlayState('realtimePerformanceStarted');

  const { buffer } = wasm.exports.memory;
  const inputBufferPtr = libraryCsound.csoundGetSpin(csound);
  const outputBufferPtr = libraryCsound.csoundGetSpout(csound);
  const ksmps = libraryCsound.csoundGetKsmps(csound);

  let csoundInputBuffer = new Float64Array(buffer, inputBufferPtr, ksmps * nchnlsInput);

  let csoundOutputBuffer = new Float64Array(buffer, outputBufferPtr, ksmps * nchnls);

  let lastOutputWriteIndex = 0;
  let lastPerformance = 0;

  let currentOutputWriteIndex = 0;

  audioProcessCallback = ({ readIndex, numFrames }) => {
    // MEMGROW KILLS REFERENCES!
    // https://github.com/emscripten-core/emscripten/issues/6747#issuecomment-400081465
    if (csoundInputBuffer.length === 0) {
      csoundInputBuffer = new Float64Array(
        wasm.exports.memory.buffer,
        libraryCsound.csoundGetSpin(csound),
        ksmps * nchnlsInput
      );
    }
    if (csoundOutputBuffer.length === 0) {
      csoundOutputBuffer = new Float64Array(
        wasm.exports.memory.buffer,
        libraryCsound.csoundGetSpout(csound),
        ksmps * nchnls
      );
    }

    const outputAudioPacket = instantiateAudioPacket(nchnls, numFrames);
    const hasInput = audioInputs.buffers.length > 0 && audioInputs.availableFrames >= numFrames;

    for (let i = 0; i < numFrames; i++) {
      const currentCsoundBufferPos = i % ksmps;

      if (currentCsoundBufferPos === 0 && lastPerformance === 0) {
        lastPerformance = libraryCsound.csoundPerformKsmps(csound);
        if (lastPerformance !== 0) {
          workerMessagePort.broadcastPlayState('realtimePerformanceEnded');
          audioProcessCallback = () => {};
          lastOutputWriteIndex = currentOutputWriteIndex;
          return { framesLeft: i };
        }
      }

      outputAudioPacket.forEach((channel, channelIndex) => {
        channel[i] = (csoundOutputBuffer[currentCsoundBufferPos * nchnls + channelIndex] || 0) / zeroDecibelFullScale;
      });

      if (hasInput) {
        for (let ii = 0; ii < nchnlsInput; ii++) {
          csoundInputBuffer[currentCsoundBufferPos * nchnlsInput + ii] =
            (audioInputs.buffers[ii][i + (audioInputs.inputReadIndex % MAX_HARDWARE_BUFFER_SIZE)] || 0) *
            zeroDecibelFullScale;
        }
      }
    }
    if (hasInput) {
      audioInputs.availableFrames -= numFrames;
      audioInputs.inputReadIndex += numFrames % MAX_HARDWARE_BUFFER_SIZE;
    }
    lastOutputWriteIndex = currentOutputWriteIndex;

    return { audioPacket: outputAudioPacket, framesLeft: 0 };
  };
};

const callUncloned = async (k, arguments_) => {
  const caller = combined.get(k);
  return caller && caller.apply(null, arguments_ || []);
};

onmessage = function(event) {
  if (event.data.msg === 'initMessagePort') {
    const port = event.ports[0];
    workerMessagePort.post = log => port.postMessage({ log });
    workerMessagePort.broadcastPlayState = playStateChange => {
      workerMessagePort.vanillaWorkerState = playStateChange;
      port.postMessage({ playStateChange });
    };
    workerMessagePort.ready = true;
  } else if (event.data.msg === 'initRequestPort') {
    const requestPort = event.ports[0];
    requestPort.onmessage = reqEvt => {
      const { framesLeft = 0, audioPacket } = generateAudioFrames(reqEvt.data) || {};
      requestPort.postMessage({
        numFrames: reqEvt.data.numFrames - framesLeft,
        audioPacket,
        ...reqEvt.data,
      });
    };
  } else if (event.data.msg === 'initAudioInputPort') {
    const audioInputPort = event.ports[0];
    audioInputPort.onmessage = ({ data: pkgs }) => {
      if (audioInputs.buffers.length === 0) {
        createAudioInputBuffers(pkgs.length);
      }
      audioInputs.buffers.forEach((buf, i) => {
        buf.set(pkgs[i], audioInputs.inputWriteIndex);
      });
      audioInputs.inputWriteIndex += pkgs[0].length;
      audioInputs.availableFrames += pkgs[0].length;
      if (audioInputs.inputWriteIndex >= MAX_HARDWARE_BUFFER_SIZE) {
        audioInputs.inputWriteIndex = 0;
      }
    };
  } else if (event.data.playStateChange) {
    workerMessagePort.vanillaWorkerState = event.data.playStateChange.playStateChange;
  }
};

const initialize = async wasmDataURI => {
  wasm = await loadWasm(wasmDataURI);
  libraryCsound = libcsoundFactory(wasm);
  const startHandler = handleCsoundStart(workerMessagePort, libraryCsound, createRealtimeAudioThread);
  const allAPI = pipe(assoc('csoundStart', startHandler), assoc('wasm', wasm))(libraryCsound);
  combined = new Map(Object.entries(allAPI));
};

Comlink.expose({
  initialize,
  callUncloned,
});
