(ns csound-wasm.public)


(def event-queue (volatile! []))

(def startup-fn (volatile! nil))

(def start-audio-fn (volatile! nil))

(def wasm-loaded? (volatile! false))

(def wasm-initialized? (volatile! false))

(def csound-object (atom nil))

(def csound-instance (atom nil))

(defn activate-init-callback []
  (set! (.-onRuntimeInitialized @csound-object)
        (fn []
          (reset! csound-instance (._CsoundObj_new @csound-object))
          (vreset! wasm-initialized? true)
          (when (fn? @startup-fn)
            (@startup-fn))
          (js/setTimeout
           #(do (vreset! wasm-loaded? true)
                (doseq [event @event-queue]
                  (event))
                (vreset! event-queue []))
           2000))))

(defn start-realtime [[config]]
  (if @wasm-initialized?
    (let [{:keys [nchnls zerodbfs sr ksmps]
           :or {nchnls 2 zerodbfs 1 sr 44100 ksmps 256}}
          (js->clj (or config #js {}) :keywordize-keys true)]
      ((.cwrap @csound-object "CsoundObj_prepareRT" nil #js ["number"]) @csound-instance)
      ((.cwrap @csound-object "CsoundObj_compileOrc" "number" #js ["number" "string"])
       @csound-instance (str "sr=" sr
                             "\nnchnls=" nchnls
                             "\n0dbfs=" zerodbfs
                             "\nksmps=" ksmps))
      (@start-audio-fn @csound-instance))
    (vreset! startup-fn #(start-realtime config))))

(defn compile-orc [orc]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_compileOrc" "number" #js ["number" "string"])
     @csound-instance orc)
    (vswap! event-queue conj #(compile-orc orc))))

(defn eval-code [orc]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_evaluateCode" "number" #js ["number" "string"])
     @csound-instance orc)
    (vswap! event-queue conj #(eval-code orc))))

(defn input-message [sco]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_inputMessage" "number" #js ["number" "string"])
     @csound-instance sco)
    (vswap! event-queue conj (fn [] (js/setTimeout #(input-message sco)) 1))))

(defn read-score [sco]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_readScore" "number" #js ["number" "string"])
     @csound-instance sco)
    (vswap! event-queue conj #(read-score sco))))

(defn get-control-channel [ctrl-channel callback]
  (if @wasm-loaded?
    (let [ret-val ((.cwrap @csound-object "CsoundObj_getControlChannel" #js ["number"] #js ["number" "string"])
                   @csound-instance ctrl-channel)]
      (callback ret-val))
    (vswap! event-queue conj #(get-control-channel ctrl-channel callback))))

(defn set-control-channel [ctrl-channel val]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_setControlChannel" nil #js ["number" "string" "number"])
     @csound-instance ctrl-channel val)
    (vswap! event-queue conj #(set-control-channel ctrl-channel val))))

(defn set-string-channel [string-channel string]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_setStringChannel" nil #js ["number" "string" "string"])
     @csound-instance string-channel string)
    (vswap! event-queue conj #(set-control-channel set-string-channel string))))

(defn get-score-time [callback]
  (if @wasm-loaded?
    (let [ret-val ((.cwrap @csound-object "CsoundObj_getScoreTime" nil #js ["number"])
                   @csound-instance)]
      (callback ret-val))
    (vswap! event-queue conj #(get-score-time callback))))

(defn reset []
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_reset" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(reset))))

(defn destroy []
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_destroy" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(destroy))))

(defn set-option [option]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_setOption" nil #js ["number" "string"])
     @csound-instance option)
    (vswap! event-queue conj #(set-option option))))

(defn compile-csd [csd]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_compileCSD" nil #js ["number" "string"])
     @csound-instance csd)
    (vswap! event-queue conj #(compile-csd csd))))

(defn play-csd [csd]
  (if @wasm-loaded?
    (do (compile-csd csd)
        (@start-audio-fn @csound-instance))
    (vswap! event-queue conj #(play-csd csd))))

(defn set-table [table-num index val]
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_setTable" nil #js ["number" "number" "number" "number"])
     @csound-instance table-num index val)
    (vswap! event-queue conj #(set-table table-num index val))))

(defn get-table-length [table-num callback]
  (if @wasm-loaded?
    (let [ret ((.cwrap @csound-object "CsoundObj_getTableLength" #js ["number"] #js ["number" "number"])
               @csound-instance table-num)]
      (callback ret))
    (vswap! event-queue conj #(get-table-length table-num callback))))

(defn get-table [table-num callback]
  (if @wasm-loaded?
    (let [ret ((.cwrap @csound-object "CsoundObj_getTable" #js ["number"] #js ["number" "number"])
               @csound-instance table-num)]
      (callback ret))
    (vswap! event-queue conj #(get-table table-num callback))))

(defn get-ksmps [callback]
  (if @wasm-loaded?
    (let [ret ((.cwrap @csound-object "CsoundObj_getKsmps" #js ["number"] #js ["number"])
               @csound-instance)]
      (callback ret))
    (vswap! event-queue conj #(get-ksmps callback))))

(defn get-0dbfs [callback]
  (if @wasm-loaded?
    (let [ret ((.cwrap @csound-object "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
               @csound-instance)]
      (callback ret))
    (vswap! event-queue conj #(get-0dbfs callback))))

(defn set-midi-callbacks []
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_setMidiCallbacks" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(set-midi-callbacks))))

(defn push-midi-message [byte1 byte2 byte3]
  ;; (prn "MIDI" byte1 byte2 byte3)
  (if @wasm-loaded?
    ((.cwrap @csound-object "CsoundObj_pushMidiMessage" nil #js ["number" "number" "number" "number"])
     @csound-instance byte1 byte2 byte3)
    (vswap! event-queue conj #(push-midi-message byte1 byte2 byte3))))
