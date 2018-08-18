(ns csound-wasm.public)

(def libcsound (atom nil))

(def worklet-message-queue (volatile! []))

(def audio-worklet-node
  (if (and (exists? js/AudioWorklet)
           (not (exists? js/AudioWorkletProcessor)))
    (atom {:post (fn [msg] (vswap! worklet-message-queue conj msg))})
    (atom nil)))

(def audio-worklet-processor
  (if (exists? js/AudioWorkletProcessor)
    (atom (fn [msg] (println "Missed a message: " msg)))
    (atom nil)))

(def event-queue (volatile! []))

(def startup-fn (volatile! nil))

(def start-audio-fn (volatile! nil))

(def wasm-loaded? (volatile! false))

(def wasm-initialized? (volatile! false))

(def csound-instance (atom nil))

(defn dispatch-event [e & [data]]
  (if-let [awp @audio-worklet-processor]
    ((:post awp) #js ["dispatchEvent" e data])
    (if data
      (.dispatchEvent js/window (new js/CustomEvent e #js {:detail data}))
      (.dispatchEvent js/window (new js/Event e)))))

(defn prepareRT []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["prepareRT"]))
  (((.-cwrap @libcsound) "CsoundObj_prepareRT"
    nil #js ["number"]) @csound-instance))

(defn set-option [option]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["setOption" option]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_setOption" nil #js ["number" "string"])
     @csound-instance option)
    (vswap! event-queue conj #(set-option option))))

(defn compile-orc [orc]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["compileOrc" orc]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_compileOrc" "number" #js ["number" "string"])
     @csound-instance orc)
    (vswap! event-queue conj #(compile-orc orc))))

(defn eval-code [orc]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["evalCode" orc]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_evaluateCode" "number" #js ["number" "string"])
     @csound-instance orc)
    (vswap! event-queue conj #(eval-code orc))))

(defn input-message [sco]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["inputMessage" sco]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_inputMessage" "number" #js ["number" "string"])
     @csound-instance sco)
    (vswap! event-queue conj #(input-message sco))))

#_(defn string-to-c [str]
    (let [len (inc (bit-shift-left (.-length str) 2))]
      (
       str
       (libcsound/stackAlloc )
       len)))

(defn input-message-async [sco]
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
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["readScore" sco]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_readScore" "number" #js ["number" "string"])
     @csound-instance sco)
    (vswap! event-queue conj #(read-score sco))))

(defn get-control-channel [ctrl-channel]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["getControlChannel" ctrl-channel]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_getControlChannel" #js ["number"] #js ["number" "string"])
     @csound-instance ctrl-channel)
    (vswap! event-queue conj #(get-control-channel ctrl-channel))))

(defn set-control-channel [ctrl-channel val]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["setControlChannel" #js [ctrl-channel val]]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_setControlChannel" nil #js ["number" "string" "number"])
     @csound-instance ctrl-channel val)
    (vswap! event-queue conj #(set-control-channel ctrl-channel val))))

(defn set-string-channel [string-channel string]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["setStringChannel" #js [string-channel string]]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_setStringChannel" nil #js ["number" "string" "string"])
     @csound-instance string-channel string)
    (vswap! event-queue conj #(set-control-channel set-string-channel string))))

(defn get-score-time []
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["getScoreTime"]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_getScoreTime" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(get-score-time))))

(defn get-score-time-sync []
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["getScoreTimeSync"]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_getScoreTime" nil #js ["number"])
     @csound-instance)
    0))

(defn reset []
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["reset"]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_reset" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(reset))))

(defn destroy []
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["destroy"]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_destroy" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(destroy))))

(defn compile-csd [csd]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["compileCSD" csd]))
  (if @wasm-loaded?
    (do (((.-cwrap @libcsound) "CsoundObj_compileCSD" nil #js ["number" "string"])
         @csound-instance csd)
        (dispatch-event "csoundReady"))
    (vswap! event-queue conj #(compile-csd csd))))

(defn play-csd [csd & [config]]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["playCSD" csd]))
  (if @wasm-loaded?
    (let [{:keys [nchnls zerodbfs sr ksmps buffer]
           :or   {nchnls 2 zerodbfs 1 sr 44100 ksmps 128 buffer 2048}}
          (js->clj (or config #js {}) :keywordize-keys true)]
      (set-option (str "-b" (* buffer 0.5)))
      (set-option (str "-B" buffer))
      (compile-csd csd)
      (@start-audio-fn @csound-instance buffer true))
    (vswap! event-queue conj #(play-csd csd))))

(defn set-table [table-num index val]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["setTable" table-num index val]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_setTable" nil #js ["number" "number" "number" "number"])
     @csound-instance table-num index val)
    (vswap! event-queue conj #(set-table table-num index val))))

(defn get-table-length [table-num]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["getTableLength" table-num]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_getTableLength" #js ["number"] #js ["number" "number"])
     @csound-instance table-num)
    (vswap! event-queue conj #(get-table-length table-num))))

(defn get-table [table-num]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["getTable" table-num]))
  (if @wasm-loaded?
    (let [buf (((.-cwrap @libcsound) "CsoundObj_getTable" #js ["number"] #js ["number" "number"])
               @csound-instance table-num)
          len (get-table-length table-num)]
      (if (= -1 len)
        (.error js/console (str "Error: table number " table-num
                                " doesn't exist, or hasn't been compiled yet."))
        (let [src (new js/Float64Array
                       (.-buffer (.-HEAP8 @libcsound)) buf len)]
          (new js/Float32Array src))))
    (vswap! event-queue conj #(get-table table-num))))

(defn get-ksmps []
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["getKsmps"]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_getKsmps" #js ["number"] #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(get-ksmps))))

(defn get-0dbfs []
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["get0dbfs"]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(get-0dbfs))))

(defn set-midi-callbacks []
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["setMidiCallbacks"]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_setMidiCallbacks" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(set-midi-callbacks))))

(defn push-midi-message [byte1 byte2 byte3]
  (when-let [awn @audio-worklet-node]
    ((:post awn) #js ["pushMidiMessage" byte1 byte2 byte3]))
  (if @wasm-loaded?
    (((.-cwrap @libcsound) "CsoundObj_pushMidiMessage" nil #js ["number" "number" "number" "number"])
     @csound-instance byte1 byte2 byte3)
    (vswap! event-queue conj #(push-midi-message byte1 byte2 byte3))))

;; Events

(defn on [event callback]
  (let [full-event-name (case event
                          "log"     "csoundLog"
                          "ready"   "csoundReady"
                          "started" "csoundStarted"
                          event)
        callback        (case event
                          "log" (fn [e] (callback e.detail))
                          callback)]
    (.addEventListener js/window full-event-name callback)))

(defn perform-ksmps-event []
  (dispatch-event "performKsmps"))

(defn log-event [log]
  (dispatch-event "csoundLog" log))


;;;; Initializers

(defn csound-new-object []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["csoundNew"])
    (reset! csound-instance ^js (((.-cwrap @libcsound) "CsoundObj_new" #js ["number"] nil)))))

(defn run-event-queue []
  (vreset! wasm-loaded? true)
  (when (and (not (empty? @event-queue))
             (not @audio-worklet-node)
             (not @audio-worklet-processor))
    (doseq [event @event-queue]
      (event))
    (vreset! event-queue [])))

(defn initialize []
  (when-not @wasm-initialized?
    (csound-new-object)
    (prepareRT)
    (vreset! wasm-initialized? true)
    (when (fn? @startup-fn)
      (@startup-fn))
    (run-event-queue)))

(defn instanciate-libcsound [Libcsound]
  (when-not @wasm-initialized?
    (if Libcsound
      (Libcsound #js {:postRun
                      (fn []
                        (when (or Libcsound
                                  @audio-worklet-node)
                          (run-event-queue)
                          (initialize)))
                      :noExitRuntime true})
      (when-let [awn @audio-worklet-node]
        ((:post awn) #js ["instanciateLibcsound"])))))

(defn activate-init-callback [Libcsound]
  (instanciate-libcsound Libcsound))

(defn start-realtime [& [config]]
  #_(if (= :pending @audio-worklet-node)
      (vreset! startup-fn #(start-realtime config))
      ((:post @audio-worklet-node) #js ["startRealtime" config]))
  (if @wasm-initialized?
    (let [{:keys [nchnls zerodbfs sr ksmps buffer]
           :or   {nchnls 2 zerodbfs 1 sr 44100 ksmps 128 buffer 2048}}
          (js->clj (or config #js {}) :keywordize-keys true)]
      (set-option (str "-b" buffer))
      (set-option (str "-B" (* 2 buffer)))
      (compile-orc (str "sr=" sr
                        "\nnchnls=" nchnls
                        "\n0dbfs=" zerodbfs
                        "\nksmps=" ksmps))
      (dispatch-event "csoundReady")
      (when (fn? @start-audio-fn)
        (@start-audio-fn @csound-instance buffer false)))
    (let [awn @audio-worklet-node]
      (when awn
        ((:post awn) #js ["setStartupFn" "startRealtime" config]))
      (vreset! startup-fn #(start-realtime config)))))
