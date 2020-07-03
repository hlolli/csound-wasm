import * as Comlink from 'comlink';
import { curry } from 'ramda';
import { cleanStdout, uint2Str } from '@root/utils';
import { WasmFs } from '@wasmer/wasmfs';

const IS_PRODUCTION = false;

export const wasmFs = new WasmFs();

export const preopens = {
  '/': '/'
};

export const workerMessagePort = {
  ready: false,
  post: () => {},
  broadcastPlayState: () => {}
};

let stdErrPos = 0;
const stdErrBuffer = [];

let stdOutPos = 0;
const stdOutBuffer = [];

const stdErrCallback = data => {
  const cleanString = cleanStdout(uint2Str(data));
  if (cleanString.includes('\n')) {
    const [firstEl, ...next] = cleanString.split('\n');
    let outstr = '';
    while (stdErrBuffer.length > 0) {
      outstr += stdErrBuffer[0];
      stdErrBuffer.shift();
    }
    outstr += firstEl || '';

    if (outstr && workerMessagePort.ready) {
      workerMessagePort.post(outstr);
    }
    next.forEach(s => stdErrBuffer.push(s));
  } else {
    stdErrBuffer.push(cleanString);
  }
};

const createStdErrStream = () => {
  wasmFs.fs.watch(
    '/dev/stderr',
    { encoding: 'buffer' },
    (eventType, filename) => {
      if (filename) {
        const contents = wasmFs.fs.readFileSync('/dev/stderr');
        stdErrCallback(contents.slice(stdErrPos));
        stdErrPos = contents.length;
      }
    }
  );
};

const stdOutCallback = data => {
  const cleanString = cleanStdout(uint2Str(data));
  if (cleanString.includes('\n')) {
    const [firstEl, ...next] = cleanString.split('\n');
    let outstr = '';
    while (stdOutBuffer.length > 0) {
      outstr += stdOutBuffer[0];
      stdOutBuffer.shift();
    }
    outstr += firstEl;
    if (outstr && workerMessagePort.ready) {
      workerMessagePort.post(outstr);
    }
    next.forEach(s => stdOutBuffer.push(s));
  } else {
    stdOutBuffer.push(cleanString);
  }
};

export const createStdOutStream = () => {
  wasmFs.fs.watch(
    '/dev/stdout',
    { encoding: 'buffer' },
    (eventType, filename) => {
      if (filename) {
        const contents = wasmFs.fs.readFileSync('/dev/stdout');
        stdOutCallback(contents.slice(stdOutPos));
        stdOutPos = contents.length;
      }
    }
  );
};

export async function copyToFs(arrayBuffer, filePath) {
  const realPath = path.join('/csound', filePath);
  const buf = Buffer.from(new Uint8Array(arrayBuffer));
  wasmFs.fs.writeFileSync(realPath, buf);
  return null;
}

// all folders are stored under /csound, it seems as if
// sanboxing security increases, we are safer to have all assets
// nested from 1 and same root,
// this implementation is hidden from the Csound runtime itself with a hack
export async function mkdirp(filePath) {
  const result = wasmFs.volume.mkdirpSync(path.join('/csound', filePath), {
    mode: '0o777'
  });
  return null;
}

export const intiFS = async () => {
  await wasmFs.volume.mkdirSync('/csound');
  createStdErrStream();
  createStdOutStream();
};
