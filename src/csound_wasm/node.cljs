(ns csound-wasm.node
  (:require [csound-wasm.core :as public]
            [clojure.walk :refer [stringify-keys]]
            ["libcsound" :as Libcsound]
            ["buffer" :as Buffer]
            ;; ["speaker" :as Speaker]
            ["stream" :as Stream]
            ["midi" :as midi]
            ["fs" :as fs]
            ["path" :as path]))

#_(defn detectBlock []
    (let [interval   500
          blockDelta 5]
      (js/setInterval
       (fn []
         (let [last (.hrtime js/process)]
           (js/setImmediate 
            (fn [] 
              (let [delta (* 1e-6 (aget (.hrtime js/process last) 1))]
                (when (< blockDelta delta)
                  (js/console.log "node.eventloop_blocked" delta)))))))
       interval)))

;; (.setFlagsFromString (js/require "v8") "--no-use_strict")

(declare wasm-fs libcsound)

(def csound-started? (atom false))


(defn start-audio [config]
  ;; ((js/require "blocked") (fn [ms] (.log js/console "blocked" ms)))
  (if @public/csound-running?
    (.err js/console "Csound already running, can't start audio again.")
    (let [csound-instance  @public/csound-instance
          libcsound        @public/libcsound
          Speaker          (js/require "speaker")
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
          benchmark-debug  (atom 0)
          perform-ksmps-fn (fn []
                             #_(let [cur (.getTime (new js/Date))]
                                 (println (- @benchmark-debug cur))
                                 (reset! benchmark-debug cur))
                             (let [res ((libcsound.cwrap
                                         "CsoundObj_performKsmps" 
                                         #js ["number"] #js ["number"])
                                        csound-instance)]
                               ;; (prn @benchmark-debug "perform!")
                               (swap! benchmark-debug inc)
                               (when-not @public/csound-running?
                                 (public/dispatch-event "csoundStarted" nil)
                                 (reset! public/csound-running? true))
                               (when (zero? res)
                                 (public/perform-ksmps-event))
                               res))
          Speaker          (js/require "speaker")
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
                      (public/dispatch-event "csoundEnd" nil)
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
      ;; (js/setInterval perform-ksmps-fn 1)
      nil)))

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
      (swap! public/event-queue conj #(render-to-file csd file-name)))))

#_(defn stop []
    (if @wasm-loaded?
      (do (set! (.-outStream @global-audio-context) nil)
          (.disconnect @global-audio-process-node)
          (set! (.-onaudioprocess @global-audio-process-node) nil))
      (swap! event-queue conj #(stop))))


(defn enable-midi []
  #_(letfn [(handle-midi-input [_ event]
              (public/push-midi-message
               (aget event 0)
               (aget event 1)
               (aget event 2)))]
      (let [midi-input (new midi/input)]
        (.on midi-input "message" handle-midi-input)
        (.openPort midi-input 1)
        (public/set-midi-callbacks))))

;; (prn "WORKER THREad" worker-threads)

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


;; Don't release this part just yet
(if false ;; (and public/worker-threads (.-isMainThread public/worker-threads))
  (let [csound-worker (new (.-Worker public/worker-threads)
                           (js* "__filename")
                           #js {:stdout false
                                :stderr false}
                           ;; (path/resolve "release" "node" "worker-thread.js")
                           )]
    ;; (.log js/console "WORKER" csound-worker)
    (.on csound-worker "message"
         (fn [msg]
           (let [action (aget msg 0)
                 args   (rest msg)]
             (case action
               "dispatchEvent"
               (apply public/dispatch-event args)
               "threadReady"
               (do (public/activate-init-callback nil)
                   (prn @public/worklet-message-queue)
                   (run! #(.postMessage csound-worker %)
                         @public/worklet-message-queue)
                   (reset! public/worklet-message-queue []))
               (println "unhandled message: " action args)))))
    (reset! public/audio-worklet-node
            {:object csound-worker
             :post   (fn [msg] (.postMessage csound-worker msg))})
    )
  ;; Worker Code here
  (if public/worker-threads
    (let [public-functions
          (-> (stringify-keys (js->clj (exports-fn)))
              (assoc "csoundNew" public/csound-new-object
                     "instanciateLibcsound"
                     (fn []
                       (reset! public/libcsound
                               (public/instanciate-libcsound Libcsound))
                       100)))
          public-functions-keys
          (into #{} (keys public-functions))]
      
      ;; (reset! public/libcsound (public/instanciate-libcsound Libcsound))
      
      (reset! public/audio-worklet-processor
              {:post (fn [msg]
                       (.postMessage
                        (.-parentPort public/worker-threads) msg))})
      
      (.on (.-parentPort public/worker-threads) "message"
           (fn [msg]
             (let [action (aget msg 0)
                   args   (rest msg)]
               (case action
                 "setStartupFn"
                 (do (reset! public/startup-fn
                             (case (first args)
                               "startRealtime" #(public/start-realtime (second args))))
                     (when @public/wasm-initialized? (@public/startup-fn)))
                 (apply (get public-functions action) args)))))
      
      (.postMessage (.-parentPort public/worker-threads) #js ["threadReady" nil]))

    ;; Worker and main non-worker code
    (do (reset! public/start-audio-fn start-audio)

        (def libcsound (public/activate-init-callback Libcsound))

        (reset! public/libcsound libcsound)

        (def wasm-fs libcsound.FS)

        (def wasm-node-fs libcsound.NODEFS))))


(reset! public/start-audio-fn start-audio)
