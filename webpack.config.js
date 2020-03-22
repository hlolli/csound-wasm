const webpack = require("webpack");
const path = require("path");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
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
    globalObject: "this",
    library: "libcsound",
    libraryTarget: "umd",
    libraryExport: "default"
  },
  resolve: {
    alias: {
      "@root": path.resolve(__dirname, "src/"),
      "@module": path.resolve(__dirname, "src/modules/")
    }
  },
  devtool: "hidden-source-map",
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
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: "eslint-loader",
        exclude: /node_modules|csound\.worklet.js$/,
        enforce: "pre",
        options: {
          configFile: path.resolve(__dirname, ".eslintrc"),
          cache: true
        }
      },
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
    new CleanWebpackPlugin({
      protectWebpackAssets: false,
      cleanAfterEveryBuildPatterns: isProduction
        ? ["*.worker.js*", "*.map"]
        : []
    }),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1
    })
  ].concat(
    !isProduction ? [new HtmlWebpackPlugin({ template: "./src/dev.html" })] : []
  )
};
