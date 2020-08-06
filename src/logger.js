import ololog from 'ololog';
import { bgLightCyan, bgBlack, white } from 'ansicolor';

const defaultLogger = ololog.configure({
  tag: true,
  time: {
    yes: true,
    format: 'iso',
    print: date =>
      `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}`,
  },
  locate: { shift: 4 },
});

export const logWorklet = (...argumentz) =>
  defaultLogger.info.apply(undefined, [`${bgLightCyan('AudioWorklet')}`].concat(argumentz));

export const logSAB = (...argumentz) =>
  defaultLogger.info.apply(undefined, [`${bgBlack(white('SAB'))}`].concat(argumentz));

export default defaultLogger;
