import * as Comlink from 'comlink';
import WorkletWorker from '@root/workers/worklet.worker';
import log, { logWorklet } from '@root/logger';
import {
  audioWorkerAudioInputPort,
  audioWorkerFrameRequestPort,
  cleanupPorts,
  emitInternalCsoundLogEvent,
  workerMessagePortAudio,
} from '@root/mains/messages.main';

const connectedMidiDevices = new Set();

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
    logWorklet('AudioWorkletMainThread was constructed');
  }

  async onPlayStateChange(newPlayState) {
    this.currentPlayState = newPlayState;
    switch (newPlayState) {
      case 'realtimePerformanceStarted': {
        logWorklet('event received: realtimePerformanceStarted');
        await this.initialize();
        break;
      }
      case 'realtimePerformanceEnded': {
        logWorklet(
          'event received: realtimePerformanceEnded' + !this.csoundWorkerMain.hasSharedArrayBuffer
            ? ` cleaning up Vanilla ports`
            : ''
        );
        !this.csoundWorkerMain.hasSharedArrayBuffer && cleanupPorts(this.csoundWorkerMain);
        this.audioCtx.close();
        this.audioWorkletNode.disconnect();

        this.audioCtx = undefined;
        this.audioWorkletNode = undefined;
        this.currentPlayState = undefined;
        this.workletProxy = undefined;
        this.sampleRate = undefined;
        this.inputsCount = undefined;
        this.outputsCount = undefined;
        this.hardwareBufferSize = undefined;
        this.softwareBufferSize = undefined;
        break;
      }
      default: {
        break;
      }
    }
  }

  // SAB bypasses this mechanism!
  connectPorts() {
    logWorklet('initializing MessagePort on worker threads');
    this.audioWorkletNode.port.postMessage({ msg: 'initMessagePort' }, [workerMessagePortAudio]);
    this.audioWorkletNode.port.postMessage({ msg: 'initAudioInputPort' }, [
      audioWorkerAudioInputPort,
    ]);
    this.audioWorkletNode.port.postMessage({ msg: 'initRequestPort' }, [
      audioWorkerFrameRequestPort,
    ]);

    try {
      logWorklet('wrapping Comlink proxy endpoint on the audioWorkletNode.port');
      this.workletProxy = Comlink.wrap(this.audioWorkletNode.port);
    } catch (error) {
      log.error('COMLINK ERROR', error);
    }
  }

  async initialize() {
    this.audioCtx = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: this.sampleRate,
    });
    logWorklet('new AudioContext');
    try {
      await this.audioCtx.audioWorklet.addModule(WorkletWorker());
      logWorklet('WorkletWorker module added');
    } catch (error) {
      log.error(error);
      return;
    }

    if (!this.csoundWorkerMain) {
      log.error(`fatal: worker not reachable from worklet-main thread`);
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
          maybeSharedArrayBuffer:
            this.csoundWorkerMain.hasSharedArrayBuffer && this.csoundWorkerMain.audioStatePointer,
          maybeSharedArrayBufferAudioIn:
            this.csoundWorkerMain.hasSharedArrayBuffer && this.csoundWorkerMain.audioStreamIn,
          maybeSharedArrayBufferAudioOut:
            this.csoundWorkerMain.hasSharedArrayBuffer && this.csoundWorkerMain.audioStreamOut,
        },
      }));

    if (this.isRequestingMidi) {
      emitInternalCsoundLogEvent(this.csoundWorkerMain, 'requesting for web-midi connection');
      if (navigator && navigator.requestMIDIAccess) {
        try {
          const midiDevices = await navigator.requestMIDIAccess();
          if (midiDevices.inputs) {
            const midiInputs = midiDevices.inputs.values();
            for (let input = midiInputs.next(); input && !input.done; input = midiInputs.next()) {
              emitInternalCsoundLogEvent(
                this.csoundWorkerMain,
                `Connecting midi-input: ${input.value.name || 'unkown'}`
              );
              if (!connectedMidiDevices.has(input.value.name || 'unkown')) {
                input.value.onmidimessage = this.csoundWorkerMain.handleMidiInput.bind(
                  this.csoundWorkerMain
                );
                connectedMidiDevices.add(input.value.name || 'unkown');
              }
            }
          } else {
            emitInternalCsoundLogEvent(this.csoundWorkerMain, 'no midi-device detected');
          }
        } catch (error) {
          emitInternalCsoundLogEvent(
            this.csoundWorkerMain,
            'error while connecting web-midi: ' + error
          );
        }
      } else {
        emitInternalCsoundLogEvent(
          this.csoundWorkerMain,
          'no web-midi support found, midi-input will not work!'
        );
      }
    }

    if (this.isRequestingInput) {
      const getUserMedia =
        typeof navigator.mediaDevices !== 'undefined'
          ? navigator.mediaDevices.getUserMedia
          : navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

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

      logWorklet('requesting microphone access');
      typeof navigator.mediaDevices !== 'undefined'
        ? getUserMedia
            .call(navigator.mediaDevices, {
              audio: { echoCancellation: false, sampleSize: 32 },
            })
            .then(microphoneCallback)
            .catch(log.error)
        : getUserMedia.call(
            navigator,
            {
              audio: {
                optional: [{ echoCancellation: false, sampleSize: 32 }],
              },
            },
            microphoneCallback,
            log.error
          );
    } else {
      this.audioWorkletNode = createWorkletNode();
      logWorklet('connecting Node to AudioContext destination');
      this.audioWorkletNode.connect(this.audioCtx.destination);
      !this.csoundWorkerMain.hasSharedArrayBuffer && this.connectPorts();
    }
  }
}

export default AudioWorkletMainThread;
