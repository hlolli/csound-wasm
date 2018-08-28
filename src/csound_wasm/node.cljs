(ns csound-wasm.node
  (:require [csound-wasm.core :as public]
            ["libcsound" :as Libcsound]
            ["buffer" :as Buffer]
            ["speaker" :as Speaker]
            ["stream" :as Stream]
            ["midi" :as midi]
            ["fs" :as fs]
            ["path" :as path]))

;; (.setFlagsFromString (js/require "v8") "--no-use_strict")

(def libcsound (public/activate-init-callback Libcsound))

(reset! public/libcsound libcsound)

(def wasm-fs libcsound.FS)

(def wasm-node-fs libcsound.NODEFS)

(def csound-started? (volatile! false))

(defn start-audio [config]
  (if @public/csound-running?
    (.err js/console "Csound already running, can't start audio again.")
    (let [csound-instance  @public/csound-instance
          libcsound        @public/libcsound
          buffer-size      (:buffer config)
          ksmps            ((libcsound.cwrap 
                             "CsoundObj_getKsmps" 
                             #js ["number"] #js ["number"])
                            csound-instance)
          input-count      ((libcsound.cwrap 
                             "CsoundObj_getInputChannelCount" 
                             #js ["number"] #js ["number"])
                            csound-instance)
          output-count     ((libcsound.cwrap 
                             "CsoundObj_getOutputChannelCount" 
                             #js ["number"] #js ["number"])
                            csound-instance)
          frame-len        (* ksmps output-count)
          output-pointer   ((libcsound.cwrap 
                             "CsoundObj_getOutputBuffer" 
                             #js ["number"] #js ["number"])
                            csound-instance)
          output-buffer    (new js/Float64Array (.-buffer (.-HEAP8 libcsound))
                                ^js output-pointer frame-len)
          ;; TODO add microphone input buffer
          zerodbfs         ((libcsound.cwrap 
                             "CsoundObj_getZerodBFS" 
                             #js ["number"] #js ["number"])
                            csound-instance)
          range-output-cnt (range output-count)
          perform-ksmps-fn (fn []
                             (let [res ((libcsound.cwrap
                                         "CsoundObj_performKsmps" 
                                         #js ["number"] #js ["number"])
                                        csound-instance)]
                               (when-not @public/csound-running?
                                 (public/dispatch-event "csoundStarted")
                                 (reset! public/csound-running? true))
                               (when (zero? res)
                                 (public/perform-ksmps-event))
                               res))
          speaker          (new Speaker #js {:float      true
                                             :signed     true
                                             :channels   output-count
                                             :bitDepth   32
                                             :sampleRate (:sr config)})
          offset-atom      (atom ksmps)
          process
          (fn [smpls]
            (this-as this
              (let [bitPerSampl 4 ;; this is standard for FloatLE
                    num-samples (/ smpls bitPerSampl)
                    block-align (/ num-samples output-count)
                    buffer      (.from js/Buffer
                                       (.-buffer (new js/Float32Array num-samples)))]
                ;; (prn block-align smpls)
                (loop [i 0 offset @offset-atom res 0]
                  (cond
                    (not= 0 res)
                    (do
                      (.push this nil)
                      (public/dispatch-event "csoundEnd")
                      (.close speaker))
                    (= offset ksmps)
                    (recur i 0 (perform-ksmps-fn))
                    (not (< i block-align))
                    (do
                      (.push this buffer)
                      (reset! offset-atom offset))
                    :else
                    (do 
                      (dotimes [chn output-count]
                        (do
                          (.writeFloatLE
                           buffer
                           (/ (aget output-buffer (+ chn (* offset output-count)))
                              zerodbfs)
                           (+ (* chn bitPerSampl)
                              (* output-count i bitPerSampl)))))
                      (recur (inc i) (inc offset) res)))))))
          stream           (new (.-Readable Stream)
                                #js {:read process})]
      ;; Fill the pipe with 0 before starting
      (dotimes [_ 6]
        (.push stream (.from js/Buffer (.-buffer (new js/Float32Array 16384)))))
      (.pipe stream speaker)
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


(defn exports-fn []
  #js {:startRealtime     public/start-realtime
       :compileOrc        public/compile-orc
       :renderToFile      render-to-file
       :evalCode          public/eval-code
       :inputMessage      public/input-message
       ;; :inputMessageAsync public/input-message-async
       :readScore         public/read-score
       :getControlChannel public/get-control-channel
       :setControlChannel public/set-control-channel
       :setStringChannel  public/set-string-channel
       :getScoreTime      public/get-score-time
       ;; :getScoreTimeSync  public/get-score-time-sync
       :playCSD           public/play-csd
       :reset             public/reset
       ;; :stop public/stop
       :destroy           public/destroy
       :setOption         public/set-option
       :compileCSD        public/compile-csd
       :setTable          public/set-table
       :getTable          public/get-table
       :getTableLength    public/get-table-length
       :getKsmps          public/get-ksmps
       :get0dbfs          public/get-0dbfs
       :enableMidi        enable-midi
       :pushMidi          public/push-midi-message
       :on                public/on
       :removeListener    public/remove-listener})

(comment
  (public/start-realtime)
  (public/compile-orc
   "instr 1
  asig = poscil:a(0.3, 440)
  outc asig, asig
endin")
  (public/read-score "i 1 0 1")
  )
