/*
   csound attribute module from <csound.h>
   https://csound.com/docs/api/modules.html
*/

import {
  freeStringPtr,
  sizeofStruct,
  string2ptr,
  structBuffer2Object
} from "@root/utils";
import { CSOUND_PARAMS } from "@root/structures";

/**
 * Returns the sample rate from Csound instance
 * @callback csoundGetSr
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetSr}
 */
export const csoundGetSr = wasm => csound => wasm.exports.csoundGetSr(csound);

/**
 * Returns the control rate from Csound instance
 * @callback csoundGetKr
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetKr}
 */
export const csoundGetKr = wasm => csound => wasm.exports.csoundGetKr(csound);

/**
 * Returns the ksmps value (kr/sr) from Csound instance
 * @callback csoundGetKsmps
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetKsmps}
 */
export const csoundGetKsmps = wasm => csound =>
  wasm.exports.csoundGetKsmps(csound);

/**
 * Returns the number of output channels from Csound instance
 * @callback csoundGetNchnls
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetNchnls}
 */
export const csoundGetNchnls = wasm => csound =>
  wasm.exports.csoundGetNchnls(csound);

/**
 * Returns the number of input channels from Csound instance
 * @callback csoundGetNchnlsInput
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetNchnlsInput}
 */
export const csoundGetNchnlsInput = wasm => csound =>
  wasm.exports.csoundGetNchnlsInput(csound);

/**
 * Returns the value of csoundGet0dBFS
 * @callback csoundGet0dBFS
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGet0dBFS}
 */
export const csoundGet0dBFS = wasm => csound =>
  wasm.exports.csoundGet0dBFS(csound);

/**
 * Returns the A4 frequency reference
 * @callback csoundGetA4
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetA4}
 */
export const csoundGetA4 = wasm => csound => wasm.exports.csoundGetA4(csound);

/**
 * Return the current performance time in samples
 * @callback csoundGetCurrentTimeSamples
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetCurrentTimeSamples}
 */
export const csoundGetCurrentTimeSamples = wasm => csound =>
  wasm.exports.csoundGetCurrentTimeSamples(csound);

/**
 * Return the size of MYFLT in number of bytes
 * @callback csoundGetSizeOfMYFLT
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetSizeOfMYFLT}
 */
export const csoundGetSizeOfMYFLT = wasm => csound =>
  wasm.exports.csoundGetSizeOfMYFLT(csound);

// TODO (do these make any sense in wasm?)
// csoundGetHostData
// csoundSetHostData

/**
 * Set a single csound option (flag),
 * no spaces are allowed in the string.
 * @callback csoundSetOption
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundSetOption}
 */
export const csoundSetOption = wasm => (csound, option) => {
  const stringPtr = string2ptr(wasm, option);
  const result = wasm.exports.csoundSetOption(csound, stringPtr);
  freeStringPtr(wasm, stringPtr);
  return result;
};

/**
 * Configure Csound with a given set of
 * parameters defined in the CSOUND_PARAMS structure.
 * These parameters are the part of the OPARMS struct
 * that are configurable through command line flags.
 * The CSOUND_PARAMS structure can be obtained using
 * csoundGetParams().
 * These options should only be changed before
 * performance has started.
 * @callback csoundSetParams
 * @param {Csound} csound
 * @param {Object} csoundParams
 * @return {null}
 */
/**
 * @param {Object} wasm
 * @return {csoundSetParams}
 */
export const csoundSetParams = wasm => (csound, csoundParams) => {
  wasm.exports.csoundSetParams(csound, csoundParams);
  return null;
};

/**
 * Get the current set of parameters
 * from a Csound instance
 * in a CSOUND_PARAMS structure.
 * @callback csoundGetParams
 * @param {Csound} csound
 * @return {Object} - CSOUND_PARAMS object
 */
/**
 * @param {Object} wasm
 * @return {csoundGetParams}
 */
export const csoundGetParams = wasm => csound => {
  const { buffer } = wasm.exports.memory;
  const structLength = sizeofStruct(CSOUND_PARAMS);
  const structOffset = wasm.exports.allocCsoundParams();
  const structBuffer = new Uint8Array(buffer, structOffset, structLength);
  wasm.exports.csoundGetParams(csound, structOffset);
  const currentCsoundParams = structBuffer2Object(CSOUND_PARAMS, structBuffer);
  wasm.exports.freeCsoundParams(structOffset);
  return currentCsoundParams;
};

/**
 * Returns whether Csound is set to print debug messages
 * sent through the DebugMsg() internal API function.
 * Anything different to 0 means true.
 * @callback csoundGetDebug
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetDebug}
 */
export const csoundGetDebug = wasm => csound =>
  wasm.exports.csoundGetDebug(csound);

/**
 * Return the size of MYFLT in number of bytes
 * @callback csoundSetDebug
 * @param {Csound} csound
 * @param {number} debug
 * @return {null}
 */
/**
 * @param {Object} wasm
 * @return {csoundSetDebug}
 */
export const csoundSetDebug = wasm => (csound, debug) => {
  wasm.exports.csoundSetDebug(csound, debug);
  return null;
};
