import { atom, getDefaultStore } from 'jotai';
import bridge from '@infra/learning/renderer';
import type { Language } from '@infra/learning/common';
import type { IParsedLrcItem } from '@common/lyricParser';
import {
    hasJapanese,
    learningLanguage,
    learningLines,
    learningTokens,
    singingLines,
    singingRange,
} from '@common/learningLyrics';

export const learningAtom = atom({
    enabled: false,
    speaking: false,
    index: 0,
    loop: false,
    error: '',
    activeToken: -1,
    kind: 'words' as 'words' | 'singing',
    singingRate: 1,
});
const store = getDefaultStore();
const state = () => store.get(learningAtom);
const update = (patch: Partial<ReturnType<typeof state>>) =>
    store.set(learningAtom, { ...state(), ...patch });
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lines: IParsedLrcItem[] = [];
let songLanguage: Language = 'en';
let getSource: () => {
    lines: IParsedLrcItem[];
    time: number;
    pause: () => void;
    duration?: number;
    speed?: number;
    offset?: number;
    play?: () => void;
    seek?: (time: number) => void;
    setSpeed?: (rate: number) => void;
};
let originalSpeed: number | undefined;
let boundary: { start: number; end: number } | null = null;
function restoreSpeed() {
    if (originalSpeed !== undefined) getSource().setSpeed?.(originalSpeed);
    originalSpeed = undefined;
}

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
        update({ speaking: false, activeToken: -1 });
        boundary = null;
        if (state().kind === 'singing') getSource().pause();
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
            if (state().kind === 'singing') {
                const source = getSource();
                const range = singingRange(
                    line,
                    source.lines,
                    source.offset ?? 0,
                    source.duration ?? 0,
                );
                if (!range || !source.play || !source.seek || !source.setSpeed)
                    throw new Error('当前句结束时间不可用，请等待歌曲时长加载');
                source.setSpeed(state().singingRate);
                source.seek(range.start);
                boundary = range;
                source.play();
                return;
            }
            const language = learningLanguage(line.lrc, songLanguage);
            const words = learningTokens(line.lrc, language)
                .map((token, index) => ({ ...token, index }))
                .filter((token) => token.isWordLike);
            if (words.length)
                await bridge.speakWords(
                    words.map((word) => word.segment),
                    language,
                    (index) => {
                        if (ticket === generation && words[index])
                            update({ activeToken: words[index].index });
                    },
                );
            if (ticket !== generation) return;
            update({ speaking: false, activeToken: -1 });
            if (state().enabled && state().loop)
                timer = setTimeout(() => {
                    void this.play();
                }, 2000);
        } catch (error) {
            if (ticket === generation)
                update({ speaking: false, activeToken: -1, error: String(error) });
        }
    },
    enter(kind: 'words' | 'singing' = 'words') {
        if (kind === 'singing' && new Set(getSource().lines.map((line) => line.time)).size < 2) {
            update({ error: '学唱法需要带时间轴的歌词' });
            return;
        }
        if (state().enabled) {
            this.pause();
            restoreSpeed();
        }
        const source = getSource();
        lines = kind === 'singing' ? singingLines(source.lines) : learningLines(source.lines);
        if (!lines.length) {
            update({ error: '没有歌词，无法开启学习模式' });
            return;
        }
        source.pause();
        songLanguage = lines.some((line) => hasJapanese(line.lrc)) ? 'ja' : 'en';
        let index = 0;
        if (new Set(lines.map((line) => line.time)).size > 1) {
            lines.forEach((line, i) => {
                if (line.time + (source.offset ?? 0) <= source.time) index = i;
            });
        }
        if (kind === 'singing') originalSpeed = source.speed ?? 1;
        update({ enabled: true, index, error: '', kind, loop: kind === 'singing' });
        void this.play();
    },
    exit() {
        this.pause();
        restoreSpeed();
        lines = [];
        update({ enabled: false, index: 0, error: '', kind: 'words', loop: false });
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
    cycleSingingRate() {
        const rates = [1, 0.75, 0.5];
        update({ singingRate: rates[(rates.indexOf(state().singingRate) + 1) % rates.length] });
        if (state().enabled && state().kind === 'singing' && state().speaking) void this.play();
    },
    onProgress(time: number) {
        if (
            !state().enabled ||
            state().kind !== 'singing' ||
            !state().speaking ||
            !boundary ||
            time < boundary.end - 0.03
        )
            return;
        if (state().loop) void this.play();
        else this.pause();
    },
    onEnded() {
        if (state().kind === 'singing' && state().speaking && state().loop) void this.play();
        else this.pause();
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
