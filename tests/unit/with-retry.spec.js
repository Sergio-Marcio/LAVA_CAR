import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAuthUtils } from '../setup.js';

describe('withRetry', function () {
    let utils;
    beforeEach(function () {
        utils = loadAuthUtils();
        window && window.localStorage && window.localStorage.clear && window.localStorage.clear();
        localStorage && localStorage.clear && localStorage.clear();
    });

    it('sucesso na 1ª tentativa: 1 invocação, ok=true', async function () {
        let calls = 0;
        const fn = async function () { calls++; return { data: 1 }; };
        const res = await utils.withRetry(fn, { operation: 'test_success', maxAttempts: 3 });
        expect(res.ok).toBe(true);
        expect(calls).toBe(1);
        expect(res.result).toEqual({ data: 1 });
    });

    it('2 falhas retriáveis depois sucesso: 3 invocações, ok=true', async function () {
        let calls = 0;
        const fn = async function () {
            calls++;
            if (calls < 3) {
                const err = new TypeError('Failed to fetch');
                err.name = 'TypeError';
                throw err;
            }
            return { data: 'ok' };
        };
        const promise = utils.withRetry(fn, { operation: 'test_retry_success', maxAttempts: 3 });
        await vi.runAllTimersAsync();
        const res = await promise;
        expect(res.ok).toBe(true);
        expect(calls).toBe(3);
    });

    it('erro não-retriável (invalid_credentials) para após 1 tentativa', async function () {
        let calls = 0;
        const fn = async function () {
            calls++;
            throw new Error('Invalid login credentials');
        };
        const res = await utils.withRetry(fn, { operation: 'test_no_retry', maxAttempts: 3 });
        expect(res.ok).toBe(false);
        expect(calls).toBe(1);
        expect(res.classified.kind).toBe('invalid_credentials');
        expect(res.classified.shouldRetry).toBe(false);
    });

    it('3 falhas retriáveis: retorna ok=false com última classificação', async function () {
        let calls = 0;
        const fn = async function () {
            calls++;
            const err = new Error('Failed to fetch');
            err.name = 'TypeError';
            err.message = 'Failed to fetch';
            throw err;
        };
        const promise = utils.withRetry(fn, { operation: 'test_all_fail', maxAttempts: 3 });
        await vi.runAllTimersAsync();
        const res = await promise;
        expect(res.ok).toBe(false);
        expect(calls).toBe(3);
        expect(res.classified.kind).toBe('offline_or_network');
        expect(res.totalAttempts).toBe(3);
    });

    it('logs de erro são gravados em localStorage para cada falha', async function () {
        const fn = async function () {
            const err = new Error('Service Unavailable');
            err.status = 503;
            throw err;
        };
        const promise = utils.withRetry(fn, { operation: 'test_logs', maxAttempts: 3 });
        await vi.runAllTimersAsync();
        await promise;
        const logs = utils.getAuthErrorLogs();
        expect(logs.length).toBeGreaterThanOrEqual(3);
        expect(logs.every(l => l.operation === 'test_logs')).toBe(true);
    });
});
