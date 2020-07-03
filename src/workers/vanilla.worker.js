import * as Comlink from 'comlink/dist/esm/comlink.js';
import { workerMessagePort } from '@root/filesystem';
import { MAX_CHANNELS, MAX_HARDWARE_BUFFER_SIZE } from '@root/constants.js';
import { assoc, construct, curry, invoker, pipe } from 'ramda';
import libcsoundFactory from '@root/libcsound';
import loadWasm from '@root/module';

let wasm, combined, libraryCsound;

const csoundPlayState = workerMessagePort.vanillaWorkerState;

const createRealtimeAudioThread = ({
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

  // Prompt for microphone only on demand!
  const isExpectingInput = libraryCsound
    .csoundGetInputName(csound)
    .includes('adc');

  // Store Csound AudioParams for upcoming performance
  const nchnls = libraryCsound.csoundGetNchnls(csound);
  const nchnlsInput = isExpectingInput ? 1 : 0;
  const sampleRate = libraryCsound.csoundGetSr(csound);

  const zeroDecibelFullScale = libraryCsound.csoundGet0dBFS(csound);

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

  workerMessagePort.broadcastPlayState('realtimePerformanceStarted');

  const { buffer } = wasm.exports.memory;
  const inputBufferPtr = libraryCsound.csoundGetSpin(csound);
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

  while (
    csoundPlayState === 'realtimePerformanceStarted' ||
    csoundPlayState === 'realtimePerformancePaused'
  ) {
    if (csoundPlayState === 'realtimePerformancePaused') {
    } else {
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
    workerMessagePort.broadcastPlayState = playStateChange => {
      workerMessagePort.vanillaWorkerState = playStateChange;
      port.postMessage({ playStateChange });
    };
    workerMessagePort.ready = true;
  }
};

const handleCsoundStart = ({ audioStreamIn, audioStreamOut, csound }) => {
  console.log('Vanilla Start', audioStreamIn, audioStreamOut, csound);
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
    createRealtimeAudioThread({
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
