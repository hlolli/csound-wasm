(ns csound-wasm.node
  (:require [csound-wasm.public :as public]
            ["libcsound" :as libcsound]
            ["speaker" :as Speaker]
            ["web-audio-api" :as web-audio-api]
            ["midi" :as midi]
            ["fs" :as fs]
            ["path" :as path]
            ["v8" :as v8]))


(def wasm-fs libcsound/FS)

(def wasm-node-fs libcsound/NODEFS)


(public/activate-init-callback libcsound/calledRun)


(def wasm-buffer-offset (volatile! 0))

(defn start-audio [csound-instance]
  ;; (.setFlagsFromString v8 "--no-use_strict") ;; To be able to load web-audio-api
  (let [ksmps ((libcsound/cwrap "CsoundObj_getKsmps" #js ["number"] #js ["number"])
               csound-instance)
        input-count ((libcsound/cwrap "CsoundObj_getInputChannelCount" #js ["number"] #js ["number"])
                     csound-instance)
        output-count ((libcsound/cwrap "CsoundObj_getOutputChannelCount" #js ["number"] #js ["number"])
                      csound-instance)
        audio-context-constructor web-audio-api/AudioContext
        audio-context (new audio-context-constructor)
        audio-process-node (.createScriptProcessor
                            audio-context
                            1024 input-count output-count)
        _ (do (set! (.-inputCount audio-process-node) input-count)
              (set! (.-outputCount audio-process-node) output-count))
        buffer-size (.-bufferSize audio-process-node)
        output-pointer ((libcsound/cwrap "CsoundObj_getOutputBuffer" #js ["number"] #js ["number"])
                        csound-instance)
        csound-output-buffer (new js/Float32Array (.-buffer (.-HEAP8 libcsound))
                                  output-pointer (* ksmps output-count))
        ;; TODO add microphone input buffer
        zerodbfs ((libcsound/cwrap "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
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
                           ((libcsound/cwrap "CsoundObj_performKsmps" #js ["number"] #js ["number"])
                            csound-instance))]
    (vreset! wasm-buffer-offset ksmps)
    (set! (.-outStream audio-context)
          (new Speaker #js {:channels (.-numberOfChannels
                                       (.-format audio-context))
                            :bitDepth (.-bitDepth
                                       (.-format audio-context))
                            :sampleRate (.-sampleRate audio-context)}))
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
    nil))


(vreset! public/start-audio-fn start-audio)

(defn render-to-file [csd file-name]
  (let [file-name (or file-name "test.wav")]
    (if @public/wasm-loaded?
      (do 
        (public/compile-csd csd)
        ((.cwrap libcsound "CsoundObj_render" nil #js ["number"])
         @public/csound-instance)
        (let [file-data (.readFile wasm-fs "test.wav" #js {:encoding "binary"})]
          (fs/writeFileSync file-name file-data)
          (println (str "Render finished, file " (path/resolve file-name) " was written."))
          (.exit js/process)))
      (vswap! public/event-queue conj #(render-to-file csd file-name)))))

#_(defn stop []
    (if @wasm-loaded?
      (do (set! (.-outStream @global-audio-context) nil)
          (.disconnect @global-audio-process-node)
          (set! (.-onaudioprocess @global-audio-process-node) nil))
      (vswap! event-queue conj #(stop))))


(defn enable-midi []
  (letfn [(handle-midi-input [_ event]
            (public/push-midi-message
             (aget event 0)
             (aget event 1)
             (aget event 2)))]
    (let [midi-input (new midi/input)]
      (.on midi-input "message" handle-midi-input)
      (.openPort midi-input 1)
      (public/set-midi-callbacks))))

