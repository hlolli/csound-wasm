'use strict';

const DataURI = require('datauri').promise;
const fs = require('fs');
const replace = require('replace-in-file');


DataURI('libcsound.wasm')
  .then(content =>
        {
          var replace_data = "'" + content + "';";
          var append_data = "\nmodule.exports = Module;\n";
          
          const replace_options = {
            files: 'src/csound_wasm/libcsound.js',
            from: /'libcsound.wasm'/g,
            to: replace_data
          };

          try {
            replace.sync(replace_options);
          }
          catch (error) {
            console.error('Error occurred:', error);
          }
          
          fs.appendFileSync('src/csound_wasm/libcsound.js', append_data)})
  .catch(err => { throw err; });
