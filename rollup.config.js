import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import nodejsResolve from '@rollup/plugin-node-resolve';
import arraybufferPlugin from './script/rollup-arraybuffer';
import inlineWebWorkerPlugin from './script/inline-webworker';
import nodePolyfills from 'rollup-plugin-node-polyfills';
import { terser } from 'rollup-plugin-terser';
import strip from '@rollup/plugin-strip';
// import nodeBuiltins from 'rollup-plugin-node-builtins';
// import { getBabelOutputPlugin } from '@rollup/plugin-babel';
import babel from '@rollup/plugin-babel';
import pluginJson from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import { resolve } from 'path';
import * as R from 'ramda';

const PROD = process.env.BUILD_TARGET === 'production';

const DEV = process.env.BUILD_TARGET === 'development';

const globals = {
  comlink: 'Comlink',
  // buffer: 'Buffer',
};

const pluginsCommon = [
  alias({
    entries: [
      { find: '@root', replacement: resolve('./src') },
      { find: '@module', replacement: resolve('./src/modules') },
    ],
  }),
  replace({ __PROD__: PROD, __DEV__: DEV }),
  strip({
    exclude: !PROD ? [] : ['@root/logger.js'],
    functions: !PROD ? [] : ['log', 'logSAB', 'logSPN', 'logWorklet', 'logVAN'],
  }),
  pluginJson(),
  commonjs({ transformMixedEsModules: true }),
  nodejsResolve({ preferBuiltins: false }),
  nodePolyfills({ fs: false, crypto: false, sourceMap: false }),
];

const babelCommon = babel({
  babelHelpers: 'inline',
  include: 'src/**/*.js',
  plugins: [
    ['@babel/plugin-transform-destructuring', { useBuiltIns: true }],
    ['@babel/plugin-proposal-object-rest-spread', { useBuiltIns: true }],
  ],
});

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
      babelCommon,
      ...(PROD ? [terser()] : []),
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
    plugins: [...pluginsCommon, babelCommon, ...(PROD ? [terser()] : [])],
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
    plugins: [...pluginsCommon, babelCommon, ...(PROD ? [terser()] : [])],
  },
  {
    input: 'src/workers/old-spn.worker.js',
    output: {
      file: 'dist/__compiled.old-spn.worker.js',
      format: 'iife',
      name: 'old-spn.worker',
      sourcemap: false,
      globals,
    },
    plugins: [...pluginsCommon, babelCommon, ...(PROD ? [terser()] : [])],
  },
  {
    input: 'src/index.js',
    // external: ['comlink'],
    output: {
      file: DEV ? 'dist/libcsound.dev.mjs' : 'dist/libcsound.mjs',
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
        include: ['**/sab.worker.js', '**/vanilla.worker.js', '**/old-spn.worker.js'],
        dataUrl: false,
      }),
      babelCommon,
      arraybufferPlugin({ include: ['**/*.wasm', '**/*.wasm.zlib'] }),
      ...(PROD ? [terser()] : []),
    ],
  },
];
