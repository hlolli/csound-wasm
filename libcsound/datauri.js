'use strict';

const DataURI = require('datauri').promise;
const fs = require('fs');
const replace = require('replace-in-file');
// const stdin = process.argv[2];

// DataURI('libcsound/libcsound.wasm')
//   .then(content =>
//         {
//           var replace_data = "'" + content + "';";
//           // var append_data = "\nmodule.exports = Module;\n";
          
//           const replace_options = {
//             files: 'libcsound/libcsound.js',
//             from: /'libcsound.wasm'/g,
//             to: replace_data
//           };

//             try {
//                 replace.sync(replace_options);
//             }
//             catch (error) {
//                 console.error('Error occurred:', error);
//             }
            
//             // fs.appendFileSync('./libcsound.js', append_data)
//         })
//     .catch(err => { throw err; });

// DataURI('libcsound/libcsound.wasm')
//     .then(content =>
//           {
//               console.log(content);
//           })
//     .catch(err => { throw err; });

DataURI('libcsound.wasm')
    .then(content =>
          {
              var file1 = fs.readFileSync('libcsound/libcsound.js').toString();
              var replc = file1.replace('libcsound.wasm', content);

              try {
                  fs.writeFileSync('libcsound/libcsound_browser.js', replc);
              }
              catch (error) {
                  console.error('Error occurred:', error);
              }
          })
    .catch(err => { throw err; });
