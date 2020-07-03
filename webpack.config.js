const webpack = require('webpack');
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
// const HtmlWebpackPlugin = require("html-webpack-plugin");
const isProduction = process.env.NODE_ENV === 'production';
const isNode = process.env.TARGET === 'node';
const analyze = process.env.ANALYZE === 'true';

module.exports = {
  // target: 'web',
  // node: {
  //   Buffer: true
  // },
  entry: './src/index.js',
  experiments: {
    mjs: true,
    outputModule: true,
    topLevelAwait: true

    // asyncWebAssembly: true,
    // importAsync: true
    // importAwait: true
  },
  stats: { preset: 'verbose' },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: isNode ? 'libcsound.node.mjs' : 'libcsound.mjs',
    // iife: false,
    // uniqueName: "libcsound"
    // globalObject: 'window',
    // ecmaVersion: 11,
    // libraryExport: 'default',
    // libraryTarget: 'module'
    module: true
  },
  optimization: {
    minimize: false,
    minimizer: [
      new TerserPlugin({
        cache: false,
        terserOptions: {
          ecma: 7,
          acorn: true,
          debug: true,
          compress: true,
          // mangle: t,
          extractComments: false,
          parse: { bare_returns: true },
          // module: true,
          nameCache: null
        }
      })
    ]
  },
  // optimization: {
  //   minimize: false
  // },

  performance: {
    hints: false
  },
  resolve: {
    alias: {
      '@root': path.resolve(__dirname, 'src/'),
      '@module': path.resolve(__dirname, 'src/modules/'),
      // TODO: comment if node
      path: 'path-browserify',
      buffer: 'buffer',
      './polyfills/buffer': 'buffer',
      '@wasmer/wasi/lib/polyfills/buffer.js': 'buffer',
      assert: false
    }
  },
  devtool: 'hidden-source-map',
  /*
  devServer: {
    lazy: false,
    open: false,
    contentBase: path.resolve(__dirname, "public"),
    inline: !isProduction,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "X-Requested-With, content-type, Authorization",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  },
*/
  module: {
    rules: [
      // {
      //   test: /\.js$/,
      //   loader: "eslint-loader",
      //   exclude: /node_modules|\.worklet.js|worklet.bundle.js/,
      //   enforce: "pre",
      //   options: {
      //     configFile: path.resolve(__dirname, ".eslintrc"),
      //     cache: true
      //   }
      // },
      {
        test: /\.wasm$|\.wasm.zlib$/i,
        exclude: /node_modules/,
        type: 'javascript/auto',
        use: 'arraybuffer-loader'
      },
      // {
      //   test: /worklet.bundle.js$/i,
      //   exclude: /node_modules/,
      //   use: {
      //     loader: "url-loader",
      //     options: { esModule: false, mimetype: "text/javascript" }
      //   }
      // },
      // {
      //   test: /.*\.worker\.js$/,
      //   exclude: /node_modules.*/g,
      //   use: {
      //     loader: "worker-loader",
      //     options: { inline: true, fallback: false }
      //   }
      // }

      {
        test: /\.worker\.(js|ts)$/i,
        use: [
          {
            loader: 'comlink-loader',
            options: {
              singleton: false,
              inline: true,
              fallback: false
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin({
      protectWebpackAssets: false,
      cleanAfterEveryBuildPatterns: /[0-9]+.*/g
    }),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1
    })
  ]
  // ].concat(
  //   !isProduction ? [new HtmlWebpackPlugin({ template: "./src/dev.html" })] : []
  // )
};
