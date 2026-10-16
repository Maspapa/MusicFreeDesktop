// 仅连接用独立临时 profile 启动的测试程序，不操作真实用户资料。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

(async () => {
    const pages = await (await fetch('http://127.0.0.1:9333/json/list')).json();
    const page = pages.find((p) => p.url.includes('main_window'));
    assert.ok(page, 'test app main window exists');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (pending.has(data.id)) {
            const { resolve, reject, timeout } = pending.get(data.id);
            clearTimeout(timeout);
            pending.delete(data.id);
            if (data.error) reject(Error(JSON.stringify(data.error)));
            else resolve(data.result);
        }
    };
    const command = (method, params) =>
        new Promise((resolve, reject) => {
            const request = ++id;
            const timeout = setTimeout(() => reject(Error(`${method} timeout`)), 25000);
            pending.set(request, { resolve, reject, timeout });
            ws.send(JSON.stringify({ id: request, method, params }));
        });
    const evaluate = async (expression) => {
        const result = await command('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    try {
        const userData = await evaluate('globalContext.appPath.userData');
        assert.equal(
            path.resolve(userData).toLowerCase(),
            path.join(os.tmpdir(), 'musicfree-desktop-learning-smoke').toLowerCase(),
            'refuse to modify a real profile',
        );
        assert.ok((await evaluate("learningBridge.lookup('hello','en')")).length);
        assert.ok((await evaluate("learningBridge.lookup('猫','ja')")).length);
        const fixture = {
            id: 'learning-smoke',
            platform: '本地',
            title: 'Learning smoke test',
            url: 'file:///nonexistent/learning-smoke.wav',
            rawLrc: '[00:00.00]Hello world\n[00:00.00]你好世界\n[00:05.00]Good morning\n[00:05.00]早上好',
        };
        await evaluate(
            `localStorage.setItem('player.currentMusic',${JSON.stringify(JSON.stringify(fixture))});location.reload()`,
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await evaluate("document.querySelector('.l-player-bar__cover').click()");
        await evaluate("document.querySelector('.learning-button').click()");
        assert.equal(
            await evaluate("document.querySelector('.learning-reading-style') === null"),
            true,
        );
        assert.ok(
            await evaluate(
                "document.querySelector('.learning-toolbar').textContent.includes('逐词跟读')",
            ),
        );
        let highlighted = false;
        for (let attempt = 0; attempt < 50; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            highlighted = await evaluate(
                "!!document.querySelector('.learning-sentence button.is-speaking')",
            );
            if (highlighted) break;
        }
        assert.equal(highlighted, true, 'native word progress reaches highlighted UI');
        const wordScreenshot = await command('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync('out/learning-word-smoke.png', Buffer.from(wordScreenshot.data, 'base64'));
        await evaluate(
            "[...document.querySelectorAll('.learning-navigation button')].find(b=>b.textContent==='暂停')?.click();learningBridge.stop()",
        );
        assert.equal(
            await evaluate(
                "document.querySelector('.learning-sentence button.is-speaking') === null",
            ),
            true,
        );
        assert.equal(
            await evaluate("document.querySelector('.learning-sentence')?.textContent"),
            'Hello world',
        );
        assert.equal(
            await evaluate("document.querySelector('.learning-translation')?.textContent"),
            '你好世界',
        );
        await evaluate(
            "[...document.querySelectorAll('.learning-navigation button')].find(b=>b.textContent==='下一句').click()",
        );
        await evaluate('learningBridge.stop()');
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
            await evaluate("document.querySelector('.learning-sentence')?.textContent"),
            'Good morning',
        );
        const screenshot = await command('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync('out/learning-smoke.png', Buffer.from(screenshot.data, 'base64'));
        console.log(
            'Desktop smoke passed: startup, IPC dictionaries, word-only learning, native progress/highlight, pause, Chinese translation, next sentence.',
        );
    } finally {
        ws.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
