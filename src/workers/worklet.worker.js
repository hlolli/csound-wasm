import * as Comlink from 'comlink/dist/esm/comlink.js';
import { AUDIO_STATE, MAX_HARDWARE_BUFFER_SIZE } from '@root/constants';
import { instantiateAudioPacket } from '@root/workers/common.utils';

const PERIODS = 4;

const workerMessagePort = {
  ready: false,
  post: () => {},
  broadcastPlayState: () => {},
};

const audioFramePort = {
  requestFrames: null,
};

const audioInputPort = {
  transferInputFrames: null,
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
      Atomics.notify(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOTIFY);
    }

    this.isPerformingLastTime = isPerforming;
    this.preProcessCount = 0;
    return true;
  }

  this.isPerformingLastTime = isPerforming;

  if (
    this.preProcessCount < PERIODS &&
    this.isPerformingLastTime &&
    isPerforming
  ) {
    Atomics.store(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOFITY, 1);
    Atomics.notify(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOTIFY);
    this.preProcessCount += 1;
    return true;
  }

  const writeableInputChannels = inputs[0];
  const writeableOutputChannels = outputs[0];
  const hasWriteableInputChannels = writeableInputChannels.length > 0;
  const availableOutputBuffers = Atomics.load(
    this.sharedArrayBuffer,
    AUDIO_STATE.AVAIL_OUT_BUFS
  );
  if (availableOutputBuffers < this.softwareBufferSize * PERIODS) {
    Atomics.store(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOFITY, 1);
    Atomics.notify(this.sharedArrayBuffer, AUDIO_STATE.ATOMIC_NOTIFY);
  }

  const inputWriteIndex = Atomics.load(
    this.sharedArrayBuffer,
    AUDIO_STATE.INPUT_WRITE_INDEX
  );
  const outputReadIndex = Atomics.load(
    this.sharedArrayBuffer,
    AUDIO_STATE.OUTPUT_READ_INDEX
  );

  const nextInputWriteIndex = hasWriteableInputChannels
    ? (inputWriteIndex + writeableInputChannels[0].length) %
      this.hardwareBufferSize
    : 0;

  const nextOutputReadIndex =
    (outputReadIndex + writeableOutputChannels[0].length) %
    this.hardwareBufferSize;

  if (availableOutputBuffers > 0) {
    writeableOutputChannels.forEach((channelBuffer, channelIndex) => {
      channelBuffer.set(
        this.sabOutputChannels[channelIndex].subarray(
          outputReadIndex,
          nextOutputReadIndex < outputReadIndex
            ? this.hardwareBufferSize
            : nextOutputReadIndex
        )
      );
    });

    if (
      this.inputsCount > 0 &&
      hasWriteableInputChannels &&
      writeableInputChannels[0].length > 0
    ) {
      writeableInputChannels.forEach((channelBuffer, channelIndex) => {
        this.sabInputChannels[channelIndex].set(channelBuffer, inputWriteIndex);
      });

      Atomics.store(
        this.sharedArrayBuffer,
        AUDIO_STATE.INPUT_WRITE_INDEX,
        nextInputWriteIndex
      );

      // increase availability of new input data
      Atomics.add(
        this.sharedArrayBuffer,
        AUDIO_STATE.AVAIL_IN_BUFS,
        writeableInputChannels[0].length
      );
    }

    Atomics.store(
      this.sharedArrayBuffer,
      AUDIO_STATE.OUTPUT_READ_INDEX,
      nextOutputReadIndex
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
  if (!this.vanillaInitialized) {
    if (audioFramePort.requestFrames) {
      // this minimizes startup glitches
      const firstTransferSize = this.softwareBufferSize * 4;
      audioFramePort.requestFrames({
        readIndex: 0,
        numFrames: firstTransferSize,
      });
      this.pendingFrames += firstTransferSize;
      this.vanillaInitialized = true;
      return true;
    } else if (!this.vanillaFirstTransferDone) {
      return true;
    }
  }

  const writeableInputChannels = inputs[0];
  const writeableOutputChannels = outputs[0];
  const hasWriteableInputChannels = writeableInputChannels.length > 0;

  const nextOutputReadIndex =
    (this.vanillaOutputReadIndex + writeableOutputChannels[0].length) %
    this.hardwareBufferSize;

  const nextInputReadIndex = hasWriteableInputChannels
    ? (this.vanillaInputReadIndex + writeableInputChannels[0].length) %
      this.hardwareBufferSize
    : 0;

  if (this.vanillaAvailableFrames >= writeableOutputChannels[0].length) {
    writeableOutputChannels.forEach((channelBuffer, channelIndex) => {
      channelBuffer.set(
        this.vanillaOutputChannels[channelIndex].subarray(
          this.vanillaOutputReadIndex,
          nextOutputReadIndex < this.vanillaOutputReadIndex
            ? this.hardwareBufferSize
            : nextOutputReadIndex
        )
      );
    });

    if (
      this.inputsCount > 0 &&
      hasWriteableInputChannels &&
      writeableInputChannels[0].length > 0
    ) {
      const inputBufferLen = this.softwareBufferSize * PERIODS;
      writeableInputChannels.forEach((channelBuffer, channelIndex) => {
        this.vanillaInputChannels[channelIndex].set(
          channelBuffer,
          this.vanillaInputReadIndex
        );
      });
      if (nextInputReadIndex % inputBufferLen === 0) {
        const packet = [];
        const pastBufferBegin =
          (nextInputReadIndex === 0
            ? this.hardwareBufferSize
            : nextInputReadIndex) - inputBufferLen;
        const thisBufferEnd =
          nextInputReadIndex === 0
            ? this.hardwareBufferSize
            : nextInputReadIndex;
        this.vanillaInputChannels.forEach(channelBuffer => {
          packet.push(channelBuffer.subarray(pastBufferBegin, thisBufferEnd));
        });
        audioInputPort.transferInputFrames(packet);
      }
    }

    this.vanillaOutputReadIndex = nextOutputReadIndex;
    this.vanillaInputReadIndex = nextInputReadIndex;
    this.vanillaAvailableFrames -= writeableOutputChannels[0].length;
  } else {
    // minimize noise
    if (this.bufferUnderrunCount > 1) {
      workerMessagePort.post('Buffer underrun');
    }
    this.bufferUnderrunCount += 1;
    return true;
  }

  if (
    this.vanillaAvailableFrames < this.softwareBufferSize * PERIODS &&
    this.pendingFrames < this.softwareBufferSize * PERIODS * 2
  ) {
    const futureOutputReadIndex =
      (this.vanillaAvailableFrames + nextOutputReadIndex + this.pendingFrames) %
      this.hardwareBufferSize;

    audioFramePort.requestFrames({
      readIndex:
        futureOutputReadIndex < this.hardwareBufferSize
          ? futureOutputReadIndex
          : futureOutputReadIndex + 1,
      numFrames: this.softwareBufferSize * PERIODS,
    });
    this.pendingFrames += this.softwareBufferSize * PERIODS;
  }

  return true;
}

const vanillaMessagePort = updateFrames => {
  return function(event) {
    if (event.data.msg === 'initMessagePort') {
      const port = event.ports[0];
      workerMessagePort.post = log => port.postMessage({ log });
      workerMessagePort.broadcastPlayState = playStateChange =>
        port.postMessage({ playStateChange });
      workerMessagePort.ready = true;
    } else if (event.data.msg === 'initRequestPort') {
      const requestPort = event.ports[0];
      requestPort.onmessage = evt => {
        const { audioPacket, readIndex, numFrames } = evt.data;
        updateFrames({ audioPacket, numFrames, readIndex });
      };
      this.port.onmessage = vanillaMessagePort.bind(this);
      audioFramePort.requestFrames = args => requestPort.postMessage(args);
    } else if (event.data.msg === 'initAudioInputPort') {
      const inputPort = event.ports[0];
      audioInputPort.transferInputFrames = frames =>
        inputPort.postMessage(frames);
    }
  };
};

class CsoundWorkletProcessor extends AudioWorkletProcessor {
  constructor({
    processorOptions: {
      hardwareBufferSize,
      softwareBufferSize,
      inputsCount,
      outputsCount,
      sampleRate,
      maybeSharedArrayBuffer,
      maybeSharedArrayBufferAudioIn,
      maybeSharedArrayBufferAudioOut,
    },
  }) {
    super();

    this.currentPlayState = undefined;

    this.sampleRate = sampleRate;
    this.inputsCount = inputsCount;
    this.outputsCount = outputsCount;
    this.hardwareBufferSize = hardwareBufferSize;
    this.softwareBufferSize = softwareBufferSize;
    this.bufferUnderrunCount = 0;

    // NON-SAB PROCESS
    this.isPerformingLastTime = false;
    this.preProcessCount = 0;

    if (maybeSharedArrayBuffer) {
      this.sharedArrayBuffer = maybeSharedArrayBuffer;
      this.audioStreamIn = maybeSharedArrayBufferAudioIn;
      this.audioStreamOut = maybeSharedArrayBufferAudioOut;
      this.sabOutputChannels = [];
      this.sabInputChannels = [];

      for (let channelIndex = 0; channelIndex < inputsCount; ++channelIndex) {
        this.sabInputChannels.push(
          new Float64Array(
            this.audioStreamIn,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
      }

      for (let channelIndex = 0; channelIndex < outputsCount; ++channelIndex) {
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
      // Bit more agressive buffering with vanilla
      this.hardwareBufferSize = MAX_HARDWARE_BUFFER_SIZE;
      this.vanillaOutputChannels = [];
      this.vanillaInputChannels = [];
      this.vanillaOutputReadIndex = 0;
      this.vanillaInputReadIndex = 0;
      this.vanillaAvailableFrames = 0;
      this.pendingFrames = 0;

      this.updateFrames = ({ audioPacket, numFrames, readIndex }) => {
        // aways dec pending Frames even for empty ones
        this.pendingFrames -= numFrames;
        if (audioPacket) {
          for (
            let channelIndex = 0;
            channelIndex < outputsCount;
            ++channelIndex
          ) {
            let hasLeftover = false;
            let framesLeft = numFrames;
            const nextReadIndex = readIndex % this.hardwareBufferSize;
            if (nextReadIndex < readIndex) {
              hasLeftover = true;
              framesLeft = this.hardwareBufferSize - readIndex;
            }

            this.vanillaOutputChannels[channelIndex].set(
              audioPacket[channelIndex].subarray(0, framesLeft),
              readIndex
            );

            if (hasLeftover) {
              this.vanillaOutputChannels[channelIndex].set(
                audioPacket[channelIndex].subarray(framesLeft)
              );
            }
          }
          this.vanillaAvailableFrames += numFrames;
          if (!this.vanillaFirstTransferDone) {
            this.vanillaFirstTransferDone = true;
          }
        }
      };

      this.vanillaInitialized = false;
      this.vanillaFirstTransferDone = false;
      this.vanillaInputChannels = instantiateAudioPacket(
        inputsCount,
        MAX_HARDWARE_BUFFER_SIZE
      );
      this.vanillaOutputChannels = instantiateAudioPacket(
        outputsCount,
        MAX_HARDWARE_BUFFER_SIZE
      );

      this.actualProcess = processVanillaBuffers.bind(this);
    }

    this.port.onmessage = vanillaMessagePort(this.updateFrames).bind(this);

    Comlink.expose(this, this.port);
  }

  process(inputs, outputs) {
    return this.actualProcess(inputs, outputs);
  }
}

registerProcessor('csound-worklet-processor', CsoundWorkletProcessor);
