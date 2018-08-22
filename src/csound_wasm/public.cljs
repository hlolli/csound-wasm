(ns csound-wasm.public
  (:require-macros
   [csound-wasm.macros
    :refer [wrap-promise
            wrap-ipc-promise]]))

(def libcsound (atom nil))

(def worklet-message-queue (atom []))

(def audio-worklet-node
  (if (and (exists? js/AudioWorklet)
           (not (exists? js/AudioWorkletProcessor)))
    (atom {:post (fn [msg] (swap! worklet-message-queue conj msg))})
    (atom nil)))

(def audio-worklet-processor
  (if (exists? js/AudioWorkletProcessor)
    (atom {:post (fn [msg] (println "Missed a message: " msg))})
    (atom nil)))

(def event-queue (volatile! []))

(def ipc-promise-queue (atom {}))

(def startup-fn (volatile! nil))

(def start-audio-fn (volatile! nil))

(def wasm-loaded? (volatile! false))

(def wasm-initialized? (volatile! false))

(def csound-instance (atom nil))

(def audio-started? (atom false))

(def csound-running? (atom false))

;; Default config
(def audio-config (atom {:nchnls   2
                         :nchnls_i 1
                         :zerodbfs 1
                         :sr       44100
                         :ksmps    128
                         :buffer   4096}))

(def nodejs? (and (exists? js/module)
                  (exists? (.-exports js/module))))

(def node-event-emitter*
  (when nodejs?
    (js/require "events")))

(def node-event-emitter
  (when nodejs?
    (new node-event-emitter*)))

(defn dispatch-event [e & [data]]
  (if-let [awp @audio-worklet-processor]
    ((:post awp) #js ["dispatchEvent" e data])
    (if nodejs?
      (if data
        (.emit node-event-emitter e data)
        (.emit node-event-emitter e))
      (if data
        (.dispatchEvent js/window (new js/CustomEvent e #js {:detail data}))
        (.dispatchEvent js/window (new js/Event e))))))

(defn prepareRT []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["prepareRT"]))
  (((.-cwrap @libcsound) "CsoundObj_prepareRT"
    nil #js ["number"]) @csound-instance))

(defn set-option [option]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["setOption" option])
    (if @wasm-loaded?
      (((.-cwrap @libcsound) "CsoundObj_setOption" nil #js ["number" "string"])
       @csound-instance option)
      (vswap! event-queue conj #(set-option option)))))

(defn compile-orc [orc]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["compileOrc" orc])
    (if @wasm-loaded?
      (((.-cwrap @libcsound)
        "CsoundObj_compileOrc"
        "number" #js ["number" "string"])
       @csound-instance orc)
      (vswap! event-queue conj #(compile-orc orc)))))

(defn eval-code [orc]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["evalCode" orc])
    (if @wasm-loaded?
      (((.-cwrap @libcsound) "CsoundObj_evaluateCode" "number" #js ["number" "string"])
       @csound-instance orc)
      (vswap! event-queue conj #(eval-code orc)))))

(defn input-message [sco]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["inputMessage" sco]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound)
      "CsoundObj_inputMessage"
      "number" #js ["number" "string"])
     @csound-instance sco)
    (vswap! event-queue conj #(input-message sco))))

#_(defn string-to-c [str]
    (let [len (inc (bit-shift-left (.-length str) 2))]
      (
       str
       (libcsound/stackAlloc )
       len)))

#_(defn input-message-async [sco]
    (((.-cwrap @libcsound) "CsoundObj_inputMessageAsync" "number" #js ["number" "string"])
     @csound-instance sco)
    #_(if @wasm-loaded?
        (libcsound/_CsoundObj_inputMessageAsync (libcsound/JSfuncs.stringToC sco))
        
        (vswap! event-queue conj (fn [] (js/setTimeout #(input-message sco)) 1))))

#_(def input-message-async*
    (libcsound/cwrap "CsoundObj_inputMessageAsync" nil #js ["number" "string"]))

#_(defn input-message-async [sco]
    ;; (libcsound/_CsoundObj_inputMessageAsync @csound-instance (.stringToC libcsound/JSfuncs sco))
    (libcsound/ccall "CsoundObj_inputMessageAsync" "number" #js ["number" "string"]
                     #js [@csound-instance sco] nil)
    ;; (input-message-async* @csound-instance sco)
    )

(defn read-score [sco]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["readScore" sco])
    (if @wasm-loaded?
      (((.-cwrap @libcsound)
        "CsoundObj_readScore"
        "number" #js ["number" "string"])
       @csound-instance sco)
      (vswap! event-queue conj #(read-score sco)))))

(defn get-control-channel [ctrl-channel]
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getControlChannel" ctrl-channel])
    (let [callback (fn []
                     (((.-cwrap @libcsound)
                       "CsoundObj_getControlChannel"
                       #js ["number"] #js ["number" "string"])
                      @csound-instance ctrl-channel)
                     ctrl-channel)]
      (wrap-promise callback))))

(defn set-control-channel [ctrl-channel val]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["setControlChannel" #js [ctrl-channel val]])
    (if @wasm-loaded?
      (((.-cwrap @libcsound)
        "CsoundObj_setControlChannel"
        nil #js ["number" "string" "number"])
       @csound-instance ctrl-channel val)
      (vswap! event-queue conj #(set-control-channel ctrl-channel val)))))

(defn set-string-channel [string-channel string]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["setStringChannel" #js [string-channel string]])
    (if @wasm-loaded?
      (((.-cwrap @libcsound)
        "CsoundObj_setStringChannel"
        nil #js ["number" "string" "string"])
       @csound-instance string-channel string)
      (vswap! event-queue conj #(set-control-channel set-string-channel string)))))

(defn get-score-time []
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getScoreTime"])
    (let [callback
          (fn []
            (((.-cwrap @libcsound)
              "CsoundObj_getScoreTime"
              nil #js ["number"])
             @csound-instance))]
      (wrap-promise callback))))

#_(defn get-score-time-sync []
    (when-let [awn @audio-worklet-node]
      ((:post awn) #js ["getScoreTimeSync"]))
    (if @wasm-loaded?
      (((.-cwrap @libcsound) "CsoundObj_getScoreTime" nil #js ["number"])
       @csound-instance)
      0))

#_(defn- resume-performance
    "Private-fn that ensures performKspms is
   running in case a previous score ended."
    []
    (when-let [awn @audio-worklet-node]
      ((:post awn) #js ["resumePerformance"])))

(declare reset-sequence)

(defn reset []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["reset"])
    (if @wasm-loaded?
      (do (reset! csound-running? :reset)
          (((.-cwrap @libcsound) "CsoundObj_reset" nil #js ["number"])
           @csound-instance))
      (vswap! event-queue conj #(reset)))))

(defn destroy []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["destroy"])
    (if @wasm-loaded?
      (((.-cwrap @libcsound) "CsoundObj_destroy" nil #js ["number"])
       @csound-instance)
      (vswap! event-queue conj #(destroy)))))


(defn compile-csd [csd]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["compileCSD" csd])
    (if @wasm-loaded?
      (do (((.-cwrap @libcsound) "CsoundObj_compileCSD" nil #js ["number" "string"])
           @csound-instance csd)
          (dispatch-event "csoundReady"))
      (vswap! event-queue conj #(compile-csd csd)))))


(defn set-table [table-num index val]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["setTable" table-num index val])
    (if @wasm-loaded?
      (((.-cwrap @libcsound) "CsoundObj_setTable" nil #js ["number" "number" "number" "number"])
       @csound-instance table-num index val)
      (vswap! event-queue conj #(set-table table-num index val)))))

(defn get-table-length [table-num]
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getTableLength" table-num])
    (let [callback (fn []
                     (((.-cwrap @libcsound) "CsoundObj_getTableLength"
                       #js ["number"] #js ["number" "number"])
                      @csound-instance table-num))]
      (wrap-promise callback))))

(defn get-table [table-num]
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getTable" table-num])
    (wrap-promise
     (fn []
       (let [buf (((.-cwrap @libcsound)
                   "CsoundObj_getTable"
                   #js ["number"] #js ["number" "number"])
                  @csound-instance table-num)
             len (((.-cwrap @libcsound) "CsoundObj_getTableLength"
                   #js ["number"] #js ["number" "number"])
                  @csound-instance table-num)]
         (if (= -1 len)
           (.error js/console (str "Error: table number " table-num
                                   " doesn't exist, or hasn't been compiled yet."))
           (let [src (new js/Float64Array
                          (.-buffer (.-HEAP8 @libcsound)) buf len)
                 ret (new js/Float32Array src)]
             ret)))))))

(defn get-ksmps []
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getKsmps"])
    (let [callback (fn []
                     (((.-cwrap @libcsound)
                       "CsoundObj_getKsmps"
                       #js ["number"] #js ["number"])
                      @csound-instance))]
      (wrap-promise callback))))

(defn get-0dbfs []
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["get0dbfs"])
    (let [callback (fn []
                     (((.-cwrap @libcsound)
                       "CsoundObj_getZerodBFS"
                       #js ["number"] #js ["number"])
                      @csound-instance))]
      (wrap-promise callback))))

(defn set-midi-callbacks []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["setMidiCallbacks"])
    (if @wasm-loaded?
      (((.-cwrap @libcsound) "CsoundObj_setMidiCallbacks" nil #js ["number"])
       @csound-instance)
      (vswap! event-queue conj #(set-midi-callbacks)))))

(defn push-midi-message [byte1 byte2 byte3]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["pushMidiMessage" byte1 byte2 byte3])
    (if @wasm-loaded?
      (((.-cwrap @libcsound) "CsoundObj_pushMidiMessage" nil #js ["number" "number" "number" "number"])
       @csound-instance byte1 byte2 byte3)
      (vswap! event-queue conj #(push-midi-message byte1 byte2 byte3)))))

;; Events

(defn on [event callback]
  (let [full-event-name (case event
                          "log"     "csoundLog"
                          "ready"   "csoundReady"
                          "started" "csoundStarted"
                          "perform" "performKsmps"
                          event)
        callback        (case event
                          "log" (fn [e] (callback e.detail))
                          callback)]
    (if nodejs?
      (.on node-event-emitter full-event-name callback)
      (.addEventListener js/window full-event-name callback))))

(defn perform-ksmps-event []
  (dispatch-event "performKsmps"))

(defn log-event [log]
  (if (exists? js/window)
    (.log js/console "%c%s" "font-size: 13px;" log)
    (.log js/console log))
  (dispatch-event "csoundLog" log))

;;;; Initializers

(declare activate-init-callback)

(defn csound-new-object []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["csoundNew"])
    (reset! csound-instance
            ^js (((.-cwrap @libcsound)
                  "CsoundObj_new"
                  #js ["number"] nil)))))

(defn reset-sequence
  [{:keys [sr buffer nchnls nchnls_i zerodbfs ksmps]}]
  (set-option (str "-b" (/ buffer 2)))
  (set-option (str "-B" buffer))
  (set-option (str "--nchnls=" nchnls))
  (set-option (str "--nchnls_i=" nchnls_i))
  (set-option (str "--ksmps=" ksmps))
  (set-option (str "--sample-rate=" sr))
  (set-option (str "--0dbfs=" zerodbfs))
  (set-option "-M0")
  (set-option "-idac")
  (set-option "-odac")
  (set-option "-+rtmidi=null")
  (set-option "-+rtaudio=null")
  (dispatch-event "csoundReady"))

(defn play-csd [csd & [config]]
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["playCSD" csd])
    (if @wasm-loaded?
      (let [config (merge @audio-config
                          (if (map? config)
                            config
                            (js->clj
                             (or config #js {})
                             :keywordize-keys true)))
            {:keys [nchnls nchnls_i zerodbfs sr ksmps buffer]}
            config]
        (if-not @audio-started?
          (do (reset! audio-config config)
              (reset-sequence config)
              (compile-csd csd)
              (@start-audio-fn config))
          (do (reset)
              (prepareRT) ;; this prevents cannot open idac errors
              (reset-sequence config)
              (compile-csd csd)
              (@start-audio-fn config))))
      (vswap! event-queue conj #(play-csd csd)))))

(defn start-realtime [& [config]]
  (let [config (merge @audio-config
                      (if (map? config)
                        config
                        (js->clj
                         (or config #js {})
                         :keywordize-keys true)))
        {:keys [nchnls zerodbfs sr ksmps buffer]}
        config]
    (if @wasm-initialized?
      (do (when @audio-started?
            (reset)
            (prepareRT))
          (reset-sequence config)
          ;; Dummy event
          (compile-orc "event_i \"f\", 0, 360000000")
          (when (fn? @start-audio-fn)
            (@start-audio-fn config)))
      (let [awn @audio-worklet-node]
        (reset! audio-config config)
        (when awn
          ((:post awn) #js ["setStartupFn" "startRealtime" (clj->js config)]))
        (vreset! startup-fn #(apply start-realtime [config]))))))

(defn run-event-queue []
  (vreset! wasm-loaded? true)
  (when (fn? @startup-fn)
    (@startup-fn))
  (when (and (not (empty? @event-queue))
             (not @audio-worklet-node))
    (doseq [event @event-queue]
      (event))
    (vreset! event-queue [])))

(defn initialize []
  (when-not @wasm-initialized?
    (csound-new-object)
    (prepareRT)
    (vreset! wasm-initialized? true)))

(defn instanciate-libcsound [Libcsound]
  (when-not @wasm-initialized?
    (if Libcsound
      (Libcsound #js {:postRun
                      (fn []
                        (when (or Libcsound
                                  @audio-worklet-node)
                          (initialize)
                          (run-event-queue)))
                      :noExitRuntime true
                      :print         log-event
                      :printErr      log-event})
      (when-let [awn @audio-worklet-node]
        ((:post awn) #js ["instanciateLibcsound"])))))

(defn activate-init-callback [Libcsound]
  (instanciate-libcsound Libcsound))
