import { app, ipcMain, net } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import windowManager from '@main/core/windowManager';
import { CHANNEL, WORD_CHANNEL, type Language } from './common';

export function setupLearning() {
    let speech: ChildProcess | undefined;
    const dictionaries = new Map<string, Database.Database>();
    const cachePath = path.join(app.getPath('userData'), 'learning-translations.json');
    const cache: Record<string, string> = Object.create(null);
    try {
        const saved = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            for (const [key, value] of Object.entries(saved).slice(-5000)) {
                if (typeof value === 'string') cache[key] = value;
            }
        }
    } catch {
        /* 首次运行 */
    }
    const stop = () => {
        speech?.kill();
        speech = undefined;
    };
    app.on('before-quit', () => {
        stop();
        for (const db of dictionaries.values()) db.close();
        dictionaries.clear();
    });
    ipcMain.handle(
        CHANNEL,
        async (
            event,
            action: string,
            input?: {
                text: string;
                language: Language;
                rate?: number;
                words?: string[];
                requestId?: number;
            },
        ) => {
            if (
                event.sender !== windowManager.__getWindowUnsafe('main')?.webContents ||
                event.senderFrame !== event.sender.mainFrame
            )
                throw new Error('无效来源');
            if (action === 'stop') {
                stop();
                return;
            }
            const text = typeof input?.text === 'string' ? input.text.trim() : '';
            const language = input?.language;
            if (!text || text.length > 2000 || !['en', 'ja', 'zh'].includes(language))
                throw new Error('无效文本或语言');
            if (action === 'speak' || action === 'speakWords') {
                const words = action === 'speakWords' ? input.words : undefined;
                if (
                    action === 'speakWords' &&
                    (!Array.isArray(words) ||
                        !words.length ||
                        words.length > 500 ||
                        words.some(
                            (word) =>
                                typeof word !== 'string' || !word.trim() || word.length > 2000,
                        ) ||
                        words.join(' ').length > 2000 ||
                        !Number.isSafeInteger(input.requestId))
                )
                    throw new Error('无效逐词朗读请求');
                stop();
                if (process.platform !== 'win32') throw new Error('此版本的学习朗读需要 Windows');
                const rate = input.rate === 0.5 ? 0.5 : 1;
                await new Promise<void>((resolve, reject) => {
                    const child = spawn(
                        path.join(
                            process.env.SystemRoot || 'C:\\Windows',
                            'System32/WindowsPowerShell/v1.0/powershell.exe',
                        ),
                        [
                            '-NoProfile',
                            '-NonInteractive',
                            '-ExecutionPolicy',
                            'Bypass',
                            '-File',
                            path.join(globalContext.appPath.res, 'learning/speak.ps1'),
                        ],
                        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
                    );
                    speech = child;
                    let output = '';
                    child.stdout.on('data', (data) => {
                        output += data.toString('utf8');
                        const messages = output.split('\n');
                        output = messages.pop()!.slice(-1000);
                        for (const message of messages) {
                            try {
                                const progress = JSON.parse(message);
                                if (
                                    words &&
                                    speech === child &&
                                    !event.sender.isDestroyed() &&
                                    Number.isInteger(progress.index) &&
                                    progress.index >= 0 &&
                                    progress.index < words.length
                                )
                                    event.sender.send(WORD_CHANNEL, {
                                        requestId: input.requestId,
                                        index: progress.index,
                                    });
                            } catch {
                                /* 忽略非进度输出 */
                            }
                        }
                    });
                    let error = '';
                    let timedOut = false;
                    const timeout = setTimeout(() => {
                        timedOut = true;
                        child.kill();
                    }, 180000);
                    child.stderr.on('data', (data) => {
                        error = (error + data.toString('utf8')).slice(-4000);
                    });
                    child.once('error', reject);
                    child.once('close', (code) => {
                        clearTimeout(timeout);
                        if (speech === child) speech = undefined;
                        if (timedOut) reject(new Error('朗读超时，请重试'));
                        else if (code === 0 || code === null) resolve();
                        else if (error.includes('Missing Windows voice'))
                            reject(
                                new Error(
                                    `请在 Windows 设置 → 时间和语言 → 语音中安装${language === 'ja' ? '日文' : language === 'en' ? '英文' : '中文'}语音包`,
                                ),
                            );
                        else reject(new Error(error || '朗读失败，请安装对应 Windows 语音包'));
                    });
                    child.stdin.on('error', () => {});
                    child.stdin.end(JSON.stringify({ text, language, rate, words }));
                });
                return;
            }
            if (action === 'lookup') {
                if (text.length > 120) return [];
                const key = language === 'ja' ? 'japanese_dictionary.db' : 'lyric_dictionary.db';
                if (!dictionaries.has(key))
                    dictionaries.set(
                        key,
                        new Database(path.join(globalContext.appPath.res, 'learning', key), {
                            readonly: true,
                            fileMustExist: true,
                        }),
                    );
                const db = dictionaries.get(key)!;
                return language === 'ja'
                    ? db
                          .prepare(
                              'SELECT word, reading AS phonetic, definition AS translation FROM entries WHERE word = ? OR reading = ? LIMIT 8',
                          )
                          .all(text, text)
                    : db
                          .prepare(
                              'SELECT word, phonetic, translation FROM entries WHERE word = ? COLLATE NOCASE LIMIT 8',
                          )
                          .all(text);
            }
            if (action !== 'translate') throw new Error('无效操作');
            if (language === 'zh') return text;
            const key = `${language}:${text}`;
            if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
            if (Buffer.byteLength(text, 'utf8') > 500)
                throw new Error('本句过长，免费翻译最多支持 500 字节');
            const response = await net.fetch(
                `https://api.mymemory.translated.net/get?${new URLSearchParams({ q: text, langpair: `${language}|zh-CN` })}`,
                { signal: AbortSignal.timeout(15000) },
            );
            const data = (await response.json()) as {
                responseStatus: number;
                responseDetails?: string;
                responseData?: { translatedText?: string };
            };
            if (
                !response.ok ||
                Number(data.responseStatus) !== 200 ||
                !data.responseData?.translatedText
            )
                throw new Error(data.responseDetails || '机翻暂不可用，请稍后重试');
            cache[key] = data.responseData.translatedText;
            const keys = Object.keys(cache);
            if (keys.length > 5000) delete cache[keys[0]];
            try {
                fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
            } catch {
                /* 缓存失败不阻塞 */
            }
            return cache[key];
        },
    );
}
