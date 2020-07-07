import * as Comlink from 'comlink/dist/esm/comlink.js';
import WorkletWorker from '@root/workers/worklet.worker';
import {
  mainFrameRequestPort,
  workerMessagePortAudio,
  workerFrameRequestPort,
} from '@root/mains/messages.main';

class AudioWorkletMainThread {
  constructor() {
    this.audioCtx = undefined;
    this.audioWorkletNode = undefined;
    this.currentPlayState = undefined;
    this.csoundWorker = undefined;
    this.workletProxy = undefined;

    // never default these, get it from
    // csound-worker before starting
    this.sampleRate = undefined;
    this.inputsCount = undefined;
    this.outputCount = undefined;
    this.hardwareBufferSize = undefined;
    this.softwareBufferSize = undefined;
  }

  async audioFramesRequestHandler(framesRequested) {
    const updatedFrames =
      this.csoundWorker.requestAudioFrames &&
      (await this.csoundWorker.requestAudioFrames(framesRequested));
    console.log(updatedFrames);
    if (updatedFrames) {
      for (
        let channelIndex = 0;
        channelIndex < this.outputCount;
        ++channelIndex
      ) {
        // this.workletProxy.vanillaOutputChannels[channelIndex] =
        //   updatedFrames[channelIndex];
      }
    }
  }
  async onPlayStateChange(newPlayState) {
    this.currentPlayState = newPlayState;
    switch (newPlayState) {
      case 'realtimePerformanceStarted': {
        await this.initialize();
        break;
      }
      default: {
        break;
      }
    }
  }

  // if (audioCtx) {
  //     audioCtx.close();
  //     audioWorker.disconnect();
  //   }
  //   audioWorker.port.postMessage([
  //     'initializeSab',
  //     { audioState, audioStreamIn, audioStreamOut }
  //   ]);
  //   if (micStream) {
  //     audioCtx
  //       .createMediaStreamSource(micStream.stream)
  //       .connect(audioWorker)
  //       .connect(audioCtx.destination);
  //   } else {
  //     audioWorker.connect(audioCtx.destination);
  //   }

  async initialize() {
    this.audioCtx = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: this.sampleRate,
    });

    try {
      await this.audioCtx.audioWorklet.addModule(WorkletWorker());
    } catch (error) {
      console.error(error);
      return;
    }

    if (!this.csoundWorker) {
      console.error(`fatal: worker not reachable from worklet-main thread`);
      return;
    }

    this.audioWorkletNode = new AudioWorkletNode(
      this.audioCtx,
      'csound-worklet-processor',
      {
        // READ ONLY
        numberOfInputs: this.inputsCount,
        numberOfOutputs: this.outputCount,
        processorOptions: {
          hardwareBufferSize: this.hardwareBufferSize,
          softwareBufferSize: this.softwareBufferSize,
          inputsCount: this.inputsCount,
          outputsCount: this.outputsCount,
          sampleRate: this.sampleRate,
          maybeSharedArrayBuffer:
            this.csoundWorker.hasSharedArrayBuffer &&
            this.csoundWorker.audioStatePointer,
          maybeSharedArrayBufferAudioIn:
            this.csoundWorker.hasSharedArrayBuffer &&
            this.csoundWorker.audioStreamIn,
          maybeSharedArrayBufferAudioOut:
            this.csoundWorker.hasSharedArrayBuffer &&
            this.csoundWorker.audioStreamOut,
          maybeVanillaArrayBufferAudioIn:
            !this.csoundWorker.hasSharedArrayBuffer && this.audioStreamIn,
          maybeVanillaArrayBufferAudioOut:
            !this.csoundWorker.hasSharedArrayBuffer && this.audioStreamOut,
        },
      }
    );

    if (this.inputsCount > 0) {
      window.getUserMedia({ audio: true }, stream => {
        this.audioWorkletNode.createMediaStreamSource(stream);
      });
    }

    this.audioWorkletNode.connect(this.audioCtx.destination);

    this.audioWorkletNode.port.postMessage({ msg: 'initMessagePort' }, [
      workerMessagePortAudio,
    ]);

    // SAB bypasses this mechanism!
    mainFrameRequestPort.onmessage = evt =>
      this.audioFramesRequestHandler(evt.data);
    this.audioWorkletNode.port.postMessage({ msg: 'initRequestPort' }, [
      workerFrameRequestPort,
    ]);

    try {
      this.workletProxy = Comlink.wrap(this.audioWorkletNode.port);
    } catch (error) {
      console.error('COMLINK ERROR', error);
    }
  }
}

export default AudioWorkletMainThread;
