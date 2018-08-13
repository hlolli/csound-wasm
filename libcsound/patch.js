'use strict';

const fs = require('fs');
const replace = require('replace-in-file');

var append_data = "\nmodule.exports = Module;\n";

fs.appendFileSync('libcsound.js', append_data);

const replace_options = {
  files: 'libcsound/libcsound.js',
  from: /'var wasmBinaryFile = 'libcsound.wasm';'/g,
  to: `var path = require('path');
  var fs = require('fs');
  const libDir = path.dirname(fs.realpathSync(__filename));
  var wasmBinaryFile =  path.join(libDir, 'libcsound.wasm');`
};

try {
  replace.sync(replace_options);
}
catch (error) {
  console.error('Error occurred:', error);
}
