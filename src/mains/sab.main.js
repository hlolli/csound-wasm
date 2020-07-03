import * as Comlink from 'comlink';
import { api as API } from '@root/libcsound';
import { encoder } from '@root/utils';
import {
  messageEventHandler,
  mainMessagePortAudio,
  mainMessagePort,
  workerMessagePort
} from '@root/mains/messages.main';
import SABWorker from '@root/workers/sab.worker';
import getUserMedia from 'get-user-media-promise';
import {
  AUDIO_STATE,
  MAX_CHANNELS,
  MAX_HARDWARE_BUFFER_SIZE,
  initialSharedState
} from '@root/constants';

class SharedArrayBufferMainThread {
  constructor(audioWorker, wasmDataURI) {
    this.audioWorker = audioWorker;
    this.wasmDataURI = wasmDataURI;
    // this.callbackQueue = {};
    // this.callbackQueueBuffer = new Uint8Array(this.callbackQueue);
    this.currentPlayState = undefined;
    // this.currentQueueId = -1;
    this.exportApi = {};
    this.messageCallbacks = [];
    this.csoundPlayStateChangeCallback = undefined;

    this.audioStateBuffer = new SharedArrayBuffer(
      initialSharedState.length * Int32Array.BYTES_PER_ELEMENT
    );

    this.audioStatePointer = new Int32Array(this.audioStateBuffer);

    this.audioStreamIn = new SharedArrayBuffer(
      MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float64Array.BYTES_PER_ELEMENT
    );
    this.audioStreamOut = new SharedArrayBuffer(
      MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float64Array.BYTES_PER_ELEMENT
    );

    // This will sadly create circular structure
    // that's still mostly harmless.
    audioWorker.csoundWorker = this;
    audioWorker.hasSharedArrayBuffer = true;
  }

  // generateQueueId() {
  //   this.currentQueueId += 1;
  //   const nextQueueId = this.currentQueueId % 1024;
  //   const maybeZombie = this.callbackQueueBuffer[nextQueueId];
  //   maybeZombie && maybeZombie.reject();
  //   return nextQueueId;
  // }

  get api() {
    return this.exportApi;
  }

  addMessageCallback(callback) {
    if (typeof callback === 'function') {
      this.messageCallback.push(callback);
    } else {
      console.error(`Can't assign ${typeof callback} as a message callback`);
    }
  }

  setMessageCallback(callback) {
    if (typeof callback === 'function') {
      this.messageCallback = [callback];
    } else {
      console.error(`Can't assign ${typeof callback} as a message callback`);
    }
  }

  // User-land hook to csound's play-state changes
  csoundPlayStateChangeCallback(callback) {
    if (typeof callback !== 'function') {
      console.error(
        `Can't assign ${typeof callback} as a playstate change callback`
      );
    } else {
      this.csoundPlayStateChangeCallback = callback;
    }
  }

  async csoundStop(...argumentz) {}

  // csoundStopClosure(originalCsoundStop) {
  //   return async function(...arguments_) {
  //     if (Atomics.load(this.sharedArrayBuffer, AUDIO_STATE.IS_PERFORMING)) {
  //       return new Promise((resolve, reject) => {
  //         // maybe reject on timeout?
  //         const thisQueueId = getQueueId();
  //         this.callbackQueueBuffer[thisQueueId] = { resolve, reject };
  //         Atomics.add(this.sharedArrayBuffer, AUDIO_STATE.AVAIL_CALLBACKS, 1);
  //         const jsonDebug = JSON.stringify({
  //           queueId: thisQueueId,
  //           fnName,
  //           args: arguments_
  //         });
  //         const encodeDebug = encoder.encode(jsonDebug);
  //         callbackQueueBuffer.set(encodeDebug, thisQueueId * 1024, 1024);
  //       });
  //     }

  //     return await fn.apply(null, arguments_);
  //   };
  // }

  async csoundPause() {
    Atomics.store(this.audioStatePointer, AUDIO_STATE.IS_PAUSED, 1);
    if (typeof this.csoundPlayStateChangeCallback === 'function') {
      this.csoundPlayStateChangeCallback('realtimePerformancePaused');
    }
  }

  async csoundResume() {
    Atomics.store(this.audioStatePointer, AUDIO_STATE.IS_PAUSED, 0);
    if (typeof this.csoundPlayStateChangeCallback === 'function') {
      this.csoundPlayStateChangeCallback('realtimePerformanceResumed');
    }
  }

  async startInputCapture() {
    let micStream = {};
    const stream = await getUserMedia({ video: false, audio: true });
    /*
    const micStream = new MicrophoneStream({
      sampleRate,
      channels: 1,
      bitDepth: 64,
      signed: true,
      float: true
    });
    micStream.setStream(stream);
  */
  }

  async onPlayStateChange(newPlayState) {
    this.currentPlayState = newPlayState;

    switch (newPlayState) {
      case 'realtimePerformanceStarted': {
        await this.prepareRealtimePerformance();
        break;
      }

      case 'realtimePerformanceEnded': {
        // FIXME
        break;
      }

      default: {
        break;
      }
    }

    // forward the message from worker to the audioWorker
    try {
      await this.audioWorker.onPlayStateChange(newPlayState);
    } catch (error) {
      console.error(error);
    }

    this.csoundPlayStateChangeCallback &&
      this.csoundPlayStateChangeCallback(newPlayState);
  }

  async prepareRealtimePerformance(csound) {
    const outputCount = Atomics.load(
      this.audioStatePointer,
      AUDIO_STATE.NCHNLS
    );
    const inputCount = Atomics.load(
      this.audioStatePointer,
      AUDIO_STATE.NCHNLS_I
    );

    const sampleRate = Atomics.load(
      this.audioStatePointer,
      AUDIO_STATE.SAMPLE_RATE
    );

    const hardwareBufferSize = Atomics.load(
      this.audioStatePointer,
      AUDIO_STATE.HW_BUFFER_SIZE
    );

    const softwareBufferSize = Atomics.load(
      this.audioStatePointer,
      AUDIO_STATE.SW_BUFFER_SIZE
    );

    this.audioWorker.sampleRate = sampleRate;
    this.audioWorker.inputCount = inputCount;
    this.audioWorker.outputCount = outputCount;
    this.audioWorker.hardwareBufferSize = hardwareBufferSize;
    this.audioWorker.softwareBufferSize = softwareBufferSize;
  }

  async initialize() {
    const csoundWorker = new Worker(SABWorker());
    const audioStateBuffer = this.audioStateBuffer;
    const audioStreamIn = this.audioStreamIn;
    const audioStreamOut = this.audioStreamOut;
    // both audio worker and csound worker use 1 handler
    // simplifies flow of data (csound main.worker is always first to receive)
    mainMessagePort.onmessage = messageEventHandler(this);
    mainMessagePortAudio.onmessage = messageEventHandler(this);
    csoundWorker.postMessage({ msg: 'initMessagePort' }, [workerMessagePort]);
    workerMessagePort.start();
    const proxyPort = Comlink.wrap(csoundWorker);
    await proxyPort.initialize(this.wasmDataURI);

    for (const apiK of Object.keys(API)) {
      const reference = API[apiK];
      async function callback(...arguments_) {
        return await proxyPort.callUncloned(apiK, arguments_);
      }

      switch (apiK) {
        case 'csoundStart': {
          const csoundStart = async function(csound) {
            if (!csound || typeof csound !== 'number') {
              console.error(
                'csoundStart expects first parameter to be instance of Csound'
              );
              return -1;
            }

            await callback({
              audioStateBuffer,
              audioStreamIn,
              audioStreamOut,
              csound
            });
          };

          csoundStart.toString = () => reference.toString();
          this.exportApi.csoundStart = csoundStart.bind(this);
          break;
        }

        default: {
          callback.toString = () => reference.toString();
          this.exportApi[apiK] = callback;
          break;
        }
      }
    }
  }
}

export default SharedArrayBufferMainThread;
