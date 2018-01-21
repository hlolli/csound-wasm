(ns csound-wasm.core
  (:require ["speaker" :as Speaker]
            ["fs" :as fs]))

(def libcsound (js/require "./libcsound.js"))

(def csound-object libcsound.Module)

(def csound-instance (atom nil))

(def wasm-loaded? (volatile! false))

(def wasm-buffer-offset (volatile! 0))

(defn wasm-start [csound-instance]
  (.setFlagsFromString (js/require "v8") "--no-use_strict") ;; To be able to load web-audio-api
  (let [ksmps ((.cwrap csound-object "CsoundObj_getKsmps" #js ["number"] #js ["number"])
               csound-instance)
        ;; _ (println "KSMPS = " ksmps)
        ;; (._CsoundObj_getKsmps csound-object csound-instance)
        input-count ((.cwrap csound-object "CsoundObj_getInputChannelCount" #js ["number"] #js ["number"])
                     csound-instance)
        ;; (._CsoundObj_getInputChannelCount csound-object csound-instance)
        output-count ((.cwrap csound-object "CsoundObj_getOutputChannelCount" #js ["number"] #js ["number"])
                      csound-instance)
        ;; (._CsoundObj_getOutputChannelCount csound-object csound-instance)
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
        ;; (._CsoundObj_getOutputBuffer csound-object csound-instance)
        csound-output-buffer (new js/Float32Array (.-buffer (.-HEAP8 csound-object))
                                  output-pointer (* ksmps output-count))
        ;; TODO add microphone input buffer
        zerodbfs ((.cwrap csound-object "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
                  csound-instance)
        ;; (._CsoundObj_getZerodBFS csound-object csound-instance)
        process-buffers (fn [e sample-count src-offset dst-offset]
                          (doseq [i (range output-count)]
                            (doseq [j (range sample-count)]
                              ;; (println i j output-count src-offset)
                              (aset (-> (.-outputBuffer e )
                                        (.getChannelData i))
                                    (+ j dst-offset)
                                    (aget csound-output-buffer
                                          (+ i (* output-count
                                                  (+ j src-offset))))))))
        ;; offset (atom ksmps)
        ;; Speaker (js/require "speaker")
        perform-ksmps-fn (fn []
                           ((.cwrap csound-object "CsoundObj_performKsmps" #js ["number"] #js ["number"])
                            csound-instance
                            ;; (._CsoundObj_performKsmps csound-object csound-instance)
                            ))]
    (vreset! wasm-buffer-offset ksmps)
    (set! (.-outStream audio-context)
          (new Speaker #js {:channels (.-numberOfChannels
                                       (.-format audio-context))
                            :bitDepth (.-bitDepth
                                       (.-format audio-context))
                            :sampleRate (.-sampleRate audio-context)}))
    (.connect audio-process-node (.-destination audio-context))
    (set! (.-onaudioprocess audio-process-node)
          (fn [e]
            (let [sample-count (- ksmps @wasm-buffer-offset)
                  index (if (< 0 sample-count)
                          (do (process-buffers e sample-count @wasm-buffer-offset 0) sample-count)
                          0)]
              (loop [index index
                     sample-count sample-count]
                (if-not (< index buffer-size)
                  (vreset! wasm-buffer-offset sample-count)
                  (let [res (perform-ksmps-fn)
                        sample-count (Math/min ksmps (- buffer-size index))]
                    (if (not= 0 res)
                      (do (.disconnect audio-process-node)
                          (set! (.-onaudioprocess audio-process-node) nil))
                      (do (when (js/isNaN (aget csound-output-buffer 0))
                            (.error js/console (str "NaN! outputPointer = " output-pointer)))
                          (process-buffers e sample-count 0 index)
                          (recur (+ index sample-count)
                                 sample-count)))))))))
    nil))


(def event-queue (volatile! []))

(defn start []
  ;; (wasm-mount-table-dir)
  ((.cwrap csound-object "CsoundObj_prepareRT" nil #js ["number"]) @csound-instance)
  ((.cwrap csound-object "CsoundObj_compileOrc" "number" #js ["number" "string"])
   @csound-instance "nchnls=2\n 0dbfs=1\n")
  (wasm-start @csound-instance))

(defn start-when-ready []
  (js/setTimeout
   (fn []
     (if (fn? (.-_CsoundObj_new csound-object))
       (do (reset! csound-instance (._CsoundObj_new csound-object))
           (start)
           (vreset! wasm-loaded? true)
           (doseq [event @event-queue]
             (event))
           (vreset! event-queue []))
       (start-when-ready)))
   1))

(start-when-ready)

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

#_(defn input-message [sco]
    (if @wasm-loaded?
      ((.cwrap csound-object "CsoundObj_inputMessage" "number" #js ["number" "string"])
       @csound-instance sco)
      (vswap! event-queue conj #(input-message sco))))

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

(defn get-file-name-string []
  ((.cwrap csound-object "CsoundObj_getScoreTime" #js ["number"] #js ["number"])
   @csound-instance))

(defn compile-csd [csd & [filename]]
  (let [filename (or filename "test.wav")
        scoretime (volatile! 0)
        ;; score-end-fn
        #_(fn []
            (js/setTimeout #(if (= @scoretime (get-score-time))
                              (fs/writeFileSync
                               filename
                               (fs/open )))
                           100))]
    (if @wasm-loaded?
      (do
        (reset)
        (set-option (str "-o " filename))
        ((.cwrap csound-object "CsoundObj_compileCSD" nil #js ["number" "string"])
         @csound-instance csd)
        )
      (vswap! event-queue conj #(compile-csd csd filename)))))
