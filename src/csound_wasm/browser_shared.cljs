(ns csound-wasm.browser-shared
  (:require [csound-wasm.public :as public]))

#_(defn fallback-load-sequence [Libcsound]
    (let [libcsound (public/activate-init-callback Libcsound)]
      (reset! public/libcsound libcsound)
      (set! libcsound.print
            (fn [log]
              (public/log-event log)))
      (set! libcsound.printErr
            (fn [log]
              (public/log-event log)
              #_(.log js/console "%c%s" "font-size: 16px; color: #ba0fee" log)))
      (set! libcsound.noExitRuntime true)))

(defn enable-midi []
  ;; if-let [awn @public/audio-worklet-node]
  ;; ((:post awn) #js ["enableMidi"])
  
  (letfn [(handle-midi-input [event]
            (csound-wasm.public/push-midi-message
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
  #js {:startRealtime     csound-wasm.public/start-realtime
       :compileOrc        csound-wasm.public/compile-orc
       ;; :renderToFile csound-wasm.public/render-to-file
       :evalCode          csound-wasm.public/eval-code
       :inputMessage      csound-wasm.public/input-message
       :readScore         csound-wasm.public/read-score
       :getControlChannel csound-wasm.public/get-control-channel
       :setControlChannel csound-wasm.public/set-control-channel
       :setStringChannel  csound-wasm.public/set-string-channel
       :getScoreTime      csound-wasm.public/get-score-time
       :playCSD           csound-wasm.public/play-csd
       :reset             csound-wasm.public/reset
       ;; :stop csound-wasm.public/stop
       :destroy           csound-wasm.public/destroy
       :setOption         csound-wasm.public/set-option
       :compileCSD        csound-wasm.public/compile-csd
       :setTable          csound-wasm.public/set-table
       :getTable          csound-wasm.public/get-table
       :getTableLength    csound-wasm.public/get-table-length
       :getKsmps          csound-wasm.public/get-ksmps
       :get0dbfs          csound-wasm.public/get-0dbfs
       :setMidiCallbacks  csound-wasm.public/set-midi-callbacks
       :pushMidiMessage   csound-wasm.public/push-midi-message
       :enableMidi        enable-midi
       :pushMidi          csound-wasm.public/push-midi-message
       :on                csound-wasm.public/on
       :removeListener    csound-wasm.public/remove-listener})
