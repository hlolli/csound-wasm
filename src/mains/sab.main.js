import * as Comlink from 'comlink';
import { api as API } from '@root/libcsound';
import {
  messageEventHandler,
  mainMessagePortAudio,
  mainMessagePort,
  workerMessagePort,
} from '@root/mains/messages.main';
import SABWorker from '@root/workers/sab.worker';
import { AUDIO_STATE, MAX_CHANNELS, MAX_HARDWARE_BUFFER_SIZE, initialSharedState } from '@root/constants';
import { makeProxyCallback } from '@root/utils';

class SharedArrayBufferMainThread {
  constructor(audioWorker, wasmDataURI) {
    this.audioWorker = audioWorker;
    this.wasmDataURI = wasmDataURI;
    this.currentPlayState = undefined;
    this.exportApi = {};
    this.messageCallbacks = [];
    this.csoundPlayStateChangeCallbacks = [];

    this.audioStateBuffer = new SharedArrayBuffer(initialSharedState.length * Int32Array.BYTES_PER_ELEMENT);

    this.audioStatePointer = new Int32Array(this.audioStateBuffer);

    this.audioStreamIn = new SharedArrayBuffer(
      MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float64Array.BYTES_PER_ELEMENT
    );
    this.audioStreamOut = new SharedArrayBuffer(
      MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float64Array.BYTES_PER_ELEMENT
    );

    // This will sadly create circular structure
    // that's still mostly harmless.
    audioWorker.csoundWorkerMain = this;
    this.hasSharedArrayBuffer = true;
  }

  get api() {
    return this.exportApi;
  }

  async addMessageCallback(callback) {
    if (typeof callback === 'function') {
      this.messageCallbacks.push(callback);
    } else {
      console.error(`Can't assign ${typeof callback} as a message callback`);
    }
  }

  async setMessageCallback(callback) {
    if (typeof callback === 'function') {
      this.messageCallbacks = [callback];
    } else {
      console.error(`Can't assign ${typeof callback} as a message callback`);
    }
  }

  // User-land hook to csound's play-state changes
  async setCsoundPlayStateChangeCallback(callback) {
    if (typeof callback !== 'function') {
      console.error(`Can't assign ${typeof callback} as a playstate change callback`);
    } else {
      this.csoundPlayStateChangeCallbacks = [callback];
    }
  }

  async addCsoundPlayStateChangeCallback(callback) {
    if (typeof callback !== 'function') {
      console.error(`Can't assign ${typeof callback} as a playstate change callback`);
    } else {
      this.csoundPlayStateChangeCallbacks.push(callback);
    }
  }

  async csoundPause() {
    if (!Atomics.load(this.audioStatePointer, AUDIO_STATE.IS_PAUSED)) {
      Atomics.store(this.audioStatePointer, AUDIO_STATE.IS_PAUSED, 1);
      this.onPlayStateChange('realtimePerformancePaused');
    }
  }

  async csoundResume() {
    if (Atomics.load(this.audioStatePointer, AUDIO_STATE.IS_PAUSED)) {
      Atomics.store(this.audioStatePointer, AUDIO_STATE.IS_PAUSED, 0);
      Atomics.notify(this.audioStatePointer, AUDIO_STATE.IS_PAUSED);
      this.onPlayStateChange('realtimePerformanceResumed');
    }
  }

  async onPlayStateChange(newPlayState) {
    this.currentPlayState = newPlayState;

    switch (newPlayState) {
      case 'realtimePerformanceStarted': {
        await this.prepareRealtimePerformance();
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

    this.csoundPlayStateChangeCallbacks.forEach(callback => {
      try {
        callback(newPlayState);
      } catch (error) {
        console.error(error);
      }
    });
  }

  async prepareRealtimePerformance() {
    const outputsCount = Atomics.load(this.audioStatePointer, AUDIO_STATE.NCHNLS);
    const inputCount = Atomics.load(this.audioStatePointer, AUDIO_STATE.NCHNLS_I);

    this.audioWorker.isRequestingInput = inputCount > 0;

    const sampleRate = Atomics.load(this.audioStatePointer, AUDIO_STATE.SAMPLE_RATE);

    const hardwareBufferSize = Atomics.load(this.audioStatePointer, AUDIO_STATE.HW_BUFFER_SIZE);

    const softwareBufferSize = Atomics.load(this.audioStatePointer, AUDIO_STATE.SW_BUFFER_SIZE);

    this.audioWorker.sampleRate = sampleRate;
    this.audioWorker.inputCount = inputCount;
    this.audioWorker.outputsCount = outputsCount;
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
    mainMessagePort.addEventListener('message', messageEventHandler(this));
    mainMessagePortAudio.addEventListener('message', messageEventHandler(this));
    csoundWorker.postMessage({ msg: 'initMessagePort' }, [workerMessagePort]);
    workerMessagePort.start();
    const proxyPort = Comlink.wrap(csoundWorker);
    await proxyPort.initialize(this.wasmDataURI);

    this.exportApi.setMessageCallback = this.setMessageCallback.bind(this);
    this.exportApi.addMessageCallback = this.addMessageCallback.bind(this);
    this.exportApi.setCsoundPlayStateChangeCallback = this.setCsoundPlayStateChangeCallback.bind(this);
    this.exportApi.addCsoundPlayStateChangeCallback = this.addCsoundPlayStateChangeCallback.bind(this);

    this.exportApi.csoundPause = this.csoundPause.bind(this);
    this.exportApi.csoundResume = this.csoundResume.bind(this);

    for (const apiK of Object.keys(API)) {
      const proxyCallback = makeProxyCallback(proxyPort, apiK);
      const reference = API[apiK];

      switch (apiK) {
        case 'csoundStart': {
          const csoundStart = async function(csound) {
            if (!csound || typeof csound !== 'number') {
              console.error('csoundStart expects first parameter to be instance of Csound');
              return -1;
            }

            await proxyCallback({
              audioStateBuffer,
              audioStreamIn,
              audioStreamOut,
              csound,
            });
          };

          csoundStart.toString = () => reference.toString();
          this.exportApi.csoundStart = csoundStart.bind(this);
          break;
        }

        case 'csoundStop': {
          const csoundStop = async function(csound) {
            if (
              this.currentPlayState === 'realtimePerformanceStarted' ||
              this.currentPlayState === 'realtimePerformancePaused' ||
              this.currentPlayState === 'realtimePerformanceResumed'
            ) {
              Atomics.store(this.audioStatePointer, AUDIO_STATE.STOP, 1);
              if (this.currentPlayState === 'realtimePerformancePaused') {
                Atomics.store(this.audioStatePointer, AUDIO_STATE.IS_PAUSED, 0);
                Atomics.notify(this.audioStatePointer, AUDIO_STATE.IS_PAUSED);
              }
            }
          };
          this.exportApi.csoundStop = csoundStop.bind(this);
          csoundStop.toString = () => reference.toString();
          break;
        }

        default: {
          proxyCallback.toString = () => reference.toString();
          this.exportApi[apiK] = proxyCallback;
          break;
        }
      }
    }
  }
}

export default SharedArrayBufferMainThread;
