(ns csound-wasm.node-test
  (:require [csound-wasm.node :as csound-node]
            [csound-wasm.core :as public]
            [clojure.tools.reader.edn :as edn]
            [cljs.tools.reader :as reader]
            ["fs" :as fs]
            [cljs.test :refer [report]]
            [cljs.test :refer-macros
             [async deftest is testing use-fixtures]]))


(def logs (atom []))

(public/on "log" (fn [log] (swap! logs conj log)))

#_(deftest publicAPI
    (let [node-exports (-> "./shadow-cljs.edn" fs/readFileSync .toString edn/read-string
                           :builds :node :exports)
          ;; browser-exports (-> "./src/csound_wasm/browser_shared.cljs"
          ;;                     fs/readFileSync
          ;;                     reader/read
          ;;                     str)
          ]
      (is (<= 24 (count node-exports)))))

(deftest libcsound-module
  (testing "Object type"
    (is (= "[Emscripten Module object]"
           (.inspect @public/libcsound)))))


(deftest end-realtime
  (async
   done
   (let [timeout (js/setTimeout (fn [] (done)))]
     (public/input-message "e 0 0")
     (testing "On end event fired within 1 second"
       (public/on "end" (fn []
                          (js/clearTimeout timeout)
                          (is true)
                          (done)))))))


(defn start-realtime [done]
  (let [timeout (js/setTimeout (fn [] (js/process.exit -1)) 30000)]
    (public/on
     "wasmInitialized"
     (fn []
       (js/clearTimeout timeout)
       (done)))))

(use-fixtures :once
  {:before #(async done (start-realtime done))
   :after  (fn []
             ;; (publicAPI)
             (libcsound-module)
             (end-realtime))})
