const defaultLogger = console.log;
const loggerPool = new Set();

// initial state
loggerPool.add(defaultLogger);

// exec log-event: msg => cb(msg)
export const messageEventHandler = worker => event => {
  if (event.data.log) {
    loggerPool.forEach(callback => callback(event.data.log));
    (worker.messageCallbacks || []).forEach(callback => callback(event.data.log));
  } else {
    worker.onPlayStateChange(event.data.playStateChange);
  }
};

export let { port1: mainMessagePort, port2: workerMessagePort } = new MessageChannel();

export let { port1: mainMessagePortAudio, port2: workerMessagePortAudio } = new MessageChannel();

export let { port1: csoundWorkerFrameRequestPort, port2: audioWorkerFrameRequestPort } = new MessageChannel();

export let { port1: csoundWorkerAudioInputPort, port2: audioWorkerAudioInputPort } = new MessageChannel();

const iterableMessageChannel = () => {
  const { port1, port2 } = new MessageChannel();
  return [port1, port2];
};

export const cleanupPorts = csoundWorkerMain => {
  [mainMessagePort, workerMessagePort] = iterableMessageChannel();
  [mainMessagePortAudio, workerMessagePortAudio] = iterableMessageChannel();
  [csoundWorkerFrameRequestPort, audioWorkerFrameRequestPort] = iterableMessageChannel();
  [csoundWorkerAudioInputPort, audioWorkerAudioInputPort] = iterableMessageChannel();

  mainMessagePort.addEventListener('message', messageEventHandler(csoundWorkerMain));
  mainMessagePortAudio.addEventListener('message', messageEventHandler(csoundWorkerMain));

  mainMessagePort.start();
  mainMessagePortAudio.start();

  csoundWorkerMain.csoundWorker.postMessage({ msg: 'initRequestPort' }, [csoundWorkerFrameRequestPort]);
  csoundWorkerMain.csoundWorker.postMessage({ msg: 'initAudioInputPort' }, [csoundWorkerAudioInputPort]);
};
