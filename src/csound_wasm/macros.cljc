(ns csound-wasm.macros)

(defmacro wrap-ipc-promise [message]
  `(js/Promise.
    (fn [resolve# reject#]
      (let [promise-id# (.-str (gensym))]
        (swap! csound-wasm.public/ipc-promise-queue
               assoc promise-id# [resolve# reject#])
        ((:post (deref csound-wasm.public/audio-worklet-node))
         (.concat (js/Array "promise" promise-id#) ~message))))))

(defmacro wrap-promise [callback]
  `(if @csound-wasm.public/audio-worklet-processor
     (~callback)
     (js/Promise.
      (fn [resolve# reject#]
        (if @csound-wasm.public/wasm-loaded?
          (resolve# (~callback))
          (vswap! csound-wasm.public/event-queue conj #(resolve# (~callback))))))))
