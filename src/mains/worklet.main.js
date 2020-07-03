import * as Comlink from 'comlink/dist/esm/comlink.js';
import WorkletWorker from '@root/workers/worklet.worker';
import { workerMessagePortAudio } from '@root/mains/messages.main';

class AudioWorkletMainThread {
  constructor() {
    this.audioCtx = undefined;
    this.audioWorker = undefined;
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
      sampleRate: this.sampleRate
    });

    try {
      await this.audioCtx.audioWorklet.addModule(WorkletWorker());
    } catch (error) {
      console.error(error);
      return;
    }

    this.audioWorker = new AudioWorkletNode(
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
          maybeSharedArrayBuffer: this.csoundWorker.audioStatePointer,
          maybeSharedArrayBufferAudioIn: this.csoundWorker.audioStreamIn,
          maybeSharedArrayBufferAudioOut: this.csoundWorker.audioStreamOut
        }
      }
    );

    if (this.inputsCount > 0) {
      window.getUserMedia({ audio: true }, stream => {
        this.audioWorker.createMediaStreamSource(stream);
      });
    }

    this.audioWorker.connect(this.audioCtx.destination);

    this.audioWorker.port.postMessage({ msg: 'initMessagePort' }, [
      workerMessagePortAudio
    ]);

    try {
      this.workletProxy = Comlink.wrap(this.audioWorker.port);
    } catch (error) {
      console.error('COMLINK ERROR', error);
    }
  }
}

export default AudioWorkletMainThread;
