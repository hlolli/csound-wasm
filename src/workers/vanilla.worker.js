import * as Comlink from 'comlink/dist/esm/comlink.js';
import { assoc, construct, curry, invoker, pipe } from 'ramda';
import { workerMessagePort } from '@root/filesystem';
import { MAX_CHANNELS, MAX_HARDWARE_BUFFER_SIZE } from '@root/constants.js';
import {
  handleCsoundStart,
  instantiateAudioPacket,
} from '@root/workers/common.utils';
import libcsoundFactory from '@root/libcsound';
import loadWasm from '@root/module';

let wasm, combined, libraryCsound;

// const csoundPlayState = workerMessagePort.vanillaWorkerState;

const channelsOutput = [];
const channelsInput = [];

let audioProcessCallback = () => {};
const generateAudioFrames = args => {
  if (workerMessagePort.vanillaWorkerState !== 'realtimePerformanceEnded') {
    return audioProcessCallback(args);
  }
};

const createRealtimeAudioThread = ({
  audioStreamIn,
  audioStreamOut,
  csound,
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

  // Prompt for microphone only on demand!
  const isExpectingInput = libraryCsound
    .csoundGetInputName(csound)
    .includes('adc');

  // Store Csound AudioParams for upcoming performance
  const nchnls = libraryCsound.csoundGetNchnls(csound);
  const nchnlsInput = isExpectingInput ? 2 : 0;
  const sampleRate = libraryCsound.csoundGetSr(csound);

  const zeroDecibelFullScale = libraryCsound.csoundGet0dBFS(csound);

  // for (let channelIndex = 0; channelIndex < nchnls; ++channelIndex) {
  //   channelsOutput.push(
  //     new Float64Array(
  //       audioStreamOut,
  //       MAX_HARDWARE_BUFFER_SIZE * channelIndex,
  //       MAX_HARDWARE_BUFFER_SIZE
  //     )
  //   );
  // }
  // for (let channelIndex = 0; channelIndex < nchnlsInput; ++channelIndex) {
  //   channelsInput.push(
  //     new Float64Array(
  //       audioStreamIn,
  //       MAX_HARDWARE_BUFFER_SIZE * channelIndex,
  //       MAX_HARDWARE_BUFFER_SIZE
  //     )
  //   );
  // }

  workerMessagePort.broadcastPlayState('realtimePerformanceStarted');

  const { buffer } = wasm.exports.memory;
  const inputBufferPtr = libraryCsound.csoundGetSpin(csound);
  const outputBufferPtr = libraryCsound.csoundGetSpout(csound);
  const ksmps = libraryCsound.csoundGetKsmps(csound);

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

  let lastOutputWriteIndex = 0;
  let lastPerformance = 0;

  let currentOutputWriteIndex = 0;

  audioProcessCallback = ({ readIndex, numFrames }) => {
    const outputAudioPacket = instantiateAudioPacket(nchnls, numFrames);

    for (let i = 0; i < numFrames; i++) {
      const currentCsoundBufferPos = i % ksmps;

      if (currentCsoundBufferPos === 0 && lastPerformance === 0) {
        lastPerformance = libraryCsound.csoundPerformKsmps(csound);
        if (lastPerformance !== 0) {
          workerMessagePort.broadcastPlayState('realtimePerformanceEnded');
          audioProcessCallback = () => {};
          lastOutputWriteIndex = currentOutputWriteIndex;
          return { channelsOutput, framesLeft: i };
        }
      }

      outputAudioPacket.forEach((channel, channelIndex) => {
        channel[i] =
          (csoundOutputBuffer[currentCsoundBufferPos * nchnls + channelIndex] ||
            0) / zeroDecibelFullScale;
      });
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
      const { framesLeft = 0, audioPacket } =
        generateAudioFrames(reqEvt.data) || {};
      requestPort.postMessage({
        numFrames: reqEvt.data.numFrames - framesLeft,
        audioPacket,
        ...reqEvt.data,
      });
    };
  } else if (event.data.playStateChange) {
    workerMessagePort.vanillaWorkerState =
      event.data.playStateChange.playStateChange;
  }
};

const initialize = async wasmDataURI => {
  wasm = await loadWasm(wasmDataURI);
  libraryCsound = libcsoundFactory(wasm);
  const startHandler = handleCsoundStart(
    workerMessagePort,
    libraryCsound,
    createRealtimeAudioThread
  );
  const allAPI = pipe(
    assoc('csoundStart', startHandler),
    assoc('wasm', wasm)
  )(libraryCsound);
  combined = new Map(Object.entries(allAPI));
};

Comlink.expose({
  initialize,
  callUncloned,
  channelsOutput,
  channelsInput,
});
