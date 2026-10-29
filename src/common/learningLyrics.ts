import type { IParsedLrcItem } from './lyricParser';
import type { Language } from '../infra/learning/common';
export function learningTokens(text: string, language: Language) {
    const Segmenter = (
        Intl as unknown as {
            Segmenter: new (
                locale: string,
                options: { granularity: string },
            ) => {
                segment(text: string): Iterable<{ segment: string; isWordLike: boolean }>;
            };
        }
    ).Segmenter;
    return [...new Segmenter(language, { granularity: 'word' }).segment(text)];
}
export const hasJapanese = (text: string) => /[\u3040-\u30ff]/.test(text);
export const hasChineseTranslation = (text?: string) =>
    !!text && /[\u3400-\u9fff]/.test(text) && !hasJapanese(text);
export function learningLanguage(text: string, songLanguage: Language = 'en'): Language {
    if (hasJapanese(text)) return 'ja';
    if (/[A-Za-z]/.test(text)) return 'en';
    if (/[\u3400-\u9fff]/.test(text)) return songLanguage === 'ja' ? 'ja' : 'zh';
    return songLanguage;
}
export function learningLines(lyrics: IParsedLrcItem[]): IParsedLrcItem[] {
    const result: IParsedLrcItem[] = [];
    for (const item of lyrics) {
        if (!item.lrc.trim()) continue;
        const previous = result[result.length - 1];
        if (
            previous &&
            Math.abs(previous.time - item.time) < 0.01 &&
            /[A-Za-z\u3040-\u30ff]/.test(previous.lrc) &&
            hasChineseTranslation(item.lrc)
        ) {
            result[result.length - 1] = {
                ...previous,
                translation: previous.translation || item.lrc,
            };
        } else result.push({ ...item });
    }
    return result;
}

export function singingLines(lyrics: IParsedLrcItem[]): IParsedLrcItem[] {
    const result: IParsedLrcItem[] = [];
    for (const item of learningLines(lyrics)
        .filter((line) => Number.isFinite(line.time))
        .sort((a, b) => a.time - b.time)) {
        if (!result.length || Math.abs(result[result.length - 1].time - item.time) > 0.01)
            result.push(item);
    }
    return result;
}

export function singingRange(
    line: IParsedLrcItem,
    lyrics: IParsedLrcItem[],
    offset: number,
    duration: number,
) {
    const start = Math.max(0, line.time + offset);
    const next = lyrics
        .filter((item) => Number.isFinite(item.time) && item.time > line.time + 0.01)
        .map((item) => item.time + offset);
    const end = Math.min(
        next.length ? Math.min(...next) : Infinity,
        duration > 0 ? duration : Infinity,
    );
    return Number.isFinite(end) && end > start + 0.05 ? { start, end } : null;
}
