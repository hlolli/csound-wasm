(ns csound-wasm.hooks
  (:require
   [clojure.java.shell :refer [sh]]
   [clojure.string :as string])
  (:import [java.nio.file Files Paths StandardCopyOption]
           [java.net URI]))

(defn libcsound-wasm-for-tests
  {:shadow.build/stage :configure}
  [build-state & args]
  (sh "mkdir" "-p" "out")
  (sh "rm" "out/libcsound.wasm")
  (sh "ln" "-s" "../release/node/libcsound.wasm" "out/libcsound.wasm")
  build-state)

(defn delete-browser-js
  {:shadow.build/stage :flush}
  [build-state & args]
  (when (= :release (:shadow.build/mode build-state))
    (Files/deleteIfExists
     (Paths/get "." (into-array ["libcsound" "libcsound_browser.js"]))))
  build-state)

(defn delete-browser-worklet-js
  {:shadow.build/stage :flush}
  [build-state & args]
  (when (= :release (:shadow.build/mode build-state))
    (Files/deleteIfExists
     (Paths/get "." (into-array ["libcsound" "libcsound_browser_worklet.js"]))))
  build-state)

(defn rename-release
  {:shadow.build/stage :flush}
  [build-state & args]
  (let [src  (Paths/get "." (into-array ["release" "browser" "main.js"]))
        dest (Paths/get "." (into-array ["release" "browser" "csound-wasm-browser.js"]))]
    (Files/move src dest (into-array [StandardCopyOption/REPLACE_EXISTING])))
  build-state)

(defn rename-processor-release
  {:shadow.build/stage :flush}
  [build-state & args]
  (let [slur (slurp "release/browser/processor.js")
        new  (string/replace slur "goog.global=this" "goog.global={}")]
    (spit "release/browser/csound-wasm-worklet-processor.js" new)
    (Files/deleteIfExists (Paths/get "." (into-array ["release" "browser" "processor.js"]))))
  build-state)
