import { freeStringPtr, string2ptr } from '@root/utils';

/**
 * Append 'value' to environment variable 'name'
 * added for internal usage of csound-wasm, feel
 * free to use as well ;)
 */
export const csoundAppendEnv = wasm => (csound, variable, value) => {
  const varStrPtr = string2ptr(wasm, variable);
  const valStrPtr = string2ptr(wasm, value);
  const res = wasm.exports.csoundAppendEnv(csound, varStrPtr, valStrPtr);
  freeStringPtr(wasm, varStrPtr);
  freeStringPtr(wasm, valStrPtr);
  return res;
};

csoundAppendEnv.toString = () =>
  `csoundAppendEnv = async (csound, variable, value) => Number;`;
