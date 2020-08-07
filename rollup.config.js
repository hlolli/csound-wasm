import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import nodejsResolve from '@rollup/plugin-node-resolve';
import arraybufferPlugin from './script/rollup-arraybuffer';
import inlineWebWorkerPlugin from './script/inline-webworker';
import nodePolyfills from 'rollup-plugin-node-polyfills';
import { terser } from 'rollup-plugin-terser';
import strip from '@rollup/plugin-strip';
// import nodeBuiltins from 'rollup-plugin-node-builtins';
import pluginJson from '@rollup/plugin-json';
import { resolve } from 'path';
import * as R from 'ramda';

const PROD = process.env.BUILD_TARGET === 'production';

const globals = {
  comlink: 'Comlink',
  buffer: 'Buffer',
};

const pluginsCommon = [
  alias({
    entries: [
      { find: '@root', replacement: resolve('./src') },
      { find: '@module', replacement: resolve('./src/modules') },
    ],
  }),
  strip({
    exclude: !PROD ? ['@root/logger.js'] : [],
    functions: !PROD ? ['log', 'logSAB', 'logWorklet', 'logVAN'] : [],
  }),
  pluginJson(),
  commonjs({ transformMixedEsModules: true }),
  nodejsResolve({ preferBuiltins: false }),
  nodePolyfills({ fs: false, crypto: false, sourceMap: false }),
  terser(),
  // nodeBuiltins(),
];

export default [
  {
    input: 'src/workers/sab.worker.js',
    // external: ['comlink'],
    output: {
      file: 'dist/__compiled.sab.worker.js',
      format: 'iife',
      name: 'sab.worker',
      sourcemap: false,
      globals,
    },
    plugins: [
      ...pluginsCommon,
      // arraybufferPlugin({ include: ['**/*.wasm', '**/*.wasm.zlib'] })
    ],
  },
  {
    input: 'src/workers/vanilla.worker.js',
    // external: ['comlink'],
    output: {
      file: 'dist/__compiled.vanilla.worker.js',
      format: 'iife',
      name: 'vanilla.worker',
      sourcemap: false,
      globals,
    },
    plugins: [...pluginsCommon],
  },
  {
    input: 'src/workers/worklet.worker.js',
    // external: ['comlink'],
    output: {
      file: 'dist/__compiled.worklet.worker.js',
      format: 'iife',
      name: 'worklet.worker',
      sourcemap: false,
      globals,
    },
    plugins: [...pluginsCommon],
  },
  {
    input: 'src/index.js',
    // external: ['comlink'],
    output: {
      file: 'dist/libcsound.mjs',
      format: 'module',
      sourcemap: true,
      globals,
    },
    plugins: [
      ...pluginsCommon,
      inlineWebWorkerPlugin({
        include: ['**/worklet.worker.js'],
        dataUrl: true,
      }),
      inlineWebWorkerPlugin({
        include: ['**/sab.worker.js', '**/vanilla.worker.js'],
        dataUrl: false,
      }),
      arraybufferPlugin({ include: ['**/*.wasm', '**/*.wasm.zlib'] }),
    ],
  },
];
