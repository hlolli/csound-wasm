const fs = require('fs');
const path = require('path');
const DataURI = require('datauri').promise;
const replace = require('replace-in-file');


const wasm = path.join(__dirname, 'libcsound.wasm');
const uint = fs.readFileSync(wasm);
// const buf = Buffer.from(uint).toString('hex');

var uint_string = "new Uint8Array([";
uint.forEach(n => uint_string += n + ',');
uint_string = uint_string.substring(0, uint_string.length - 1);
uint_string += ']);';

DataURI('libcsound/libcsound.wasm')
    .then(content =>
          {
              // var replace_data = "'" + content + "';";
              // var append_data = "\nmodule.exports = Module;\n";

              const insert_uint = {
                  files: 'libcsound/libcsound.js',
                  from: /'libcsound.wasm'/g,
                  to: 'libcsound.wasm; Module[\'wasmBinary\'] = ' + uint_string + ';',
              };
              
              const replace_get_binary = {
                  files: 'libcsound/libcsound.js',
                  from: `    try {
      if (Module['wasmBinary']) {
        return new Uint8Array(Module['wasmBinary']);
      }
      if (Module['readBinary']) {
        return Module['readBinary'](wasmBinaryFile);
      } else {
        throw "on the web, we need the wasm binary to be preloaded and set on Module['wasmBinary']. emcc.py will do that for you when generating HTML (but not JS)";
      }
    }
    catch (err) {
      abort(err);
    }`,
                  // /'libcsound.wasm'/g,
                  to: '\n return Module[\'wasmBinary\'];'
              };

              const replace_browser_fetch = {
                  files: 'libcsound/libcsound.js',
                  from: `if (!Module['wasmBinary'] &&
        typeof WebAssembly.instantiateStreaming === 'function' &&
        !isDataURI(wasmBinaryFile) &&
        typeof fetch === 'function') {
      WebAssembly.instantiateStreaming(fetch(wasmBinaryFile, { credentials: 'same-origin' }), info)
        .then(receiveInstantiatedSource)
        .catch(function(reason) {
          // We expect the most common failure cause to be a bad MIME type for the binary,
          // in which case falling back to ArrayBuffer instantiation should work.
          Module['printErr']('wasm streaming compile failed: ' + reason);
          Module['printErr']('falling back to ArrayBuffer instantiation');
          instantiateArrayBuffer(receiveInstantiatedSource);
        });
    } else {
      instantiateArrayBuffer(receiveInstantiatedSource);
    }`,
                  // from : `fetch(wasmBinaryFile, { credentials: 'same-origin' })`,
                  to: `WebAssembly.instantiate(Module['wasmBinary'].buffer, info)
                          .then(output => {
                                  trueModule = null;
                                  receiveInstance(output['instance'], 
                                                  output['module']);
                                });`,
                  
                  // `new Promise(function(resolve, reject) {
                  //         resolve(Module['wasmBinary']);
                  //      })`,
              }

              try {
                  replace.sync(insert_uint);
                  replace.sync(replace_get_binary);
                  replace.sync(replace_browser_fetch);
              }
              catch (error) {
                  console.error('Error occurred:', error);
              }
              
              // fs.appendFileSync('./libcsound.js', append_data)
          })
    .catch(err => { throw err; });
