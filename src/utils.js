const sizeOf = {
  int: 4,
  MYFLT: 4,
};

export const decoder = new TextDecoder('utf-8');
export const encoder = new TextEncoder('utf-8');

export const uint2String = uint => decoder.decode(uint);

// smth I found on stackoverflow
export const trimNull = a => {
  const c = a.indexOf('\0');
  if (c > -1) {
    return a.slice(0, Math.max(0, c));
  }

  return a;
};

// eslint-disable-next-line no-unused-vars
export const cleanStdout = stdout => {
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join('|');
  const regexPattern = new RegExp(pattern, 'g');
  return stdout.replace(regexPattern, '');
};

export const string2ptr = (wasm, string) => {
  if (typeof string !== 'string') {
    console.error('Expected string but got', typeof string);
    return;
  }

  const { buffer } = wasm.exports.memory;
  const stringBuf = encoder.encode(string);
  const offset = wasm.exports.allocStringMem(stringBuf.length);
  const outBuf = new Uint8Array(buffer, offset, stringBuf.length + 1);
  outBuf.set(stringBuf);
  return offset;
};

export const sizeofStruct = jsStruct => {
  const result = jsStruct.reduce((total, [_, primitive]) => {
    return (total += sizeOf[primitive]);
  }, 0);
  return result;
};

export const freeStringPtr = (wasm, ptr) => {
  wasm.exports.freeStringMem(ptr);
};

export const structBuffer2Object = (jsStruct, buffer) => {
  const [result] = jsStruct.reduce(
    ([parameters, offset], [parameterName, primitive]) => {
      const currentSize = sizeOf[primitive];
      const currentValue = buffer[offset];
      parameters[parameterName] = currentValue;
      return [parameters, offset + currentSize];
    },
    [{}, 0]
  );
  return result;
};

export const nearestPowerOf2 = n => {
  return 1 << (31 - Math.clz32(n));
};

const isFirefox = () => navigator.userAgent.toLowerCase().includes('firefox');

export const isSabSupported = () =>
  !isFirefox() && window.Atomics !== 'undefined' && window.SharedArrayBuffer !== 'undefined';

export const areWorkletsSupportet = () => typeof AudioNode !== 'undefined' && typeof AudioWorkletNode !== 'undefined';

export const makeProxyCallback = (proxyPort, apiK) => async (...arguments_) => {
  return await proxyPort.callUncloned(apiK, arguments_);
};
