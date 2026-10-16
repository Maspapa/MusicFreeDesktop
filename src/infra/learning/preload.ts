import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL, WORD_CHANNEL, type LearningBridge } from './common';
let requestId = 0;
const bridge: LearningBridge = {
    speak: (text, language, rate) => ipcRenderer.invoke(CHANNEL, 'speak', { text, language, rate }),
    speakWords: async (words, language, onWord) => {
        const id = ++requestId;
        const listener = (
            _event: Electron.IpcRendererEvent,
            progress: { requestId: number; index: number },
        ) => {
            if (progress.requestId === id && Number.isInteger(progress.index))
                onWord(progress.index);
        };
        ipcRenderer.on(WORD_CHANNEL, listener);
        try {
            await ipcRenderer.invoke(CHANNEL, 'speakWords', {
                text: words.join(' '),
                words,
                language,
                rate: 0.5,
                requestId: id,
            });
        } finally {
            ipcRenderer.removeListener(WORD_CHANNEL, listener);
        }
    },
    stop: () => ipcRenderer.invoke(CHANNEL, 'stop'),
    lookup: (text, language) => ipcRenderer.invoke(CHANNEL, 'lookup', { text, language }),
    translate: (text, language) => ipcRenderer.invoke(CHANNEL, 'translate', { text, language }),
};
contextBridge.exposeInMainWorld('learningBridge', bridge);
