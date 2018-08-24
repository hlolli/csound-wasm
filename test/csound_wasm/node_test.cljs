(ns csound-wasm.node-test
  (:require [csound-wasm.node :as csound-node]
            [csound-wasm.node :as csound-public]
            [cljs.test :refer-macros [async deftest is testing]]))

(deftest start-realtime
  (prn (.-length csound))
  (is (object? csound)))

(defn ^:export main []
  (start-realtime))
