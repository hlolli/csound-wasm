import { readFileSync, realpathSync } from 'fs';
import { createFilter } from 'rollup-pluginutils';

const arraybufferCode = () =>
  `
function __toArrayBuffer(base64Data) {
  var window = window || this;
  var isBrowser = typeof window !== 'undefined';
  var binary = isBrowser ? window.atob(base64Data) : Buffer.from(base64Data, 'base64').toString('binary');
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; ++i) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};
`
    .split('\n')
    .map(Function.prototype.call, String.prototype.trim)
    .join('');

export default function arraybufferPlugin(options = {}) {
  const filter = createFilter(options.include, options.exclude);
  return {
    name: 'arraybuffer',
    intro: arraybufferCode,
    load(id) {
      if (filter(id)) {
        id = realpathSync(id);
        return {
          code: `export default __toArrayBuffer("${readFileSync(id).toString(
            'base64'
          )}");`,
          map: { mappings: '' }
        };
      }
    }
  };
}
