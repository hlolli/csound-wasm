import * as Comlink from 'comlink';
import { api as API } from '@root/libcsound';
import VanillaWorker from '@root/workers/vanilla.worker';
import {
  DEFAULT_HARDWARE_BUFFER_SIZE,
  DEFAULT_SOFTWARE_BUFFER_SIZE,
  MAX_CHANNELS,
  MAX_HARDWARE_BUFFER_SIZE,
} from '@root/constants.js';

import {
  messageEventHandler,
  mainMessagePortAudio,
  mainMessagePort,
  workerMessagePort,
  csoundWorkerAudioInputPort,
  csoundWorkerFrameRequestPort,
} from '@root/mains/messages.main';

class VanillaWorkerMainThread {
  constructor(audioWorker, wasmDataURI) {
    this.audioStreamIn = new Float64Array(
      MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float64Array.BYTES_PER_ELEMENT
    );

    this.audioStreamOut = new Float64Array(
      MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float64Array.BYTES_PER_ELEMENT
    );

    audioWorker.csoundWorkerMain = this;
    this.audioWorker = audioWorker;
    this.wasmDataURI = wasmDataURI;
    this.exportApi = {};
    this.csound = undefined;
    this.currentPlayState = undefined;
    this.intervalCb = undefined;
    this.messageCallbacks = [];
    this.csoundPlayStateChangeCallbacks = [];
  }

  get api() {
    return this.exportApi;
  }

  async prepareRealtimePerformance() {
    if (!this.csound) {
      console.error(`fatal error: csound instance not found?`);
      return;
    }
    this.audioWorker.sampleRate = await this.exportApi.csoundGetSr(this.csound);

    this.audioWorker.isRequestingInput = (
      await this.exportApi.csoundGetInputName(this.csound)
    ).includes('adc');
    this.audioWorker.outputsCount = await this.exportApi.csoundGetNchnls(
      this.csound
    );
    this.audioWorker.hardwareBufferSize = DEFAULT_HARDWARE_BUFFER_SIZE;
    this.audioWorker.softwareBufferSize = DEFAULT_SOFTWARE_BUFFER_SIZE;
  }

  async onPlayStateChange(newPlayState) {
    this.currentPlayState = newPlayState;

    switch (newPlayState) {
      case 'realtimePerformanceStarted': {
        await this.prepareRealtimePerformance();
        break;
      }

      case 'realtimePerformanceEnded': {
        break;
      }

      default: {
        break;
      }
    }

    // forward the message from worker to the audioWorker
    try {
      if (!this.audioWorker) {
        console.error(`fatal error: audioWorker not initialized!`);
      } else {
        this.audioWorker.onPlayStateChange(newPlayState);
      }
    } catch (e) {
      console.error(`Csound thread crashed while receiving an IPC message`);
    }
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
      console.error(
        `Can't assign ${typeof callback} as a playstate change callback`
      );
    } else {
      this.csoundPlayStateChangeCallbacks = [callback];
    }
  }

  async addCsoundPlayStateChangeCallback(callback) {
    if (typeof callback !== 'function') {
      console.error(
        `Can't assign ${typeof callback} as a playstate change callback`
      );
    } else {
      this.csoundPlayStateChangeCallbacks.push(callback);
    }
  }

  async initialize() {
    const csoundWorker = new Worker(VanillaWorker());
    const audioStreamIn = this.audioStreamIn;
    const audioStreamOut = this.audioStreamOut;
    mainMessagePort.onmessage = messageEventHandler(this);
    mainMessagePortAudio.onmessage = messageEventHandler(this);
    csoundWorker.postMessage({ msg: 'initMessagePort' }, [workerMessagePort]);
    csoundWorker.postMessage({ msg: 'initRequestPort' }, [
      csoundWorkerFrameRequestPort,
    ]);
    csoundWorker.postMessage({ msg: 'initAudioInputPort' }, [
      csoundWorkerAudioInputPort,
    ]);

    workerMessagePort.start();

    const proxyPort = Comlink.wrap(csoundWorker);
    this.proxyPort = proxyPort;
    await proxyPort.initialize(this.wasmDataURI);

    this.exportApi.setMessageCallback = this.setMessageCallback.bind(this);
    this.exportApi.addMessageCallback = this.addMessageCallback.bind(this);
    this.exportApi.setCsoundPlayStateChangeCallback = this.setCsoundPlayStateChangeCallback.bind(
      this
    );
    this.exportApi.addCsoundPlayStateChangeCallback = this.addCsoundPlayStateChangeCallback.bind(
      this
    );

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

            this.csound = csound;
            await callback({
              audioStreamIn,
              audioStreamOut,
              csound,
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

export default VanillaWorkerMainThread;
