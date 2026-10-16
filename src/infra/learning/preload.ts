import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL, type LearningBridge } from './common';
const bridge: LearningBridge = {
    speak: (text, language, rate) => ipcRenderer.invoke(CHANNEL, 'speak', { text, language, rate }),
    stop: () => ipcRenderer.invoke(CHANNEL, 'stop'),
    lookup: (text, language) => ipcRenderer.invoke(CHANNEL, 'lookup', { text, language }),
    translate: (text, language) => ipcRenderer.invoke(CHANNEL, 'translate', { text, language }),
};
contextBridge.exposeInMainWorld('learningBridge', bridge);
