import { atom, getDefaultStore } from 'jotai';
import bridge from '@infra/learning/renderer';
import type { Language } from '@infra/learning/common';
import type { IParsedLrcItem } from '@common/lyricParser';
import { hasJapanese, learningLanguage, learningLines } from '@common/learningLyrics';

export const learningAtom = atom({
    enabled: false,
    speaking: false,
    index: 0,
    loop: false,
    error: '',
});
const store = getDefaultStore();
const state = () => store.get(learningAtom);
const update = (patch: Partial<ReturnType<typeof state>>) =>
    store.set(learningAtom, { ...state(), ...patch });
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lines: IParsedLrcItem[] = [];
let songLanguage: Language = 'en';
let getSource: () => { lines: IParsedLrcItem[]; time: number; pause: () => void };

const learningMode = {
    configure(source: typeof getSource) {
        getSource = source;
    },
    get enabled() {
        return state().enabled;
    },
    get speaking() {
        return state().speaking;
    },
    get lines() {
        return lines;
    },
    get language() {
        return songLanguage;
    },
    pause() {
        generation++;
        clearTimeout(timer);
        update({ speaking: false });
        void bridge.stop().catch(() => {});
    },
    async play() {
        this.pause();
        const ticket = generation;
        const line = lines[state().index];
        if (!state().enabled || !line) return;
        getSource().pause();
        update({ speaking: true, error: '' });
        try {
            await bridge.speak(line.lrc, learningLanguage(line.lrc, songLanguage), 0.5);
            if (ticket !== generation) return;
            update({ speaking: false });
            if (state().enabled && state().loop)
                timer = setTimeout(() => {
                    void this.play();
                }, 2000);
        } catch (error) {
            if (ticket === generation) update({ speaking: false, error: String(error) });
        }
    },
    enter() {
        const source = getSource();
        lines = learningLines(source.lines);
        if (!lines.length) {
            update({ error: '没有歌词，无法开启学习模式' });
            return;
        }
        source.pause();
        songLanguage = lines.some((line) => hasJapanese(line.lrc)) ? 'ja' : 'en';
        let index = 0;
        if (new Set(lines.map((line) => line.time)).size > 1) {
            lines.forEach((line, i) => {
                if (line.time <= source.time) index = i;
            });
        }
        update({ enabled: true, index, error: '' });
        void this.play();
    },
    exit() {
        this.pause();
        lines = [];
        update({ enabled: false, index: 0, error: '' });
    },
    select(index: number) {
        if (!state().enabled) return;
        const next = Math.max(0, Math.min(lines.length - 1, index));
        update({ index: next });
        void this.play();
    },
    navigate(delta: number) {
        this.select(state().index + delta);
    },
    toggleLoop() {
        update({ loop: !state().loop });
        if (!state().loop) clearTimeout(timer);
    },
    async speakWord(word: string, language: Language) {
        this.pause();
        const ticket = generation;
        try {
            await bridge.speak(word, language, 1);
        } catch (error) {
            if (ticket === generation) update({ error: String(error) });
        }
    },
};
window.addEventListener('beforeunload', () => learningMode.pause());
export default learningMode;
