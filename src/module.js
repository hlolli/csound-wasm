/* eslint-disable */
/* eslint-disable new-cap */
import { WASI } from "@wasmer/wasi/lib/index.esm.js";
import { WasmFs } from "@wasmer/wasmfs";
import { inflate } from "pako";
import browserBindings from "@wasmer/wasi/lib/bindings/browser";
import { lowerI64Imports } from "@wasmer/wasm-transformer";
import { cleanStdout, uint2Str } from "./utils";
import { LineReader } from "line-reader-browser";
import * as path from "path";

export const wasmFs = new WasmFs();

const bindings = {
  ...browserBindings,
  fs: wasmFs.fs,
  path
};

const preopens = {
  "/": "/"
};

const wasi = new WASI({
  preopens,
  env: {},
  bindings
});

let stdErrPos = 0;
const stdErrBuffer = [];
const stdErrCallback = data => {
  const cleanString = cleanStdout(uint2Str(data));
  if (cleanString.includes("\n")) {
    const [firstEl, ...next] = cleanString.split("\n");
    let outstr = "";
    while (stdErrBuffer.length > 0) {
      outstr += stdErrBuffer[0];
      stdErrBuffer.shift();
    }
    outstr += firstEl;
    // here the actual callback takes place
    console.log(outstr);
    next.forEach(s => stdErrBuffer.push(s));
  } else {
    stdErrBuffer.push(cleanString);
  }
};

const createStdErrStream = () => {
  wasmFs.fs.watch(
    "/dev/stderr",
    { encoding: "buffer" },
    (eventType, filename) => {
      if (filename) {
        const contents = wasmFs.fs.readFileSync("/dev/stderr");
        stdErrCallback(contents.slice(stdErrPos));
        stdErrPos = contents.length;
      }
    }
  );
};

let stdOutPos = 0;
const stdOutBuffer = [];
const stdOutCallback = data => {
  const cleanString = cleanStdout(uint2Str(data));
  if (cleanString.includes("\n")) {
    const [firstEl, ...next] = cleanString.split("\n");
    let outstr = "";
    while (stdOutBuffer.length > 0) {
      outstr += stdOutBuffer[0];
      stdOutBuffer.shift();
    }
    outstr += firstEl;
    // here the actual callback takes place
    console.log(outstr);
    next.forEach(s => stdOutBuffer.push(s));
  } else {
    stdOutBuffer.push(cleanString);
  }
};

const createStdOutStream = () => {
  wasmFs.fs.watch(
    "/dev/stdout",
    { encoding: "buffer" },
    (eventType, filename) => {
      if (filename) {
        const contents = wasmFs.fs.readFileSync("/dev/stdout");
        stdOutCallback(contents.slice(stdOutPos));
        stdOutPos = contents.length;
      }
    }
  );
};

const load = async () => {
  const { default: response } = await import("../lib/libcsound.wasm.zlib");
  await wasmFs.volume.mkdirpBase("/csound");
  const wasmZlib = new Uint8Array(response);
  const wasmBytes = inflate(wasmZlib);
  const transformedBinary = await lowerI64Imports(wasmBytes);
  const module = await WebAssembly.compile(transformedBinary);
  const options = wasi.getImports(module);
  options["env"] = {};
  const instance = await WebAssembly.instantiate(module, options);
  wasi.start(instance);
  createStdErrStream();
  createStdOutStream();
  return instance;
};

/**
 * The module which downloads/loads and
 * instanciates the wasm binary.
 * @async
 * @return {Promise.<Object>}
 */
export default async function getLibcsoundWasm() {
  const wasm = await load();
  return wasm;
}
