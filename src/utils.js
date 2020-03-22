const sizeOf = {
  int: 4,
  MYFLT: 4
};

const decoder = new TextDecoder("utf8");
const encoder = new TextEncoder("utf-8");

export const uint2Str = uint => decoder.decode(uint);
// String.fromCharCode.apply(null, uint);

// eslint-disable-next-line no-unused-vars
export const cleanStdout = stdout => {
  const pattern = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"
  ].join("|");
  const regexPattern = new RegExp(pattern, "g");
  return stdout.replace(regexPattern, "");
};

export const makeLibcsoundFrontEnd = (wasm, fs, libcsoundPreInit) => {
  const libcsoundOut = Object.keys(libcsoundPreInit).reduce(
    (libcsound, key) => {
      libcsound[key] = libcsoundPreInit[key](wasm);
      return libcsound;
    },
    {}
  );
  libcsoundOut["fs"] = fs;
  return libcsoundOut;
};

export const string2ptr = (wasm, str) => {
  if (typeof str !== "string") {
    console.error("Expected string but got", typeof str);
    return;
  }
  const { buffer } = wasm.exports.memory;
  const strBuf = encoder.encode(str);
  const offset = wasm.exports.allocStringMem(strBuf.length);
  const outBuf = new Uint8Array(buffer, offset, strBuf.length + 1);
  outBuf.set(strBuf);
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
    ([params, offset], [paramName, primitive]) => {
      const currSize = sizeOf[primitive];
      const currVal = buffer[offset];
      params[paramName] = currVal;
      return [params, offset + currSize];
    },
    [{}, 0]
  );
  return result;
};

// export const struct2ptr = (wasm, jsStruct) => {
//   const structSize = sizeofStruct(jsStruct);
//   const { buffer } = wasm.exports.memory;
//   const strBuf = encoder.encode(str);
//   const offset = wasm.exports.allocStringMem(strBuf.length);
//   const outBuf = new Uint8Array(buffer, offset, strBuf.length + 1);
//   return outBuf;
// };
