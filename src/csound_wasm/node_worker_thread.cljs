(ns csound-wasm.node-worker-thread
  (:require [csound-wasm.node :refer [exports-fn]]
            ["worker_threads" :as worker-threads]))

(defn no-op [] (prn "HELLO?"))
