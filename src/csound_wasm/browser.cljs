(ns csound-wasm.browser
  (:require [csound-wasm.public :as public]
            ["libcsound_browser" :as Libcsound])
  (:import [goog.exportSymbol]))

(enable-console-print!)

(def libcsound (public/activate-init-callback Libcsound))
(reset! public/libcsound libcsound)
;; (public/activate-init-callback libcsound.calledRun)

(set! libcsound.print
      (fn [log]
        (.log js/console "%c%s" "font-size: 16px; color: #ba0fee" log)))

(set! libcsound.printErr
      (fn [log]
        (.log js/console "%c%s" "font-size: 16px; color: #ba0fee" log)))

(set! libcsound.noExitRuntime true)

(defn enable-midi []
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
       :pushMidi          csound-wasm.public/push-midi-message})

(goog.exportSymbol "csound" main)


;; (def wasm-buffer-offset (volatile! 0))

#_(defn start-audio [csound-instance]
    (let [ksmps                     ((libcsound.cwrap "CsoundObj_getKsmps" #js ["number"] #js ["number"])
                                     csound-instance)
          input-count               ((libcsound.cwrap "CsoundObj_getInputChannelCount" #js ["number"] #js ["number"])
                                     csound-instance)
          output-count              ((libcsound.cwrap "CsoundObj_getOutputChannelCount" #js ["number"] #js ["number"])
                                     csound-instance)
          audio-context-constructor (or js/window.AudioContext js/window.webkitAudioContext)
          audio-context             (new audio-context-constructor)
          audio-process-node        (.createScriptProcessor
                                     audio-context
                                     2048 input-count output-count)
          _                         (do (set! (.-inputCount audio-process-node) input-count)
                                        (set! (.-outputCount audio-process-node) output-count))
          buffer-size               (.-bufferSize audio-process-node)
          output-pointer            ((libcsound.cwrap "CsoundObj_getOutputBuffer" #js ["number"] #js ["number"])
                                     csound-instance)
          csound-output-buffer      (new js/Float32Array (.-buffer (.-HEAP8 libcsound))
                                         ^js output-pointer (* ksmps output-count))
          zerodbfs                  ((libcsound.cwrap "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
                                     csound-instance)
          range-output-cnt          (range output-count)
          process-buffers           (fn [e sample-count src-offset dst-offset]
                                      (doseq [i range-output-cnt]
                                        (doseq [j (range sample-count)]
                                          (aset (.getChannelData (.-outputBuffer e) i)
                                                (+ j dst-offset)
                                                (/ (aget csound-output-buffer
                                                         (+ i (* output-count
                                                                 (+ j src-offset))))
                                                   zerodbfs)))))
          perform-ksmps-fn          (fn []
                                      ((libcsound.cwrap "CsoundObj_performKsmps" #js ["number"] #js ["number"])
                                       csound-instance))]
      (vreset! wasm-buffer-offset ksmps)
      (set! (.-onaudioprocess audio-process-node)
            (fn [e]
              (loop [sample-count (- ksmps @wasm-buffer-offset)
                     index        (if (< 0 sample-count)
                                    (do (process-buffers e sample-count @wasm-buffer-offset 0) sample-count)
                                    0)]
                (if-not (< index buffer-size)
                  (vreset! wasm-buffer-offset (+ @wasm-buffer-offset sample-count))
                  (let [sample-count (min ksmps (- buffer-size index))]
                    (if (not= 0 (perform-ksmps-fn))
                      (do (.disconnect audio-process-node)
                          (set! (.-onaudioprocess audio-process-node) nil))
                      (if (js/isNaN (aget csound-output-buffer 0))
                        (do (.error js/console (str "NaN! outputPointer = " output-pointer))
                            (recur sample-count 0))
                        (do (process-buffers e sample-count 0 index)
                            (recur sample-count
                                   (+ index sample-count))))))))))
      (.connect audio-process-node (.-destination audio-context))
      nil))

(defn start-audio [csound-instance auto-reset?]
  (let [ksmps                     ((libcsound.cwrap "CsoundObj_getKsmps" #js ["number"] #js ["number"])
                                   csound-instance)
        input-count               ((libcsound.cwrap "CsoundObj_getInputChannelCount" #js ["number"] #js ["number"])
                                   csound-instance)
        output-count              ((libcsound.cwrap "CsoundObj_getOutputChannelCount" #js ["number"] #js ["number"])
                                   csound-instance)
        audio-context-constructor (or js/window.AudioContext js/window.webkitAudioContext)
        audio-context             (new audio-context-constructor)
        audio-process-node        (.createScriptProcessor
                                   audio-context
                                   2048 input-count output-count)
        _                         (do (set! (.-inputCount audio-process-node) input-count)
                                      (set! (.-outputCount audio-process-node) output-count))
        buffer-size               (.-bufferSize audio-process-node)
        output-pointer            ((libcsound.cwrap "CsoundObj_getOutputBuffer" #js ["number"] #js ["number"])
                                   csound-instance)
        output-buffer             (new js/Float32Array (.-buffer (.-HEAP8 libcsound))
                                       ^js output-pointer (* ksmps output-count))
        ;; TODO add microphone input buffer
        zerodbfs                  ((libcsound.cwrap "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
                                   csound-instance)
        range-output-cnt          (range output-count)
        perform-ksmps-fn          (fn []
                                    ((libcsound.cwrap "CsoundObj_performKsmps" #js ["number"] #js ["number"])
                                     csound-instance))]
    (set! (.-onaudioprocess audio-process-node)
          (fn [e]
            (let [output (.-outputBuffer e)]
              (loop [res (perform-ksmps-fn)
                     i   0
                     cnt 0
                     len buffer-size]
                (when (< i len)
                  (if (and (< cnt len) (not (js/isNaN (aget output-buffer (* cnt output-count)))))
                    (if (not= 0 res)
                      (do (.disconnect audio-process-node)
                          (set! (.-onaudioprocess audio-process-node) nil)
                          (when auto-reset? (public/reset)))
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

(vreset! public/start-audio-fn start-audio)


