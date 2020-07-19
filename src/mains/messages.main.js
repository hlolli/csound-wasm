import * as Comlink from 'comlink';

const defaultLogger = console.log;
const loggerPool = new Set();

// initial state
loggerPool.add(defaultLogger);

// exec log-event: msg => cb(msg)
export const messageEventHandler = worker => event =>
  event.data.log
    ? loggerPool.forEach(callback => callback(event.data.log))
    : worker.onPlayStateChange(event.data.playStateChange);

export const audioFramesRequestHandler = worker => event =>
  event.data.log
    ? loggerPool.forEach(callback => callback(event.data.log))
    : worker.onPlayStateChange(event.data.playStateChange);

export const {
  port1: mainMessagePort,
  port2: workerMessagePort,
} = new MessageChannel();

export const {
  port1: mainMessagePortAudio,
  port2: workerMessagePortAudio,
} = new MessageChannel();

export const {
  port1: csoundWorkerFrameRequestPort,
  port2: audioWorkerFrameRequestPort,
} = new MessageChannel();

export const {
  port1: csoundWorkerAudioInputPort,
  port2: audioWorkerAudioInputPort,
} = new MessageChannel();
