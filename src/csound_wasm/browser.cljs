(ns csound-wasm.browser
  (:require [csound-wasm.public :as public]))

(enable-console-print!)

(declare csound-object)

(defn wait-for-libcsound []
  (if (and (exists? js/Module)
           (nil? @public/csound-object))
    (do (reset! public/csound-object js/Module)
        (def csound-object js/Module)
        (public/activate-init-callback))
    (js/setTimeout
     (fn [] (wait-for-libcsound))
     1)))

(wait-for-libcsound)

(def ^:export main
  #js {:startRealtime csound-wasm.public/start-realtime
       :compileOrc csound-wasm.public/compile-orc
       ;; :renderToFile csound-wasm.public/render-to-file
       :evalCode csound-wasm.public/eval-code
       :inputMessage csound-wasm.public/input-message
       :readScore csound-wasm.public/read-score
       :getControlChannel csound-wasm.public/get-control-channel
       :setControlChannel csound-wasm.public/set-control-channel
       :setStringChannel csound-wasm.public/set-string-channel
       :getScoreTime csound-wasm.public/get-score-time
       :playCSD csound-wasm.public/play-csd
       :reset csound-wasm.public/reset
       ;; :stop csound-wasm.public/stop
       :destroy csound-wasm.public/destroy
       :setOption csound-wasm.public/set-option
       :compileCSD csound-wasm.public/compile-csd
       :setTable csound-wasm.public/set-table
       :getTable csound-wasm.public/get-table
       :getTableLength csound-wasm.public/get-table-length
       :getKsmps csound-wasm.public/get-ksmps
       :get0dbfs csound-wasm.public/get-0dbfs                              
       })

(def wasm-buffer-offset (volatile! 0))

(defn start-audio [csound-instance]
  (let [ksmps ((.cwrap csound-object "CsoundObj_getKsmps" #js ["number"] #js ["number"])
               csound-instance)
        input-count ((.cwrap csound-object "CsoundObj_getInputChannelCount" #js ["number"] #js ["number"])
                     csound-instance)
        output-count ((.cwrap csound-object "CsoundObj_getOutputChannelCount" #js ["number"] #js ["number"])
                      csound-instance)
        audio-context-constructor (or js/window.AudioContext js/window.webkitAudioContext)
        audio-context (new audio-context-constructor)
        audio-process-node (.createScriptProcessor
                            audio-context
                            1024 input-count output-count)
        _ (do (set! (.-inputCount audio-process-node) input-count)
              (set! (.-outputCount audio-process-node) output-count))
        buffer-size (.-bufferSize audio-process-node)
        output-pointer ((.cwrap csound-object "CsoundObj_getOutputBuffer" #js ["number"] #js ["number"])
                        csound-instance)
        csound-output-buffer (new js/Float32Array (.-buffer (.-HEAP8 csound-object))
                                  output-pointer (* ksmps output-count))
        zerodbfs ((.cwrap csound-object "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
                  csound-instance)
        range-output-cnt (range output-count)
        process-buffers (fn [e sample-count src-offset dst-offset]
                          (doseq [i range-output-cnt]
                            (doseq [j (range sample-count)]
                              (aset (.getChannelData (.-outputBuffer e) i)
                                    (+ j dst-offset)
                                    (/ (aget csound-output-buffer
                                             (+ i (* output-count
                                                     (+ j src-offset))))
                                       zerodbfs)))))
        perform-ksmps-fn (fn []
                           ((.cwrap csound-object "CsoundObj_performKsmps" #js ["number"] #js ["number"])
                            csound-instance))]
    (vreset! wasm-buffer-offset ksmps)
    (set! (.-onaudioprocess audio-process-node)
          (fn [e]
            (loop [sample-count (- ksmps @wasm-buffer-offset)
                   index (if (< 0 sample-count)
                           (do (process-buffers e sample-count @wasm-buffer-offset 0) sample-count)
                           0)]
              (if-not (< index buffer-size)
                (vreset! wasm-buffer-offset (+ @wasm-buffer-offset sample-count))
                (let [sample-count (min ksmps (- buffer-size index))]
                  (if (not= 0 (perform-ksmps-fn))
                    (do (.disconnect audio-process-node)
                        (set! (.-onaudioprocess audio-process-node) nil))
                    (do (when (js/isNaN (aget csound-output-buffer 0))
                          (.error js/console (str "NaN! outputPointer = " output-pointer)))
                        (process-buffers e sample-count 0 index)
                        (recur sample-count
                               (+ index sample-count)))))))))
    (.connect audio-process-node (.-destination audio-context))
    nil
    ))

(vreset! public/start-audio-fn start-audio)
