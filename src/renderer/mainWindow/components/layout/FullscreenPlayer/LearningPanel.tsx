import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import he from 'he';
import learningMode, { learningAtom } from '@renderer/mainWindow/core/learningMode';
import bridge from '@infra/learning/renderer';
import type { DictionaryEntry } from '@infra/learning/common';
import { hasChineseTranslation, learningLanguage } from '@common/learningLyrics';
import './learning.scss';
import { openFullscreenPlayer } from './fullscreenPlayerState';

export function LearningButton() {
    const state = useAtomValue(learningAtom);
    return (
        <button
            type="button"
            className="learning-button"
            aria-pressed={state.enabled}
            onClick={() => {
                if (state.enabled) learningMode.exit();
                else {
                    learningMode.enter();
                    if (learningMode.enabled) openFullscreenPlayer();
                }
            }}
            title={state.error || '暂停原曲，以半速自然朗读歌词'}
        >
            {state.enabled ? '退出学习' : '学习模式'}
        </button>
    );
}

export default function LearningPanel() {
    const state = useAtomValue(learningAtom);
    const line = learningMode.lines[state.index];
    const language = learningLanguage(line?.lrc ?? '', learningMode.language);
    const [translation, setTranslation] = useState('');
    const [translationError, setTranslationError] = useState('');
    const [retry, setRetry] = useState(0);
    const [word, setWord] = useState('');
    const [entries, setEntries] = useState<DictionaryEntry[]>([]);
    const [lookupError, setLookupError] = useState('');
    const [lookupVersion, setLookupVersion] = useState(0);
    const [wordTranslation, setWordTranslation] = useState('');

    const supplied = hasChineseTranslation(line?.translation) ? line.translation : '';
    useEffect(() => {
        let active = true;
        setTranslation('');
        setTranslationError('');
        setWord('');
        if (line && !supplied && language !== 'zh') {
            bridge
                .translate(line.lrc, language)
                .then((result) => {
                    if (active) setTranslation(he.decode(result));
                })
                .catch((error) => {
                    if (active) setTranslationError(String(error));
                });
        }
        return () => {
            active = false;
        };
    }, [line, language, supplied, retry]);

    useEffect(() => {
        let active = true;
        setEntries([]);
        setLookupError('');
        setWordTranslation('');
        if (word && language === 'ja') {
            bridge
                .translate(word, language)
                .then((result) => {
                    if (active) setWordTranslation(he.decode(result));
                })
                .catch(() => {});
        }
        if (word)
            bridge
                .lookup(word, language)
                .then((result) => {
                    if (active) {
                        setEntries(result);
                        if (!result.length) setLookupError('本地词典未收录此词形');
                    }
                })
                .catch((error) => {
                    if (active) setLookupError(String(error));
                });
        return () => {
            active = false;
        };
    }, [word, language, lookupVersion]);

    if (!line) return <div>没有可学习的歌词</div>;
    // Windows Chromium 的 ICU 分词可识别日文词边界，保留原标点和空格。
    const Segmenter = (
        Intl as unknown as {
            Segmenter: new (
                locale: string,
                options: { granularity: string },
            ) => { segment(text: string): Iterable<{ segment: string; isWordLike: boolean }> };
        }
    ).Segmenter;
    const tokens = [...new Segmenter(language, { granularity: 'word' }).segment(line.lrc)];
    return (
        <section className="learning-panel">
            <div className="learning-toolbar">
                <LearningButton />
                <span>
                    {state.index + 1} / {learningMode.lines.length} · 0.5×
                </span>
                <label>
                    <input
                        type="checkbox"
                        checked={state.loop}
                        onChange={() => learningMode.toggleLoop()}
                    />{' '}
                    单句循环
                </label>
            </div>
            <div className="learning-sentence" lang={language}>
                {tokens.map((token, index) =>
                    token.isWordLike ? (
                        <button
                            type="button"
                            key={index}
                            onClick={() => {
                                setWord(token.segment);
                                setLookupVersion((value) => value + 1);
                                void learningMode.speakWord(token.segment, language);
                            }}
                        >
                            {token.segment}
                        </button>
                    ) : (
                        <span key={index}>{token.segment}</span>
                    ),
                )}
            </div>
            <div className="learning-translation">
                {supplied ||
                    translation ||
                    (language === 'zh' ? '' : translationError ? '翻译暂不可用' : '翻译中…')}
            </div>
            {!supplied && language !== 'zh' && (
                <small title={translationError}>
                    机翻 · MyMemory（联网，歌词会发送至该服务并在本地缓存）
                    {translationError && (
                        <button type="button" onClick={() => setRetry((value) => value + 1)}>
                            重试
                        </button>
                    )}
                </small>
            )}
            {state.error && <p role="alert">{state.error}</p>}
            {word && (
                <aside className="learning-word">
                    <strong>{word}</strong>
                    <button
                        type="button"
                        onClick={() => {
                            void learningMode.speakWord(word, language);
                        }}
                    >
                        发音
                    </button>
                    <button type="button" onClick={() => setWord('')}>
                        关闭
                    </button>
                    {lookupError && <p>{lookupError}</p>}
                    {wordTranslation && (
                        <p>
                            {wordTranslation} <small>机翻</small>
                        </p>
                    )}
                    {entries.map((entry, index) => (
                        <p key={index}>
                            {entry.phonetic && <span>/{entry.phonetic}/ </span>}
                            {entry.translation}
                        </p>
                    ))}
                    {language === 'ja' && (
                        <small>日文释义为英释 · EDRDG / EDICT2 · CC BY-SA 4.0</small>
                    )}
                    {language !== 'ja' && <small>ECDICT 本地词典</small>}
                </aside>
            )}
            <nav className="learning-navigation">
                <button
                    type="button"
                    disabled={state.index === 0}
                    onClick={() => learningMode.navigate(-1)}
                >
                    上一句
                </button>
                <button
                    type="button"
                    onClick={() =>
                        state.speaking ? learningMode.pause() : void learningMode.play()
                    }
                >
                    {state.speaking ? '暂停' : '朗读'}
                </button>
                <button
                    type="button"
                    disabled={state.index === learningMode.lines.length - 1}
                    onClick={() => learningMode.navigate(1)}
                >
                    下一句
                </button>
            </nav>
            <select
                aria-label="选择歌词句子"
                value={state.index}
                onChange={(event) => learningMode.select(Number(event.target.value))}
            >
                {learningMode.lines.map((item, index) => (
                    <option key={index} value={index}>
                        {index + 1}. {item.lrc}
                    </option>
                ))}
            </select>
        </section>
    );
}
