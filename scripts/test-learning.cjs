const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function load(file, dependencies = {}, globals = {}) {
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2021,
            esModuleInterop: true,
        },
    }).outputText;
    const exports = {};
    vm.runInNewContext(
        source,
        {
            exports,
            require: (name) => {
                if (!(name in dependencies)) throw Error(`Unexpected dependency ${name}`);
                return dependencies[name];
            },
            setTimeout,
            clearTimeout,
            console,
            ...globals,
        },
        { filename: file },
    );
    return exports;
}
const lyrics = load('src/common/learningLyrics.ts');
const line = (lrc, index, time = 0, translation) => ({ lrc, index, time, translation });
assert.equal(lyrics.learningLanguage('Good morning'), 'en');
assert.equal(lyrics.learningLanguage('おはよう'), 'ja');
assert.equal(lyrics.learningLanguage('世界', 'ja'), 'ja');
assert.equal(lyrics.learningLanguage('你好'), 'zh');
assert.equal(lyrics.hasChineseTranslation('こんにちは'), false);
assert.equal(
    lyrics.learningLines([line('Hello', 0, 1), line('你好', 1, 1)])[0].translation,
    '你好',
);
assert.equal(lyrics.learningLines([line(' ', 0)]).length, 0);

async function run() {
    let timer;
    let sourceLines = [line('Hello', 0), line('World', 1)];
    let paused = 0;
    let calls = [];
    let pending = [];
    const bridge = {
        stop: async () => {},
        speak: (text, language, rate) => {
            calls.push({ text, language, rate });
            return new Promise((resolve) => pending.push(resolve));
        },
    };
    const store = {
        get: (atom) => atom.value,
        set: (atom, value) => {
            atom.value = value;
        },
    };
    const core = load(
        'src/renderer/mainWindow/core/learningMode.ts',
        {
            jotai: { atom: (value) => ({ value }), getDefaultStore: () => store },
            '@infra/learning/renderer': bridge,
            '@common/learningLyrics': lyrics,
        },
        {
            window: { addEventListener: () => {} },
            setTimeout: (fn, ms) => {
                assert.equal(ms, 2000);
                timer = fn;
                return 1;
            },
            clearTimeout: () => {
                timer = undefined;
            },
        },
    );
    const mode = core.default;
    const state = () => store.get(core.learningAtom);
    mode.configure(() => ({ lines: sourceLines, time: 120, pause: () => paused++ }));
    mode.enter();
    assert.equal(paused, 2);
    assert.equal(state().index, 0, 'untimed lyrics start at first line');
    assert.deepEqual(calls.at(-1), { text: 'Hello', language: 'en', rate: 0.5 });
    pending.shift()();
    await new Promise(setImmediate);
    assert.equal(state().speaking, false);
    assert.equal(timer, undefined, 'no automatic sentence advancement');
    mode.navigate(1);
    assert.equal(state().index, 1);
    mode.navigate(10);
    assert.equal(state().index, 1);
    mode.navigate(-10);
    assert.equal(state().index, 0);
    mode.pause();
    pending.splice(0).forEach((resolve) => resolve());
    await new Promise(setImmediate);
    assert.equal(state().speaking, false, 'stale completion cannot resume');
    mode.toggleLoop();
    const playing = mode.play();
    pending.shift()();
    await playing;
    assert.equal(typeof timer, 'function');
    mode.pause();
    assert.equal(timer, undefined);
    const word = mode.speakWord('world', 'en');
    assert.equal(calls.at(-1).rate, 1);
    pending.shift()();
    await word;
    assert.equal(state().speaking, false);
    mode.exit();
    assert.equal(mode.enabled, false);
    sourceLines = [line('First', 0, 0), line('Second', 1, 60)];
    mode.enter();
    assert.equal(state().index, 1);
    mode.exit();
    pending.splice(0).forEach((resolve) => resolve());
    await new Promise(setImmediate);
    sourceLines = [];
    const before = calls.length;
    mode.enter();
    assert.equal(mode.enabled, false);
    assert.equal(calls.length, before);
    assert.match(state().error, /没有歌词/);
    for (const [file, query, value] of [
        ['lyric_dictionary.db', 'SELECT * FROM entries WHERE word = ? COLLATE NOCASE', 'hello'],
        ['japanese_dictionary.db', 'SELECT * FROM entries WHERE word = ?', '猫'],
    ]) {
        const db = new DatabaseSync(`res/learning/${file}`, { readOnly: true });
        assert.ok(db.prepare(query).get(value), `${file} has sample entry`);
        db.close();
    }
    console.log(
        'Learning regression checks passed: languages, translations, navigation, cancellation, loop, words, dictionaries.',
    );
}
run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
