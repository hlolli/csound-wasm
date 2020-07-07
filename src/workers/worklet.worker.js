import * as Comlink from 'comlink/dist/esm/comlink.js';
import { AUDIO_STATE, MAX_HARDWARE_BUFFER_SIZE } from '@root/constants';

const workerMessagePort = {
  ready: false,
  post: () => {},
  broadcastPlayState: () => {},
};

const audioFramePort = {
  requestFrames: () => {},
};

function processSharedArrayBuffer(inputs, outputs) {
  const isPerforming =
    Atomics.load(this.sharedArrayBuffer, AUDIO_STATE.IS_PERFORMING) === 1;

  if (
    !this.sharedArrayBuffer ||
    Atomics.load(this.sharedArrayBuffer, AUDIO_STATE.IS_PAUSED) === 1 ||
    !isPerforming
  ) {
    if (!isPerforming && this.isPerformingLastTime) {
      // Not sure if this is working, but it seems to
      // at minimum unblock the atomic wait in the while loop
      // by giving it another number than 0, in turn, returning
      // "not-equal" instead of "ok"
      Atomics.store(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOFITY, 1);
      Atomics.notify(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOFITY);
    }

    this.isPerformingLastTime = isPerforming;
    this.preProcessCount = 0;
    return true;
  }

  this.isPerformingLastTime = isPerforming;

  if (this.preProcessCount < 4 && this.isPerformingLastTime && isPerforming) {
    Atomics.notify(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOFITY, 1);
    this.preProcessCount += 1;
    return true;
  }

  const writeableInputChannels = inputs[0];
  const writeableOutputChannels = outputs[0];

  if (
    this.sharedArrayBuffer[AUDIO_STATE.AVAIL_OUT_BUFS] <
    this.softwareBufferSize * 2 // outputChannels[0].length * 4
  ) {
    Atomics.notify(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOFITY, 1);
  }

  const readIndex = this.sharedArrayBuffer[AUDIO_STATE.OUTPUT_READ_INDEX];

  const nextReadIndex =
    (readIndex + writeableOutputChannels[0].length) % this.hardwareBufferSize;

  if (this.sharedArrayBuffer[AUDIO_STATE.AVAIL_OUT_BUFS] > 0) {
    writeableOutputChannels.forEach((channelBuffer, channelIndex) => {
      channelBuffer.set(
        this.sabOutputChannels[channelIndex].subarray(
          readIndex,
          nextReadIndex < readIndex ? this.hardwareBufferSize : nextReadIndex
        )
      );
    });
    if (this.inputsCount > 0) {
      this.sabInputChannels[0].set(writeableInputChannels[0], readIndex);
    }

    Atomics.store(
      this.sharedArrayBuffer,
      AUDIO_STATE.OUTPUT_READ_INDEX,
      nextReadIndex
    );

    // subtract the available output buffers, all channels are the same length
    Atomics.sub(
      this.sharedArrayBuffer,
      AUDIO_STATE.AVAIL_OUT_BUFS,
      writeableOutputChannels[0].length
    );
  } else {
    workerMessagePort.post('Buffer underrun');
  }

  return true;
}

function processVanillaBuffers(inputs, outputs) {
  audioFramePort.requestFrames(128);
  return true;
}

function vanillaMessagePort(event) {
  if (event.data.msg === 'initMessagePort') {
    const port = event.ports[0];
    workerMessagePort.post = log => port.postMessage({ log });
    workerMessagePort.broadcastPlayState = playStateChange =>
      port.postMessage({ playStateChange });
    workerMessagePort.ready = true;
  } else if (event.data.msg === 'initRequestPort') {
    const requestPort = event.ports[0];
    audioFramePort.requestFrames = framesRequested =>
      requestPort.postMessage(framesRequested);
  }
}

class CsoundWorkletProcessor extends AudioWorkletProcessor {
  constructor({
    numberOfInputs,
    numberOfOutputs,
    processorOptions: {
      hardwareBufferSize,
      softwareBufferSize,
      inputsCount,
      outputsCount,
      sampleRate,
      maybeSharedArrayBuffer,
      maybeSharedArrayBufferAudioIn,
      maybeSharedArrayBufferAudioOut,
      maybeVanillaArrayBufferAudioIn,
      maybeVanillaArrayBufferAudioOut,
    },
  }) {
    super({ numberOfInputs, numberOfOutputs });

    this.currentPlayState = undefined;

    this.sampleRate = sampleRate;
    this.inputsCount = inputsCount;
    this.outputsCount = outputsCount;
    this.hardwareBufferSize = hardwareBufferSize;
    this.softwareBufferSize = softwareBufferSize;

    this.port.onmessage = vanillaMessagePort.bind(this);

    // NON-SAB PROCESS
    this.isPerformingLastTime = false;
    this.preProcessCount = 0;

    if (maybeSharedArrayBuffer) {
      this.sharedArrayBuffer = maybeSharedArrayBuffer;
      this.audioStreamIn = maybeSharedArrayBufferAudioIn;
      this.audioStreamOut = maybeSharedArrayBufferAudioOut;
      this.sabOutputChannels = [];
      this.sabInputChannels = [];

      for (
        let channelIndex = 0;
        channelIndex < numberOfInputs;
        ++channelIndex
      ) {
        this.sabInputChannels.push(
          new Float64Array(
            this.audioStreamIn,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
      }

      for (
        let channelIndex = 0;
        channelIndex < numberOfOutputs;
        ++channelIndex
      ) {
        this.sabOutputChannels.push(
          new Float64Array(
            this.audioStreamOut,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
      }

      this.actualProcess = processSharedArrayBuffer.bind(this);
    } else {
      this.audioStreamIn = maybeVanillaArrayBufferAudioIn;
      this.audioStreamOut = maybeVanillaArrayBufferAudioOut;
      this.vanillaOutputChannels = [];
      this.vanillaInputChannels = [];

      for (
        let channelIndex = 0;
        channelIndex < numberOfInputs;
        ++channelIndex
      ) {
        this.vanillaInputChannels.push(
          new Float64Array(
            this.audioStreamIn,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
      }

      for (
        let channelIndex = 0;
        channelIndex < numberOfOutputs;
        ++channelIndex
      ) {
        this.vanillaOutputChannels.push(
          new Float64Array(
            this.audioStreamOut,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
      }

      this.actualProcess = processVanillaBuffers.bind(this);
    }

    Comlink.expose(this, this.port);
  }

  process(inputs, outputs) {
    return this.actualProcess(inputs, outputs);
  }
}

registerProcessor('csound-worklet-processor', CsoundWorkletProcessor);
