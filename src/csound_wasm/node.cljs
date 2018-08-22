(ns csound-wasm.node
  (:require [csound-wasm.public :as public]
            ["libcsound" :default Libcsound]
            ["speaker" :as Speaker]
            ["web-audio-api" :as web-audio-api]
            ["midi" :as midi]
            ["fs" :as fs]
            ["path" :as path]
            ;; ["v8" :as v8]
            ))


(def libcsound (public/activate-init-callback Libcsound))

(reset! public/libcsound libcsound)

(def wasm-fs libcsound.FS)

(def wasm-node-fs libcsound.NODEFS)

(def csound-started? (volatile! false))

(defn start-audio [config]
  (if @public/csound-running?
    (.err js/console "Csound already running, can't start audio again.")
    (let [csound-instance           @public/csound-instance
          libcsound                 @public/libcsound
          buffer-size               (:buffer config)
          ksmps                     ((libcsound.cwrap 
                                      "CsoundObj_getKsmps" 
                                      #js ["number"] #js ["number"])
                                     csound-instance)
          input-count               ((libcsound.cwrap 
                                      "CsoundObj_getInputChannelCount" 
                                      #js ["number"] #js ["number"])
                                     csound-instance)
          output-count              ((libcsound.cwrap 
                                      "CsoundObj_getOutputChannelCount" 
                                      #js ["number"] #js ["number"])
                                     csound-instance)
          audio-context-constructor web-audio-api/AudioContext
          audio-context             (new audio-context-constructor)
          audio-process-node        (.createScriptProcessor
                                     audio-context
                                     buffer-size input-count output-count)
          _                         (do (set! (.-inputCount audio-process-node) input-count)
                                        (set! (.-outputCount audio-process-node) output-count))
          ;; actx                      (or js/window.AudioContext js/window.webkitAudioContext)
          ;; audio-context             (new actx)
          ;; audio-process-node        (.createScriptProcessor
          ;;                            audio-context
          ;;                            buffer-size input-count output-count)
          ;; _                         (do (set! (.-inputCount audio-process-node) input-count)
          ;;                               (set! (.-outputCount audio-process-node) output-count))
          buffer-size               (.-bufferSize audio-process-node)
          frame-len                 (* ksmps output-count)
          output-pointer            ((libcsound.cwrap 
                                      "CsoundObj_getOutputBuffer" 
                                      #js ["number"] #js ["number"])
                                     csound-instance)
          output-buffer             (new js/Float64Array (.-buffer (.-HEAP8 libcsound))
                                         ^js output-pointer frame-len)
          ;; TODO add microphone input buffer
          zerodbfs                  ((libcsound.cwrap 
                                      "CsoundObj_getZerodBFS" 
                                      #js ["number"] #js ["number"])
                                     csound-instance)
          range-output-cnt          (range output-count)
          perform-ksmps-fn          (fn []
                                      (let [res ((libcsound.cwrap
                                                  "CsoundObj_performKsmps" 
                                                  #js ["number"] #js ["number"])
                                                 csound-instance)]
                                        (when-not @public/csound-running?
                                          (public/dispatch-event "csoundStarted")
                                          (reset! public/csound-running? true))
                                        (when (zero? res)
                                          (public/perform-ksmps-event))
                                        res))]
      (set! (.-outStream audio-context)
            (new Speaker #js {:channels   (.-numberOfChannels
                                           (.-format audio-context))
                              :bitDepth   (.-bitDepth
                                           (.-format audio-context))
                              :sampleRate (.-sampleRate audio-context)}))
      (set! (.-onaudioprocess audio-process-node)
            (fn [e]
              (let [output (.-outputBuffer e)
                    len    (.-length (.getChannelData output 0))]
                ;; (prn "len" len frame-len)
                (loop [res (perform-ksmps-fn)
                       i   0
                       cnt 0]
                  (if (not= 0 res)
                    (do (.disconnect audio-process-node)
                        (set! (.-onaudioprocess audio-process-node) nil)
                        (reset! public/csound-running? false))
                    (when (< i len)
                      (if (< cnt ksmps)
                        (do
                          (dotimes [chn output-count]
                            (aset (.getChannelData output chn)
                                  i
                                  (/ (aget output-buffer (+ chn (* cnt output-count))) zerodbfs)))
                          (recur res (inc i) (inc cnt)))
                        (let [res (perform-ksmps-fn)]
                          (recur res
                                 i
                                 0))))))
                true )))
      (.connect audio-process-node (.-destination audio-context))
      nil)))

(vreset! public/start-audio-fn start-audio)

#_(defn get-files [path]
    (((.cwrap libcsound "FileList_getFileNameString" #js ["string"] #js ["string" "number"])
      @public/csound-instance) path))

;; var _getFileCount = cwrap('FileList_getFileCount', ['number'], ['string']);
;; var _getFileNameString = cwrap('FileList_getFileNameString', ['string'], ['string', 'number']);

(defn render-to-file [csd file-name]
  (let [file-name (or file-name "test.wav")]
    (if @public/wasm-loaded?
      (do 
        (public/compile-csd csd)
        ((.cwrap libcsound "CsoundObj_render" nil #js ["number"])
         @public/csound-instance)
        ;; (prn  "wasm-fs" wasm-fs)
        ;; (prn (js/Object.keys wasm-fs))
        ;; (prn (.readdir wasm-fs "/" (fn [err items] (prn items))))
        ;; (prn (get-files "/"))
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

(comment
  (public/start-realtime)
  (public/compile-orc
   "instr 1
  asig = poscil:a(0.3, 440)
  outc asig, asig
endin")
  (public/read-score "i 1 0 1")
  )
