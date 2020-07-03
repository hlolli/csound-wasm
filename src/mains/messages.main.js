import * as Comlink from 'comlink';

const defaultLogger = console.log;
const loggerPool = new Set();

// initial state
loggerPool.add(defaultLogger);

// exec log-event: msg => cb(msg)
export const messageEventHandler = worker => event =>
  event.data.log
    ? loggerPool.forEach(cb => cb(event.data.log))
    : worker.onPlayStateChange(event.data.playStateChange);

export const {
  port1: mainMessagePort,
  port2: workerMessagePort
} = new MessageChannel();

export const {
  port1: mainMessagePortAudio,
  port2: workerMessagePortAudio
} = new MessageChannel();
