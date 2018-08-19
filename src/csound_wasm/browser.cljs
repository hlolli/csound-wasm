(ns csound-wasm.browser
  (:require [csound-wasm.public :as public]
            [csound-wasm.browser-shared :as shared]
            ["libcsound_browser" :as Libcsound]))

(declare audio-context)

(def csound-started? (volatile! false))

(defn start-audio [csound-instance buffer-size auto-reset?]
  (let [libcsound          @public/libcsound
        ksmps              ((libcsound.cwrap "CsoundObj_getKsmps" #js ["number"] #js ["number"])
                            csound-instance)
        input-count        ((libcsound.cwrap "CsoundObj_getInputChannelCount" #js ["number"] #js ["number"])
                            csound-instance)
        output-count       ((libcsound.cwrap "CsoundObj_getOutputChannelCount" #js ["number"] #js ["number"])
                            csound-instance)
        actx               (or js/window.AudioContext js/window.webkitAudioContext)
        audio-context      (new actx)
        audio-process-node (.createScriptProcessor
                            audio-context
                            buffer-size input-count output-count)
        _                  (do (set! (.-inputCount audio-process-node) input-count)
                               (set! (.-outputCount audio-process-node) output-count))
        ;; buffer-size               (.-bufferSize audio-process-node)
        output-pointer     ((libcsound.cwrap "CsoundObj_getOutputBuffer" #js ["number"] #js ["number"])
                            csound-instance)
        output-buffer      (new js/Float64Array (.-buffer (.-HEAP8 libcsound))
                                ^js output-pointer (* ksmps output-count))
        ;; TODO add microphone input buffer
        zerodbfs           ((libcsound.cwrap "CsoundObj_getZerodBFS" #js ["number"] #js ["number"])
                            csound-instance)
        range-output-cnt   (range output-count)
        perform-ksmps-fn   (fn []
                             (let [res ((libcsound.cwrap
                                         "CsoundObj_performKsmps" #js ["number"] #js ["number"])
                                        csound-instance)]
                               (when (zero? res)
                                 (public/perform-ksmps-event))
                               res))]
    (set! (.-onaudioprocess audio-process-node)
          (fn [e]
            (let [output (.-outputBuffer e)]
              (loop [res (perform-ksmps-fn)
                     i   0
                     cnt 0
                     len buffer-size]
                (when (not @csound-started?)
                  (public/dispatch-event "csoundStarted")
                  (vreset! csound-started? true))
                (when (< i len)
                  (if (and (< cnt len) (not (js/isNaN (aget output-buffer (* cnt output-count)))))
                    (if (not= 0 res)
                      (do (.disconnect audio-process-node)
                          (set! (.-onaudioprocess audio-process-node) nil)
                          (when auto-reset? (public/reset))
                          (vreset! csound-started? false))
                      (do (run! #(aset (.getChannelData output %)
                                       i
                                       (/ (aget output-buffer (+ % (* cnt output-count))) zerodbfs))
                                range-output-cnt)
                          (recur res (inc i) (inc cnt) len)))
                    (let [res (perform-ksmps-fn)]
                      (recur res
                             i
                             0
                             len))))))))
    (.connect audio-process-node (.-destination audio-context))
    nil))


(if (exists? js/AudioWorklet)
  (do
    (def audio-context (new js/AudioContext #js {:latencyHint "playback"}))
    (defn component [ ctx ]
      (this-as that
        (let [nchnls   (:nchnls @public/audio-config)
              instance (js/Reflect.construct
                        js/AudioWorkletNode
                        #js [ctx "csound-processor"
                             #js {:numberOfOutputs 1
                                  :outputChannelCount
                                  #js [ nchnls ]}]
                        component)]
          (.connect instance (.-destination audio-context))
          instance)))
    (set! (.. component -prototype)
          (js/Object.assign
           (.. js/AudioWorkletNode -prototype)
           #js {:constructor (fn [ctx] (component ctx))}))

    (-> (.addModule audio-context.audioWorklet "./csound-wasm-worklet-processor.js")
        (.then
         (fn []
           (let [node (new component audio-context)]
             (set! (.. node -port -onmessage)
                   (fn [event]
                     (let [data (.-data event)]
                       (case (aget data 0)
                         "promise"
                         (when-let [resrej (get @public/ipc-promise-queue (aget data 1))]
                           (let [[resolve reject] resrej]
                             (resolve (aget data 2))
                             (swap! public/ipc-promise-queue dissoc (aget data 1))))
                         "dispatchEvent"
                         (apply public/dispatch-event (rest (.-data event)))
                         "workletProcessorReady"
                         (do (public/activate-init-callback nil)
                             (run! #(.postMessage node.port %)
                                   @public/worklet-message-queue)
                             (reset! public/worklet-message-queue [])
                             (reset! public/audio-worklet-node
                                     {:object node
                                      :post   (fn [msg]
                                                (.postMessage node.port msg))}))
                         (println "unhandled message: " event))))))))
        (.catch (fn [err]
                  (.warn js/console
                         (str "Error fetching AudioWorklet processor, "
                              "falling back to WebAudio's script processor.\n")
                         err)
                  (reset! public/audio-worklet-node nil)
                  (vreset! public/start-audio-fn start-audio)
                  (let [libcsound (public/activate-init-callback Libcsound)]
                    (reset! public/libcsound libcsound))))))
  (do
    (.warn js/console
           (str "No AudioWorklet support found"))
    (reset! public/audio-worklet-node false)
    (vreset! public/start-audio-fn start-audio)
    (let [libcsound (public/activate-init-callback Libcsound)]
      (reset! public/libcsound libcsound))))

(goog.exportSymbol "csound" shared/main)
