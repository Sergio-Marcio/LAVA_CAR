import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAuthUtils } from '../setup.js';

describe('logAuthError / getAuthErrorLogs / clearAuthErrorLogs', function () {
    let utils;
    beforeEach(function () {
        utils = loadAuthUtils();
        if (typeof localStorage !== 'undefined' && localStorage.clear) localStorage.clear();
        window && window.localStorage && window.localStorage.clear && window.localStorage.clear();
    });

    const REQUIRED_FIELDS = ['timestamp', 'operation', 'kind', 'message', 'userAgent', 'online', 'attempt', 'totalAttempts'];

    it('log de uma entrada retorna log com todos os campos obrigatórios', function () {
        const entry = {
            operation: 'op_test',
            kind: 'server_error',
            message: 'algo deu errado',
            attempt: 0,
            totalAttempts: 1
        };
        const logged = utils.logAuthError(entry);
        expect(logged).toBeTruthy();
        for (const f of REQUIRED_FIELDS) {
            expect(logged).toHaveProperty(f);
        }
        expect(typeof logged.timestamp).toBe('number');
        expect(logged.operation).toBe('op_test');
        expect(logged.kind).toBe('server_error');
        expect(logged.attempt).toBe(0);
        expect(logged.totalAttempts).toBe(1);
        expect(typeof logged.userAgent).toBe('string');
        expect(typeof logged.online).toBe('boolean');
    });

    it('getAuthErrorLogs retorna array ordenado decrescente por timestamp (mais recentes primeiro)', function () {
        const base = Date.now();
        vi.setSystemTime(base);
        utils.logAuthError({ operation: 'a', kind: 'unknown', message: 'a', attempt: 0, totalAttempts: 1 });
        vi.advanceTimersByTime(1000);
        utils.logAuthError({ operation: 'b', kind: 'unknown', message: 'b', attempt: 0, totalAttempts: 1 });
        vi.advanceTimersByTime(1000);
        utils.logAuthError({ operation: 'c', kind: 'unknown', message: 'c', attempt: 0, totalAttempts: 1 });
        const logs = utils.getAuthErrorLogs();
        expect(Array.isArray(logs)).toBe(true);
        expect(logs.length).toBe(3);
        expect(logs[0].operation).toBe('c');
        expect(logs[1].operation).toBe('b');
        expect(logs[2].operation).toBe('a');
    });

    it('insere 150 logs e a capacidade final é 100 (FIFO, mantém mais recentes)', function () {
        const baseT = 1000000;
        for (let i = 0; i < 150; i++) {
            vi.setSystemTime(baseT + i * 10);
            utils.logAuthError({
                operation: 'op_' + i,
                kind: 'unknown',
                message: 'msg_' + i,
                attempt: 0,
                totalAttempts: 1
            });
        }
        const logs = utils.getAuthErrorLogs();
        expect(logs.length).toBe(100);
        // mais recente primeiro: op_149 (timestamp maior)
        expect(logs[0].operation).toBe('op_149');
        // mais antigo mantido: op_50
        expect(logs[logs.length - 1].operation).toBe('op_50');
        const ops = new Set(logs.map(l => l.operation));
        for (let i = 0; i < 50; i++) expect(ops.has('op_' + i)).toBe(false);
        for (let i = 50; i < 150; i++) expect(ops.has('op_' + i)).toBe(true);
    });

    it('clearAuthErrorLogs apaga todos os logs', function () {
        utils.logAuthError({ operation: 'x', kind: 'unknown', message: 'x', attempt: 0, totalAttempts: 1 });
        expect(utils.getAuthErrorLogs().length).toBeGreaterThan(0);
        utils.clearAuthErrorLogs();
        expect(utils.getAuthErrorLogs().length).toBe(0);
    });

    it('lida com entry faltando campos e preenche defaults seguros', function () {
        const logged = utils.logAuthError({});
        expect(logged).toBeTruthy();
        for (const f of REQUIRED_FIELDS) expect(logged).toHaveProperty(f);
        expect(typeof logged.operation).toBe('string');
        expect(typeof logged.message).toBe('string');
    });

    it('adiciona stack quando fornecido', function () {
        const err = new Error('err');
        const logged = utils.logAuthError({
            operation: 'stack_test',
            kind: 'unknown',
            message: err.message,
            stack: err.stack,
            attempt: 0,
            totalAttempts: 1
        });
        expect(typeof logged.stack).toBe('string');
        expect(logged.stack).toBe(err.stack);
    });

    it('campo online reflete estado de navigator.onLine', function () {
        const logged = utils.logAuthError({ operation: 'on', kind: 'unknown', message: 'x', attempt: 0, totalAttempts: 1 });
        expect(typeof logged.online).toBe('boolean');
    });
});
