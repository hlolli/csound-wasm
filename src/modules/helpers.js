/*
   csound helpers - defened in libcsound-wasm
   in nix/helpers.c
*/

/**
 * Prepares csound for host controlled
 * realtime performance.
 * @callback csoundPrepareRT
 * @param {Csound} csound
 * @return {null}
 */
/**
 * @param {Object} wasm
 * @return {csoundPrepareRT}
 */
export const csoundPrepareRT = wasm => csound =>
  wasm.exports.csoundPrepareRT(csound);
