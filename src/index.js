/* eslint-disable */
import worker from "workerize-loader?ready&inline!./worker";
import * as worklet from "./csound.worklet.js";
import { audioState, audioStreamIn, audioStreamOut } from "./sab";

/**
 * The default entry for libcsound es7 module
 * @async
 * @return {Promise.<Object>}
 */
export default async function init() {
  document
    .getElementById("gesture-sensor")
    .addEventListener("click", onGesture);
  const csoundWorker = worker();
  await csoundWorker.ready;
  await csoundWorker.storeSab();
  await csoundWorker.initWasm({ audioState, audioStreamIn, audioStreamOut });
  return csoundWorker;
}
