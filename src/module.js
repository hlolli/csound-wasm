import { WASI } from '@wasmer/wasi';
// import browserBindings from '@wasmer/wasi/lib/bindings/browser';
import { lowerI64Imports } from '@wasmer/wasm-transformer';
import { inflate } from 'pako';
import { initFS, preopens, wasmFs } from '@root/filesystem';
import * as path from 'path';

export const bindings = {
  ...WASI.defaultBindings,
  fs: wasmFs.fs,
  path,
};

const wasi = new WASI({
  preopens,
  env: {},
  bindings,
});

export default async function(wasmDataURI) {
  await wasmFs.volume.mkdirSync('/sandbox');
  const wasmZlib = new Uint8Array(wasmDataURI);
  const wasmBytes = inflate(wasmZlib);
  const transformedBinary = await lowerI64Imports(wasmBytes);
  const module = await WebAssembly.compile(transformedBinary);
  const options = wasi.getImports(module);
  const instance = await WebAssembly.instantiate(module, options);
  wasi.start(instance);
  await initFS(instance);
  return instance;
}
