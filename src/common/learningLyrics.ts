import type { IParsedLrcItem } from './lyricParser';
import type { Language } from '../infra/learning/common';
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
