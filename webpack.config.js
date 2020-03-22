const webpack = require("webpack");
const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
// const ClosurePlugin = require("closure-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const isProduction = process.env.NODE_ENV === "production";
const isNode = process.env.TARGET === "node";
const analyze = process.env.ANALYZE === "true";
const target = isNode ? "node" : "web";

module.exports = {
  target,
  entry: "./src/index.js",
  output: {
    path: isProduction
      ? path.resolve(__dirname, "dist")
      : path.resolve(__dirname, "public"),
    filename: isNode ? "libcsound.node.js" : "libcsound.js",
    globalObject: "this" // isProduction ? "window" : "this"
  },
  resolve: {
    alias: {
      "@root": path.resolve(__dirname, "src/"),
      "@module": path.resolve(__dirname, "src/modules/")
    }
  },
  optimization: {
    minimize: isProduction,
    concatenateModules: true,
    minimizer: [
      new TerserPlugin({
        // exclude: /worker\.js$/i,
        test: /\.js$/i,
        terserOptions: { module: true, ecma: 7, mangle: true }
      })
    ],
    // minimizer: [
    //   new ClosurePlugin(
    //     {
    //       mode: "STANDARD"
    //       // mode: "AGGRESSIVE_BUNDLE"
    //       // extraCommandArgs: ["--externs src/externs/perf_hoooks.js"]
    //     },
    //     {
    //       languageOut: "ECMASCRIPT_2015"
    //     }
    //   )
    // ],
    splitChunks: {
      minSize: 0
    },
    mangleWasmImports: true
  },
  devtool: isProduction ? "hidden-source-map" : "source-map",
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
  // experiments: { asyncWebAssembly: false, importAsync: false },
  module: {
    // noParse: /worker\.js$/,
    rules: [
      {
        test: /\.js$/,
        loader: "eslint-loader",
        exclude: /node_modules/,
        options: {
          configFile: path.resolve(__dirname, ".eslintrc"),
          cache: true
        }
      },
      // {
      //   test: /\.js$/,
      //   // enforce: "pre",
      //   exclude: /node_modules/
      //   //   [
      //   //   path.resolve(__dirname, "src/worker.js"),
      //   //   path.resolve(__dirname, "src/csound.worklet.js"),
      //   //   /node_modules/
      //   // ]
      // },
      // {
      //   loader: "workerize-loader",
      //   options: { inline: true },
      //   test: /worker\.js$/
      //   // include: [path.resolve(__dirname, "src/worker.js")]
      // },
      {
        test: /\.wasm$|\.wasm.zlib$/i,
        type: "javascript/auto",
        use: "arraybuffer-loader"
      },
      {
        test: /\.worklet.js$/i,
        use: {
          loader: "url-loader",
          options: { esModule: false, mimetype: "text/javascript" }
        }
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1
    })
  ].concat(
    !isProduction ? [new HtmlWebpackPlugin({ template: "./src/dev.html" })] : []
  )
};
