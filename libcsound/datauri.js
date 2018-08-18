'use strict';

const DataURI = require('datauri').promise;
const fs = require('fs');
const replace = require('replace-in-file');

DataURI('libcsound.wasm')
    .then(content =>
          {
              // Old WebAudio
              var file1 = fs.readFileSync('libcsound/libcsound.js').toString();
              var replc1 = file1.replace('libcsound.wasm', content);

              // AudioWorklet
              var file2 = fs.readFileSync('libcsound/libcsound.js').toString();
              var replc2 = file2.replace('libcsound.wasm', content);
              replc2 = replc2.replace(`ENVIRONMENT_IS_WEB = typeof window === 'object';
ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;`,
                                      `ENVIRONMENT_IS_WEB = true;\n`)
             
              replc2 = replc2.replace(`    if (document.currentScript) {
      scriptDirectory = document.currentScript.src;
    }`, '');
              // replc2 = replc2.replace(`!Module['wasmBinary'] && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === 'function'`, 'false');
              replc2 = replc2.replace(`typeof fetch === 'function'`, `false`);
              replc2 = replc2.replace(`typeof fetch === 'function'`, `false`);
              replc2 = replc2.replace(`  function getBinary() {
    try {
      if (Module['wasmBinary']) {
        return new Uint8Array(Module['wasmBinary']);
      }
      if (Module['readBinary']) {
        return Module['readBinary'](wasmBinaryFile);
      } else {
        throw "both async and sync fetching of the wasm failed";
      }
    }
    catch (err) {
      abort(err);
    }
  }`, `

var base64_decode = function (base64) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var lookup = new Uint8Array(256);
    for (var i = 0; i < chars.length; i++) {
        lookup[chars.charCodeAt(i)] = i;
    }

    var bufferLength = base64.length * 0.75,
        len = base64.length, i, p = 0,
        encoded1, encoded2, encoded3, encoded4;

    if (base64[base64.length - 1] === "=") {
        bufferLength--;
        if (base64[base64.length - 2] === "=") {
            bufferLength--;
        }
    }

    var arraybuffer = new ArrayBuffer(bufferLength),
        bytes = new Uint8Array(arraybuffer);

    for (i = 0; i < len; i += 4) {
        encoded1 = lookup[base64.charCodeAt(i)];
        encoded2 = lookup[base64.charCodeAt(i + 1)];
        encoded3 = lookup[base64.charCodeAt(i + 2)];
        encoded4 = lookup[base64.charCodeAt(i + 3)];

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    return arraybuffer;
}

var BASE64_MARKER = ';base64,';

function convertDataURIToBinary(dataURI) {
    var base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
    var base64 = dataURI.substring(base64Index);
    var raw = base64_decode(base64);
    return raw;
}

function getBinary() {
   return convertDataURIToBinary(wasmBinaryFile);
}

`)

              try {
                  fs.writeFileSync('libcsound/libcsound_browser.js', replc1);
                  fs.writeFileSync('libcsound/libcsound_browser_worklet.js', replc2);
              }
              catch (error) {
                  console.error('Error occurred:', error);
              }
          })
    .catch(err => { throw err; });
