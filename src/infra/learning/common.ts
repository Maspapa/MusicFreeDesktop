export type Language = 'en' | 'ja' | 'zh';
export interface DictionaryEntry {
    word: string;
    phonetic: string;
    translation: string;
}
export interface LearningBridge {
    speak(text: string, language: Language, rate: number): Promise<void>;
    speakWords(words: string[], language: Language, onWord: (index: number) => void): Promise<void>;
    stop(): Promise<void>;
    lookup(word: string, language: Language): Promise<DictionaryEntry[]>;
    translate(text: string, language: Language): Promise<string>;
}
export const CHANNEL = 'maspapa:learning';
export const WORD_CHANNEL = `${CHANNEL}:word`;
