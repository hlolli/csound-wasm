import { AUDIO_STATE, MAX_HARDWARE_BUFFER_SIZE } from '@root/constants';
import { instantiateAudioPacket } from '@root/workers/common.utils';
// https://github.com/xpl/ololog/issues/20
// import { logSPN } from '@root/logger';
import { range } from 'ramda';
import { WebkitAudioContext } from '@root/utils';

let spnClassInstance;

const lowestQuantum = 256;

const PERIODS = 4;

const workerMessagePort = {
  ready: false,
  post: () => {},
  broadcastPlayState: () => {},
};

const audioFramePort = {
  requestFrames: () => {},
  ready: false,
};

const audioInputPort = {
  transferInputFrames: undefined,
};

class CsoundScriptNodeProcessor {
  constructor({ hardwareBufferSize, softwareBufferSize, inputsCount, outputsCount, sampleRate }) {
    this.hardwareBufferSize = MAX_HARDWARE_BUFFER_SIZE;
    this.softwareBufferSize = softwareBufferSize;
    this.inputsCount = inputsCount;
    this.outputsCount = outputsCount;
    console.log('COUNTZ', this.inputsCount, this.outputsCount);
    this.sampleRate = sampleRate;

    this.vanillaOutputChannels = [];
    this.vanillaInputChannels = [];
    this.vanillaOutputReadIndex = 0;
    this.vanillaInputReadIndex = 0;
    this.vanillaAvailableFrames = 0;
    this.pendingFrames = 0;

    this.vanillaInitialized = false;
    this.vanillaFirstTransferDone = false;
    this.vanillaInputChannels = instantiateAudioPacket(inputsCount, MAX_HARDWARE_BUFFER_SIZE);
    this.vanillaOutputChannels = instantiateAudioPacket(outputsCount, MAX_HARDWARE_BUFFER_SIZE);

    // SPN
    const AudioCTX = WebkitAudioContext();
    console.log('AUDIOCTX', AudioCTX, typeof webkitAudioContext, typeof AudioContext);
    this.audioContext = new AudioCTX({
      latencyHint: 'interactive',
      sampleRate: this.sampleRate,
    });

    this.scriptNode = this.audioContext.createScriptProcessor(
      lowestQuantum,
      inputsCount,
      outputsCount
    );
    const processor = this.process.bind(this);
    this.scriptNode.onaudioprocess = processor;
    this.scriptNode.connect(this.audioContext.destination);
    const updateVanillaFrames = this.updateVanillaFrames.bind(this);
    // this.actualProcess = processVanillaBuffers.bind(this);

    // this.vanillaMessageHandler = this.vanillaMessageHandler.bind(this);
    // const messageHandlerCallback = this.vanillaMessageHandler(updateVanillaFrames).bind(this);
    // this.port.addEventListener('message', messageHandlerCallback);
    // this.port.start();
  }

  updateVanillaFrames({ audioPacket, numFrames, readIndex }) {
    // aways dec pending Frames even for empty ones
    this.pendingFrames -= numFrames;
    if (audioPacket) {
      for (let channelIndex = 0; channelIndex < this.outputsCount; ++channelIndex) {
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
  }

  // try to do the same here as in Vanilla+Worklet
  process({ inputBuffer, outputBuffer }) {
    if (!this.vanillaInitialized || !audioFramePort.ready) {
      if (audioFramePort.requestFrames && !this.vanillaInitialized) {
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

    const writeableInputChannels = range(0, this.inputsCount).map(index =>
      inputBuffer.getChannelData(index)
    );
    const writeableOutputChannels = range(0, this.outputsCount).map(index =>
      outputBuffer.getChannelData(index)
    );
    const hasWriteableInputChannels = writeableInputChannels.length > 0;

    const nextOutputReadIndex =
      (this.vanillaOutputReadIndex + writeableOutputChannels[0].length) % this.hardwareBufferSize;

    const nextInputReadIndex = hasWriteableInputChannels
      ? (this.vanillaInputReadIndex + writeableInputChannels[0].length) % this.hardwareBufferSize
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
        const inputBufferLength = this.softwareBufferSize * PERIODS;
        writeableInputChannels.forEach((channelBuffer, channelIndex) => {
          this.vanillaInputChannels[channelIndex].set(channelBuffer, this.vanillaInputReadIndex);
        });
        if (nextInputReadIndex % inputBufferLength === 0) {
          const packet = [];
          const pastBufferBegin =
            (nextInputReadIndex === 0 ? this.hardwareBufferSize : nextInputReadIndex) -
            inputBufferLength;
          const thisBufferEnd =
            nextInputReadIndex === 0 ? this.hardwareBufferSize : nextInputReadIndex;
          this.vanillaInputChannels.forEach(channelBuffer => {
            packet.push(channelBuffer.subarray(pastBufferBegin, thisBufferEnd));
          });
          audioInputPort.transferInputFrames(packet);
        }
      }

      this.vanillaOutputReadIndex = nextOutputReadIndex;
      this.vanillaInputReadIndex = nextInputReadIndex;
      this.vanillaAvailableFrames -= writeableOutputChannels[0].length;
      this.bufferUnderrunCount = 0;
    } else {
      // minimize noise
      if (this.bufferUnderrunCount > 1 && this.bufferUnderrunCount < 12) {
        workerMessagePort.post('Buffer underrun');
        this.bufferUnderrunCount += 1;
      }

      if (this.bufferUnderrunCount === 100) {
        // 100 buffer Underruns in a row
        // means a fatal situation and browser
        // may crash
        workerMessagePort.post('FATAL: 100 buffers failed in a row');
        workerMessagePort.broadcastPlayState('realtimePerformanceEnded');
      }
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
}

const workerMessageHandler = event => {
  if (event.data.msg === 'initMessagePort') {
    console.log(`initMessagePort in worker`);
    const port = event.ports[0];
    workerMessagePort.post = log => port.postMessage({ log });
    workerMessagePort.broadcastPlayState = playStateChange => port.postMessage({ playStateChange });
    workerMessagePort.ready = true;
  } else if (event.data.msg === 'initRequestPort') {
    console.log(`initRequestPort in worker`);
    const requestPort = event.ports[0];
    requestPort.addEventListener('message', requestPortEvent => {
      const { audioPacket, readIndex, numFrames } = requestPortEvent.data;
      spnClassInstance &&
        spnClassInstance.updateVanillaFrames({ audioPacket, numFrames, readIndex });
    });
    audioFramePort.requestFrames = arguments_ => requestPort.postMessage(arguments_);
    if (!audioFramePort.ready) {
      requestPort.start();
      audioFramePort.ready = true;
    }
  } else if (event.data.msg === 'initAudioInputPort') {
    console.log(`initAudioInputPort in worker`);
    const inputPort = event.ports[0];
    audioInputPort.transferInputFrames = frames => inputPort.postMessage(frames);
  } else if (event.data.msg === 'makeSPNClass') {
    if (typeof spnClassInstance !== 'undefined') {
      spnClassInstance = undefined;
    }
    spnClassInstance = new CsoundScriptNodeProcessor(event.data.argumentz);
  }
};

// object cloning is terrible in iframes, so it's oldskool and no Comlink :(
addEventListener('message', workerMessageHandler);
