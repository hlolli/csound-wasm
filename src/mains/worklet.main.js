import * as Comlink from 'comlink/dist/esm/comlink.js';
import WorkletWorker from '@root/workers/worklet.worker';
import {
  cleanupPorts,
  workerMessagePortAudio,
  audioWorkerFrameRequestPort,
  audioWorkerAudioInputPort,
} from '@root/mains/messages.main';

class AudioWorkletMainThread {
  constructor() {
    this.audioCtx = undefined;
    this.audioWorkletNode = undefined;
    this.currentPlayState = undefined;
    this.csoundWorkerMain = undefined;
    this.workletProxy = undefined;

    // never default these, get it from
    // csound-worker before starting
    this.sampleRate = undefined;
    this.inputsCount = undefined;
    this.outputsCount = undefined;
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
      case 'realtimePerformanceEnded': {
        !this.csoundWorkerMain.hasSharedArrayBuffer && cleanupPorts(this.csoundWorkerMain);
        this.audioCtx.close();
        this.audioWorkletNode.disconnect();
        break;
      }
      default: {
        break;
      }
    }
  }

  connectPorts() {
    this.audioWorkletNode.port.postMessage({ msg: 'initMessagePort' }, [workerMessagePortAudio]);

    // SAB bypasses this mechanism!
    this.audioWorkletNode.port.postMessage({ msg: 'initAudioInputPort' }, [audioWorkerAudioInputPort]);

    this.audioWorkletNode.port.postMessage({ msg: 'initRequestPort' }, [audioWorkerFrameRequestPort]);

    try {
      this.workletProxy = Comlink.wrap(this.audioWorkletNode.port);
    } catch (error) {
      console.error('COMLINK ERROR', error);
    }
  }

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

    if (!this.csoundWorkerMain) {
      console.error(`fatal: worker not reachable from worklet-main thread`);
      return;
    }

    const createWorkletNode = inputsCount =>
      (this.audioWorkletNode = new AudioWorkletNode(this.audioCtx, 'csound-worklet-processor', {
        processorOptions: {
          hardwareBufferSize: this.hardwareBufferSize,
          softwareBufferSize: this.softwareBufferSize,
          isRequestingInput: this.isRequestingInput,
          inputsCount,
          outputsCount: this.outputsCount,
          sampleRate: this.sampleRate,
          maybeSharedArrayBuffer: this.csoundWorkerMain.hasSharedArrayBuffer && this.csoundWorkerMain.audioStatePointer,
          maybeSharedArrayBufferAudioIn:
            this.csoundWorkerMain.hasSharedArrayBuffer && this.csoundWorkerMain.audioStreamIn,
          maybeSharedArrayBufferAudioOut:
            this.csoundWorkerMain.hasSharedArrayBuffer && this.csoundWorkerMain.audioStreamOut,
        },
      }));

    if (this.isRequestingInput) {
      const getUserMedia =
        typeof navigator.mediaDevices !== 'undefined'
          ? navigator.mediaDevices.getUserMedia
          : navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

      // (typeof navigator.mediaDevices !== 'undefined'
      //   ? navigator.mediaDevices.getUserMedia
      //   : );

      const microphoneCallback = stream => {
        if (stream) {
          const liveInput = this.audioCtx.createMediaStreamSource(stream);
          this.inputsCount = liveInput.channelCount;
          this.audioWorkletNode = createWorkletNode(liveInput.channelCount);
          liveInput.connect(this.audioWorkletNode).connect(this.audioCtx.destination);
        } else {
          // Continue as before if user cancels
          this.inputsCount = 0;
          this.audioWorkletNode = createWorkletNode(0);
          this.audioWorkletNode.connect(this.audioCtx.destination);
        }
        !this.csoundWorkerMain.hasSharedArrayBuffer && this.connectPorts();
      };

      typeof navigator.mediaDevices !== 'undefined'
        ? getUserMedia
            .call(navigator.mediaDevices, {
              audio: { echoCancellation: false, sampleSize: 32 },
            })
            .then(microphoneCallback)
            .catch(console.error)
        : getUserMedia.call(
            navigator,
            {
              audio: {
                optional: [{ echoCancellation: false, sampleSize: 32 }],
              },
            },
            microphoneCallback,
            console.error
          );
    } else {
      this.audioWorkletNode = createWorkletNode();
      this.audioWorkletNode.connect(this.audioCtx.destination);
      !this.csoundWorkerMain.hasSharedArrayBuffer && this.connectPorts();
    }
  }
}

export default AudioWorkletMainThread;
