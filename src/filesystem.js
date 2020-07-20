import path from 'path';
import { cleanStdout, uint2String } from '@root/utils';
import { WasmFs } from '@wasmer/wasmfs';

export const wasmFs = new WasmFs();

export const preopens = {
  '/': '/',
};

export const workerMessagePort = {
  ready: false,
  post: () => {},
  broadcastPlayState: () => {},
  vanillaWorkerState: undefined,
};

let stdErrorPos = 0;
const stdErrorBuffer = [];

let stdOutPos = 0;
const stdOutBuffer = [];

const stdErrorCallback = data => {
  const cleanString = cleanStdout(uint2String(data));
  if (cleanString.includes('\n')) {
    const [firstElement, ...next] = cleanString.split('\n');
    let outstr = '';
    while (stdErrorBuffer.length > 0) {
      outstr += stdErrorBuffer[0];
      stdErrorBuffer.shift();
    }

    outstr += firstElement || '';

    if (outstr && workerMessagePort.ready) {
      workerMessagePort.post(outstr);
    }

    next.forEach(s => stdErrorBuffer.push(s));
  } else {
    stdErrorBuffer.push(cleanString);
  }
};

const createStdErrorStream = () => {
  wasmFs.fs.watch('/dev/stderr', { encoding: 'buffer' }, (eventType, filename) => {
    if (filename) {
      const contents = wasmFs.fs.readFileSync('/dev/stderr');
      stdErrorCallback(contents.slice(stdErrorPos));
      stdErrorPos = contents.length;
    }
  });
};

const stdOutCallback = data => {
  const cleanString = cleanStdout(uint2String(data));
  if (cleanString.includes('\n')) {
    const [firstElement, ...next] = cleanString.split('\n');
    let outstr = '';
    while (stdOutBuffer.length > 0) {
      outstr += stdOutBuffer[0];
      stdOutBuffer.shift();
    }

    outstr += firstElement;
    if (outstr && workerMessagePort.ready) {
      workerMessagePort.post(outstr);
    }

    next.forEach(s => stdOutBuffer.push(s));
  } else {
    stdOutBuffer.push(cleanString);
  }
};

export const createStdOutStream = () => {
  wasmFs.fs.watch('/dev/stdout', { encoding: 'buffer' }, (eventType, filename) => {
    if (filename) {
      const contents = wasmFs.fs.readFileSync('/dev/stdout');
      stdOutCallback(contents.slice(stdOutPos));
      stdOutPos = contents.length;
    }
  });
};

export async function copyToFs(arrayBuffer, filePath) {
  const realPath = path.join('/csound', filePath);
  const buf = Buffer.from(new Uint8Array(arrayBuffer));
  wasmFs.fs.writeFileSync(realPath, buf);
}

// all folders are stored under /csound, it seems as if
// sanboxing security increases, we are safer to have all assets
// nested from 1 and same root,
// this implementation is hidden from the Csound runtime itself with a hack
export async function mkdirp(filePath) {
  wasmFs.volume.mkdirpSync(path.join('/csound', filePath), {
    mode: '0o777',
  });
}

export const intiFS = async () => {
  await wasmFs.volume.mkdirSync('/csound');
  createStdErrorStream();
  createStdOutStream();
};
