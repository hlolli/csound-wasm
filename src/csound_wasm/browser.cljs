(ns csound-wasm.browser
  (:require [csound-wasm.public :as public]
            [csound-wasm.browser-shared :as shared]
            ["libcsound_browser" :as Libcsound])
  (:import [goog.exportSymbol]
           [goog.inherits]
           [goog.object.extend]
           [goog.object.clone]))

#_(set! libcsound.print
        (fn [log]
          (public/log-event log)
          (.log js/console "%c%s" "font-size: 16px; color: #ba0fee" log)))

#_(set! libcsound.printErr
        (fn [log]
          (public/log-event log)
          (.log js/console "%c%s" "font-size: 16px; color: #ba0fee" log)))

;; (set! libcsound.noExitRuntime true)

#_(defn enable-midi []
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
        (.then (.requestMIDIAccess js/navigator)
               midi-success midi-fail)
        (.error js/console "Csound: Midi not supported in this browser"))))

#_(def main 
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
         :on                csound-wasm.public/on})

;; (goog.exportSymbol "csound" main)

(def csound-started? (volatile! false))

(defn start-audio [csound-instance buffer-size auto-reset?]
  (let [libcsound          @public/libcsound
        ksmps              ((libcsound.cwrap "CsoundObj_getKsmps" #js ["number"] #js ["number"])
                            csound-instance)
        input-count        ((libcsound.cwrap "CsoundObj_getInputChannelCount" #js ["number"] #js ["number"])
                            csound-instance)
        output-count       ((libcsound.cwrap "CsoundObj_getOutputChannelCount" #js ["number"] #js ["number"])
                            csound-instance)
        actx               (or js/window.AudioContext js/window.webkitAudioContext)
        audio-context      (new actx)
        audio-process-node (.createScriptProcessor
                            audio-context
                            buffer-size input-count output-count)
        _                  (do (set! (.-inputCount audio-process-node) input-count)
                               (set! (.-outputCount audio-process-node) output-count))
        ;; buffer-size               (.-bufferSize audio-process-node)
        output-pointer     ((libcsound.cwrap "CsoundObj_getOutputBuffer" #js ["number"] #js ["number"])
                            csound-instance)
        output-buffer      (new js/Float64Array (.-buffer (.-HEAP8 libcsound))
                                ^js output-pointer (* ksmps output-count))
        ;; TODO add microphone input buffer
        zerodbfs           ((libcsound.cwrap "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
                            csound-instance)
        range-output-cnt   (range output-count)
        perform-ksmps-fn   (fn []
                             (let [res ((libcsound.cwrap
                                         "CsoundObj_performKsmps" #js ["number"] #js ["number"])
                                        csound-instance)]
                               (when (zero? res)
                                 (public/perform-ksmps-event))
                               res))]
    (set! (.-onaudioprocess audio-process-node)
          (fn [e]
            (let [output (.-outputBuffer e)]
              (loop [res (perform-ksmps-fn)
                     i   0
                     cnt 0
                     len buffer-size]
                (when (not @csound-started?)
                  (public/dispatch-event "csoundStarted")
                  (vreset! csound-started? true))
                (when (< i len)
                  (if (and (< cnt len) (not (js/isNaN (aget output-buffer (* cnt output-count)))))
                    (if (not= 0 res)
                      (do (.disconnect audio-process-node)
                          (set! (.-onaudioprocess audio-process-node) nil)
                          (when auto-reset? (public/reset))
                          (vreset! csound-started? false))
                      (do (run! #(aset (.getChannelData output %)
                                       i
                                       (/ (aget output-buffer (+ % (* cnt output-count))) zerodbfs))
                                range-output-cnt)
                          (recur res (inc i) (inc cnt) len)))
                    (let [res (perform-ksmps-fn)]
                      (recur res
                             i
                             0
                             len))))))))
    (.connect audio-process-node (.-destination audio-context))
    nil))


(if (exists? js/AudioWorklet)
  (do (def context (new js/AudioContext #js {:latencyHint "playback"}))
      (defn component [ ctx ]
        (this-as that
          (let [instance (js/Reflect.construct
                          js/AudioWorkletNode
                          #js [ctx "csound-processor"
                               #js {:numberOfOutputs    1
                                    :outputChannelCount #js [2]}]
                          component)]
            (.connect instance (.-destination context))
            instance)))
      (set! (.. component -prototype)
            (js/Object.assign
             (.. js/AudioWorkletNode -prototype)
             #js {:constructor (fn [ctx] (component ctx))}))


      (-> (.addModule context.audioWorklet "./csound-wasm-worklet-processor.js")
          (.then (fn []
                   (let [node (new component context)]
                     (set! (.. node -port -onmessage)
                           (fn [event]
                             (case (aget (.-data event) 0)
                               "workletProcessorReady"
                               (do (public/activate-init-callback nil)
                                   (run! #(.postMessage node.port %)
                                         @public/worklet-message-queue)
                                   (vreset! public/worklet-message-queue [])
                                   (reset! public/audio-worklet-node
                                           {:object node
                                            :post   (fn [msg]
                                                      (.postMessage node.port msg))}))
                               "dispatchEvent"
                               (apply public/dispatch-event (rest (.-data event)))
                               (println "unhandled message: " event)))))))
          (.catch (fn [err]
                    (.warn js/console
                           (str "Error fetching AudioWorklet processor, "
                                "falling back to WebAudio's script processor.\n")
                           err)
                    (reset! public/audio-worklet-node nil)
                    (vreset! public/start-audio-fn start-audio)
                    (shared/fallback-load-sequence Libcsound)))))
  (do
    (reset! public/audio-worklet-node false)
    (vreset! public/start-audio-fn start-audio)
    (shared/fallback-load-sequence Libcsound)))

(goog.exportSymbol "csound" shared/main)
