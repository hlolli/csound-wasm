(ns csound-wasm.core
  (:require ["speaker" :as Speaker]
            ["fs" :as fs]
            ["path" :as path]
            ["v8" :as v8]))

(def libcsound (js/require "./libcsound.js"))

(def wasm-fs libcsound.FS)

(def wasm-node-fs libcsound.NODEFS)

(def csound-object libcsound.Module)

(def csound-instance (atom nil))

(def wasm-loaded? (volatile! false))

(def wasm-initialized? (volatile! false))

(def wasm-buffer-offset (volatile! 0))


(defn wasm-start [csound-instance]
  ;; (.setFlagsFromString v8 "--no-use_strict") ;; To be able to load web-audio-api
  (let [ksmps ((.cwrap csound-object "CsoundObj_getKsmps" #js ["number"] #js ["number"])
               csound-instance)
        input-count ((.cwrap csound-object "CsoundObj_getInputChannelCount" #js ["number"] #js ["number"])
                     csound-instance)
        output-count ((.cwrap csound-object "CsoundObj_getOutputChannelCount" #js ["number"] #js ["number"])
                      csound-instance)
        audio-context-constructor (.-AudioContext (js/require "web-audio-api"))
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
        ;; TODO add microphone input buffer
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


(def event-queue (volatile! []))
(def startup-fn (volatile! nil))

(def global-audio-context (atom nil))
(def global-audio-process-node (atom nil))

(set! (.-onRuntimeInitialized csound-object)
      (fn []
        (reset! csound-instance (._CsoundObj_new csound-object))
        (vreset! wasm-initialized? true)
        (when (fn? @startup-fn)
          (@startup-fn))
        (js/setTimeout
         #(do (vreset! wasm-loaded? true)
              (doseq [event @event-queue]
                (event))
              (vreset! event-queue []))
         2000)))

(defn start-realtime [[config]]
  (if @wasm-initialized?
    (let [{:keys [nchnls zerodbfs sr ksmps]
           :or {nchnls 2 zerodbfs 1 sr 44100 ksmps 256}}
          (js->clj (or config #js {}) :keywordize-keys true)]
      ((.cwrap csound-object "CsoundObj_prepareRT" nil #js ["number"]) @csound-instance)
      ((.cwrap csound-object "CsoundObj_compileOrc" "number" #js ["number" "string"])
       @csound-instance (str "sr=" sr
                             "\nnchnls=" nchnls
                             "\n0dbfs=" zerodbfs
                             "\nksmps=" ksmps))
      (wasm-start @csound-instance))
    (vreset! startup-fn #(start-realtime config))))

(defn compile-orc [orc]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_compileOrc" "number" #js ["number" "string"])
     @csound-instance orc)
    (vswap! event-queue conj #(compile-orc orc))))

(defn eval-code [orc]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_evaluateCode" "number" #js ["number" "string"])
     @csound-instance orc)
    (vswap! event-queue conj #(eval-code orc))))

(defn input-message [sco]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_inputMessage" "number" #js ["number" "string"])
     @csound-instance sco)
    (vswap! event-queue conj (fn [] (js/setTimeout #(input-message sco)) 1))))

(defn read-score [sco]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_readScore" "number" #js ["number" "string"])
     @csound-instance sco)
    (vswap! event-queue conj #(read-score sco))))

(defn get-control-channel [ctrl-channel callback]
  (if @wasm-loaded?
    (let [ret-val ((.cwrap csound-object "CsoundObj_getControlChannel" #js ["number"] #js ["number" "string"])
                   @csound-instance ctrl-channel)]
      (callback ret-val))
    (vswap! event-queue conj #(get-control-channel ctrl-channel callback))))

(defn set-control-channel [ctrl-channel val]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_setControlChannel" nil #js ["number" "string" "number"])
     @csound-instance ctrl-channel val)
    (vswap! event-queue conj #(set-control-channel ctrl-channel val))))

(defn set-string-channel [string-channel string]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_setStringChannel" nil #js ["number" "string" "string"])
     @csound-instance string-channel string)
    (vswap! event-queue conj #(set-control-channel set-string-channel string))))

(defn get-score-time [callback]
  (if @wasm-loaded?
    (let [ret-val ((.cwrap csound-object "CsoundObj_getScoreTime" nil #js ["number"])
                   @csound-instance)]
      (callback ret-val))
    (vswap! event-queue conj #(get-score-time callback))))

(defn reset []
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_reset" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(reset))))

(defn stop []
  (if @wasm-loaded?
    (do (set! (.-outStream @global-audio-context) nil)
        (.disconnect @global-audio-process-node)
        (set! (.-onaudioprocess @global-audio-process-node) nil))
    (vswap! event-queue conj #(stop))))

(defn destroy []
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_destroy" nil #js ["number"])
     @csound-instance)
    (vswap! event-queue conj #(destroy))))

(defn set-option [option]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_setOption" nil #js ["number" "string"])
     @csound-instance option)
    (vswap! event-queue conj #(set-option option))))

(defn compile-csd [csd]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_compileCSD" nil #js ["number" "string"])
     @csound-instance csd)
    (vswap! event-queue conj #(compile-csd csd))))

(defn play-csd [csd]
  (if @wasm-loaded?
    (do (compile-csd csd)
        (wasm-start @csound-instance))
    (vswap! event-queue conj #(play-csd csd))))

(defn render-to-file [csd file-name]
  (let [file-name (or file-name "test.wav")]
    (if @wasm-loaded?
      (do 
        (compile-csd csd)
        ((.cwrap csound-object "CsoundObj_render" nil #js ["number"])
         @csound-instance)
        (let [file-data (.readFile wasm-fs "test.wav" #js {:encoding "binary"})]
          (fs/writeFileSync file-name file-data)
          (println (str "Render finished, file " (path/resolve file-name) " was written."))
          (.exit js/process)))
      (vswap! event-queue conj #(render-to-file csd file-name)))))

(defn set-table [table-num index val]
  (if @wasm-loaded?
    ((.cwrap csound-object "CsoundObj_setTable" nil #js ["number" "number" "number" "number"])
     @csound-instance table-num index val)
    (vswap! event-queue conj #(set-table table-num index val))))

(defn get-table-length [table-num callback]
  (if @wasm-loaded?
    (let [ret ((.cwrap csound-object "CsoundObj_getTableLength" #js ["number"] #js ["number" "number"])
               @csound-instance table-num)]
      (callback ret))
    (vswap! event-queue conj #(get-table-length table-num callback))))

(defn get-table [table-num callback]
  (if @wasm-loaded?
    (let [ret ((.cwrap csound-object "CsoundObj_getTable" #js ["number"] #js ["number" "number"])
               @csound-instance table-num)]
      (callback ret))
    (vswap! event-queue conj #(get-table table-num callback))))

(defn get-ksmps [callback]
  (if @wasm-loaded?
    (let [ret ((.cwrap csound-object "CsoundObj_getKsmps" #js ["number"] #js ["number"])
               @csound-instance)]
      (callback ret))
    (vswap! event-queue conj #(get-ksmps callback))))

(defn get-0dbfs [callback]
  (if @wasm-loaded?
    (let [ret ((.cwrap csound-object "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
               @csound-instance)]
      (callback ret))
    (vswap! event-queue conj #(get-0dbfs callback))))
