(ns csound-wasm.browser-shared
  (:require [csound-wasm.core :as public]
            [clojure.string :as string])
  (:require-macros [csound-wasm.macros :refer [wrap-promise wrap-ipc-promise]]))


;; if @public/audio-worklet-node
;; (wrap-ipc-promise #js ["getScoreTime"])

(defn fetch-to-fs [urls & [ root-dir ]]
  (let [resolver       (volatile! nil)
        promise-return (js/Promise.
                        (fn [resolve reject]
                          (vreset! resolver resolve)))
        callback
        (fn []
          (let [urls-clj (js->clj urls)]
            (-> (js/Promise.all
                 (clj->js
                  (mapv
                   #(-> (js/fetch %)
                        (.then
                         (fn [resp]
                           (-> (.blob ^js resp)
                               (.then (fn [blob]
                                        (let [filename (last (string/split % "/"))]
                                          (set! (.-name blob) filename)) blob)))))
                        (.catch (fn [err] (.error js/console err))))
                   urls-clj)))
                (.then (fn [blobs]
                         (-> (public/write-to-fs blobs root-dir)
                             (.then (fn [filenames]
                                      (@resolver filenames)))))))))]
    (-> (wrap-promise callback)
        (.then (fn [res] promise-return)))))


(defn enable-midi []  
  (letfn [(handle-midi-input [event]
            (public/push-midi-message
             (aget (.-data event) 0)
             (aget (.-data event) 1)
             (aget (.-data event) 2)))
          (midi-success [midi-interface]
            (let [inputs (.values (.-inputs midi-interface))]
              (loop [input (.next inputs)]
                (when-not (.-done input)
                  (set! (.-onmidimessage (.-value input)) handle-midi-input)
                  (recur (.next inputs)))))
            (public/set-midi-callbacks))
          (midi-fail [error]
            (.error js/console "Csound midi failed to start: %s" error))]
    (if (exists? js/navigator.requestMIDIAccess)
      (-> (.requestMIDIAccess js/navigator)
          (.then midi-success midi-fail)
          (.catch (fn [err]
                    (.error js/console "Csound: Midi failed. Reason: " err))))
      (.error js/console "MIDI ERROR: Your browser doesn't support WebAudio's Midi"))))

(def main 
  #js {:startRealtime     csound-wasm.core/start-realtime
       :compileOrc        csound-wasm.core/compile-orc
       ;; :renderToFile csound-wasm.core/render-to-file
       :evalCode          csound-wasm.core/eval-code
       :inputMessage      csound-wasm.core/input-message
       :readScore         csound-wasm.core/read-score
       :getControlChannel csound-wasm.core/get-control-channel
       :setControlChannel csound-wasm.core/set-control-channel
       :setStringChannel  csound-wasm.core/set-string-channel
       :getScoreTime      csound-wasm.core/get-score-time
       :playCSD           csound-wasm.core/play-csd
       :reset             csound-wasm.core/reset
       ;; :stop csound-wasm.core/stop
       :destroy           csound-wasm.core/destroy
       :setOption         csound-wasm.core/set-option
       :compileCSD        csound-wasm.core/compile-csd
       :setTable          csound-wasm.core/set-table
       :getTable          csound-wasm.core/get-table
       :getTableLength    csound-wasm.core/get-table-length
       :getKsmps          csound-wasm.core/get-ksmps
       :get0dbfs          csound-wasm.core/get-0dbfs
       :setMidiCallbacks  csound-wasm.core/set-midi-callbacks
       :pushMidiMessage   csound-wasm.core/push-midi-message
       :enableMidi        enable-midi
       :pushMidi          csound-wasm.core/push-midi-message
       :writeToFs         csound-wasm.core/write-to-fs
       :fetchToFs         fetch-to-fs
       :on                csound-wasm.core/on
       :removeListener    csound-wasm.core/remove-listener})
