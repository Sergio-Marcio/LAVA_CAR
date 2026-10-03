import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAuthUtils } from '../setup.js';

describe('withTimeout', function () {
    let utils;
    beforeEach(function () {
        utils = loadAuthUtils();
    });

    it('resolve normalmente se a promise resolver antes do timeout', async function () {
        const p = Promise.resolve('ok');
        const result = await utils.withTimeout(p, 5000);
        expect(result).toBe('ok');
    });

    it('rejeita com erro de timeout se a promise não resolver a tempo', async function () {
        const p = new Promise(function () {});
        const resultPromise = utils.withTimeout(p, 100);
        vi.advanceTimersByTime(500);
        const threw = await resultPromise.catch(e => e);
        expect(threw).toBeTruthy();
        expect(threw.name === 'TimeoutError' || threw.message === '__TIMEOUT__').toBe(true);
        const classified = utils.classifyAuthError(threw);
        expect(classified.kind).toBe('timeout');
    });

    it('rejeita normalmente (sem transformar em timeout) se promise já rejeitar cedo', async function () {
        const p = Promise.reject(new Error('boom'));
        const threw = await utils.withTimeout(p, 5000).catch(e => e);
        expect(threw.message).toBe('boom');
        expect(threw.name).not.toBe('TimeoutError');
    });

    it('respeita AbortSignal para abortar antes do tempo', async function () {
        const controller = new AbortController();
        const p = new Promise(function () {});
        const resultPromise = utils.withTimeout(p, 10000, controller.signal);
        controller.abort();
        const threw = await resultPromise.catch(e => e);
        expect(threw.name === 'AbortError' || threw.message === 'Aborted').toBe(true);
    });
});
