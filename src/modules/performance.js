/*
   csound performance module from <csound.h>
   https://csound.com/docs/api/modules.html
*/

import { string2ptr } from "@root/utils";

/**
 * Parses a csound orchestra string
 * @callback csoundParseOrc
 * @param {Csound} csound
 * @param {string} orc
 * @return {Object}
 */
/**
 * @param {Object} wasm
 * @return {csoundCreate}
 */
export const csoundParseOrc = wasm => (csound, orc) =>
  wasm.exports.csoundParseOrc(csound, orc);

/**
 * Compiles AST tree
 * @callback csoundCompileTree
 * @param {Csound} csound
 * @param {Object} tree
 * @return {Object}
 */
/**
 * @param {Object} wasm
 * @return {csoundCompileTree}
 */
export const csoundCompileTree = wasm => (csound, tree) =>
  wasm.exports.csoundCompileTree(csound, tree);

// TODO
// csoundDeleteTree (CSOUND *csound, TREE *tree)

/**
 * Compiles a csound orchestra string
 * @callback csoundCompileOrc
 * @param {Csound} csound
 * @param {string} orc
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundCompileOrc}
 */
export const csoundCompileOrc = wasm => (csound, orc) =>
  wasm.exports.csoundCompileOrc(csound, string2ptr(wasm, orc));

/**
 * Compiles a csound orchestra string
 * @callback csoundEvalCode
 * @param {Csound} csound
 * @param {string} orc
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundEvalCode}
 */
export const csoundEvalCode = wasm => (csound, orc) =>
  wasm.exports.csoundEvalCode(csound, orc);

// TODO
// csoundInitializeCscore (CSOUND *, FILE *insco, FILE *outsco)

// TODO
// csoundCompileArgs (CSOUND *, int argc, const char **argv)

/**
 * Prepares Csound for performance
 * @callback csoundStart
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundStart}
 */
export const csoundStart = wasm => (csound, orc) =>
  wasm.exports.csoundStart(csound, orc);

// TODO
// csoundCompile (CSOUND *, int argc, const char **argv)

/**
 * Compiles a Csound input file but does not perform it.
 * @callback csoundCompileCsd
 * @param {Csound} csound
 * @param {string} path
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundCompileCsd}
 */
export const csoundCompileCsd = wasm => (csound, path) =>
  wasm.exports.csoundCompileCsd(csound, path);

/**
 * Compiles a CSD string but does not perform it.
 * @callback csoundCompileCsdText
 * @param {Csound} csound
 * @param {string} orc
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundCompileCsdText}
 */
export const csoundCompileCsdText = wasm => (csound, orc) =>
  wasm.exports.csoundCompileCsdText(csound, orc);

/**
 * Performs(plays) audio until end is reached
 * @callback csoundPerform
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundPerform}
 */
export const csoundPerform = wasm => csound =>
  wasm.exports.csoundPerform(csound);

/**
 * Performs(plays) 1 ksmps worth of sample(s)
 * @callback csoundPerformKsmps
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundPerformKsmps}
 */
export const csoundPerformKsmps = wasm => csound =>
  wasm.exports.csoundPerformKsmpsWasi(csound);

/**
 * Performs(plays) 1 buffer worth of audio
 * @callback csoundPerformBuffer
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundPerformBuffer}
 */
export const csoundPerformBuffer = wasm => csound =>
  wasm.exports.csoundPerformBuffer(csound);

/**
 * Stops a csoundPerform
 * @callback csoundStop
 * @param {Csound} csound
 * @return {null}
 */
/**
 * @param {Object} wasm
 * @return {csoundStop}
 */
export const csoundStop = wasm => csound => wasm.exports.csoundStop(csound);

/**
 * Prints information about the end of a performance,
 * and closes audio and MIDI devices.
 * @callback csoundCleanup
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundCleanup}
 */
export const csoundCleanup = wasm => csound =>
  wasm.exports.csoundCleanup(csound);

/**
 * Prints information about the end of a performance,
 * and closes audio and MIDI devices.
 * @callback csoundReset
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundReset}
 */
export const csoundReset = wasm => csound => wasm.exports.csoundReset(csound);
