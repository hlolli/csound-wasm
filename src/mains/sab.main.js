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
import { audioState, audioStreamIn, audioStreamOut } from '@root/sab';
import { AUDIO_STATE, MAX_CHANNELS } from '@root/constants';

class SharedArrayBufferMainThread {
  constructor(audioWorker) {
    this.audioWorker = audioWorker;
    this.callbackQueue = {};
    this.callbackQueueBuffer = new Uint8Array(this.callbackQueue);
    this.currentPlayState = undefined;
    this.currentQueueId = -1;
    this.exportApi = {};
    this.messageCallbacks = [];
    this.csoundPlayStateChangeCallback = undefined;
    this.sharedArrayBuffer = new Int32Array(audioState);
    this.audioStreamIn = audioStreamIn;
    this.audioStreamOut = audioStreamOut;

    // This will sadly create circular structure
    // that's still mostly harmless.
    audioWorker.csoundWorker = this;
    audioWorker.hasSharedArrayBuffer = true;
  }

  generateQueueId() {
    this.currentQueueId += 1;
    const nextQueueId = this.currentQueueId % 1024;
    const maybeZombie = this.callbackQueueBuffer[nextQueueId];
    maybeZombie && maybeZombie.reject();
    return nextQueueId;
  }

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

  async csoundStop(...args) {
    return this.csoundStop
      ? await this.csoundStopClosure(args)
      : console.error(
          `Csound can't stop anything now since nothing's being performed`
        );
  }

  csoundStopClosure(originalCsoundStop) {
    return async function(...args) {
      if (Atomics.load(this.sharedArrayBuffer, AUDIO_STATE.IS_PERFORMING)) {
        return new Promise((resolve, reject) => {
          // maybe reject on timeout?
          const thisQueueId = getQueueId();
          this.callbackQueueBuffer[thisQueueId] = { resolve, reject };
          Atomics.add(this.sharedArrayBuffer, AUDIO_STATE.AVAIL_CALLBACKS, 1);
          const jsonDebug = JSON.stringify({
            queueId: thisQueueId,
            fnName,
            args
          });
          const encodeDebug = encoder.encode(jsonDebug);
          callbackQueueBuffer.set(encodeDebug, thisQueueId * 1024, 1024);
        });
      } else {
        return await fn.apply(null, args);
      }
    };
  }

  async csoundPause() {
    Atomics.store(this.sharedArrayBuffer, AUDIO_STATE.IS_PAUSED, 1);
    if (typeof this.csoundPlayStateChangeCallback === 'function') {
      this.csoundPlayStateChangeCallback('realtimePerformancePaused');
    }
  }

  async csoundResume() {
    Atomics.store(this.sharedArrayBuffer, AUDIO_STATE.IS_PAUSED, 0);
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
      default: {
        break;
      }
    }

    // forward the message from worker to the audioWorker
    try {
      await this.audioWorker.onPlayStateChange(newPlayState);
    } catch (e) {
      console.error(e);
    }

    this.csoundPlayStateChangeCallback &&
      this.csoundPlayStateChangeCallback(newPlayState);
  }

  async prepareRealtimePerformance(csound) {
    const outputCount = Atomics.load(
      this.sharedArrayBuffer,
      AUDIO_STATE.NCHNLS
    );
    const inputCount = Atomics.load(
      this.sharedArrayBuffer,
      AUDIO_STATE.NCHNLS_I
    );

    const sampleRate = Atomics.load(
      this.sharedArrayBuffer,
      AUDIO_STATE.SAMPLE_RATE
    );

    const hardwareBufferSize = Atomics.load(
      this.sharedArrayBuffer,
      AUDIO_STATE.HW_BUFFER_SIZE
    );

    const softwareBufferSize = Atomics.load(
      this.sharedArrayBuffer,
      AUDIO_STATE.SW_BUFFER_SIZE
    );

    this.audioWorker.sampleRate = sampleRate;
    this.audioWorker.inputCount = inputCount;
    this.audioWorker.outputCount = outputCount;
    this.audioWorker.hardwareBufferSize = hardwareBufferSize;
    this.audioWorker.softwareBufferSize = softwareBufferSize;
  }

  async initialize() {
    const csoundWorker = new Worker(SABWorker);

    // both audio worker and csound worker use 1 handler
    // simplifies flow of data (csound main.worker is always first to receive)
    mainMessagePort.onmessage = messageEventHandler(this);
    mainMessagePortAudio.onmessage = messageEventHandler(this);
    csoundWorker.postMessage({ msg: 'initMessagePort' }, [workerMessagePort]);
    workerMessagePort.start();
    const proxyPort = Comlink.wrap(csoundWorker);
    await proxyPort.initialize();

    for (const apiK of Object.keys(API)) {
      const reference = API[apiK];
      async function cb(...args) {
        return await proxyPort.callUncloned(apiK, args);
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
            // for (
            //   const channelIndex = 0;
            //   channelIndex < this.inputCount;
            //   channelIndex++
            // ) {
            //   this.audioWorker.sampleRate.push(
            //     new Float64Array(
            //       audioStreamIn,
            //       MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            //       MAX_HARDWARE_BUFFER_SIZE
            //     )
            //   );
            //   this.audioWorker.inputCount.push(
            //     new Float64Array(
            //       audioStreamOut,
            //       MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            //       MAX_HARDWARE_BUFFER_SIZE
            //     )
            //   );
            // }
            await cb({
              audioState,
              audioStreamIn,
              audioStreamOut,
              csound
            });
          };
          csoundStart.toString = () => reference.toString();
          this.exportApi['csoundStart'] = csoundStart.bind(this);
          break;
        }
        default: {
          cb.toString = () => reference.toString();
          this.exportApi[apiK] = cb;
          break;
        }
      }
    }
  }
}

export default SharedArrayBufferMainThread;
