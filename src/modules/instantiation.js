/*
   csound instantiation module from <csound.h>
   https://csound.com/docs/api/modules.html
*/

/**
 * @typedef {Object} Csound
 * @property {function} csoundCreate
 * @property {function} csoundDestroy
 * @property {function} csoundGetAPIVersion
 */
/**
 * Creates new csound object
 * @callback csoundCreate
 * @return {Csound}
 */
/**
 * Parses an orchestra string
 * @param {Object} wasm
 * @return {csoundCreate}
 */
export const csoundCreate = wasm => () => wasm.exports.csoundCreate(null);

/**
 * Destroys an instance of Csound and frees memory
 * @callback csoundDestroy
 * @param {Csound} csound
 * @return {null}
 */
/**
 * @param {Object} wasm
 * @return {csoundDestroy}
 */
export const csoundDestroy = wasm => csound =>
  wasm.exports.csoundDestroy(csound);

/**
 * Returns the API version as int
 * @callback csoundGetAPIVersion
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetAPIVersion}
 */
export const csoundGetAPIVersion = wasm => () =>
  wasm.exports.csoundGetAPIVersion();

/**
 * Returns the Csound version as int
 * @callback csoundGetVersion
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundGetVersion}
 */
export const csoundGetVersion = wasm => () => wasm.exports.csoundGetVersion();

/**
 * Initialise Csound with specific flags.
 * This function is called internally by csoundCreate(),
 * so there is generally no need to use it explicitly
 * unless you need to avoid default initilization that
 * sets signal handlers and atexit() callbacks.
 * @callback csoundGetVersion
 * @param {Csound} csound
 * @return {number} - Return value is zero on success,
 *     positive if initialisation was done already, and negative on error.
 */
/**
 * @param {Object} wasm
 * @return {csoundGetVersion}
 */
export const csoundInitialize = wasm => flags =>
  wasm.exports.csoundInitialize(flags);
