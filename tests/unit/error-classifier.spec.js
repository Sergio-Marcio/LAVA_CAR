import { describe, it, expect, beforeEach } from 'vitest';
import { loadAuthUtils } from '../setup.js';

describe('classifyAuthError', function () {
    let utils;
    beforeEach(function () {
        utils = loadAuthUtils();
    });

    it('classifica TypeError de fetch offline como offline_or_network', function () {
        const err = new TypeError('Failed to fetch');
        err.name = 'TypeError';
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('offline_or_network');
        expect(c.shouldRetry).toBe(true);
        expect(c.userMessage).toContain('Sem conexão');
    });

    it('classifica mensagem exata "Failed to fetch" como offline_or_network', function () {
        const err = { message: 'Failed to fetch' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('offline_or_network');
        expect(c.shouldRetry).toBe(true);
    });

    it('classifica erro HTTP 503 (status) como server_error retriável', function () {
        const err = { status: 503, message: 'Service Unavailable' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('server_error');
        expect(c.shouldRetry).toBe(true);
        expect(c.userMessage).toContain('temporariamente indisponível');
    });

    it('classifica HTTP 500 (status) como server_error retriável', function () {
        const err = { status: 500, message: 'boom' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('server_error');
        expect(c.shouldRetry).toBe(true);
    });

    it('classifica "Invalid login credentials" como invalid_credentials não retriável', function () {
        const err = { message: 'Invalid login credentials' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('invalid_credentials');
        expect(c.shouldRetry).toBe(false);
        expect(c.userMessage).toBe('E-mail ou senha inválidos.');
    });

    it('classifica erro code invalid_credentials como invalid_credentials', function () {
        const err = { message: 'ops', code: 'invalid_credentials' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('invalid_credentials');
        expect(c.shouldRetry).toBe(false);
    });

    it('classifica TimeoutError (name) como timeout retriável', function () {
        const err = new Error('Timeout after 15000ms');
        err.name = 'TimeoutError';
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('timeout');
        expect(c.shouldRetry).toBe(true);
        expect(c.userMessage).toContain('demorou muito');
    });

    it('classifica mensagem __TIMEOUT__ como timeout', function () {
        const err = { message: '__TIMEOUT__' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('timeout');
    });

    it('classifica status 401 genérico como auth_error não retriável', function () {
        const err = { status: 401, message: 'Unauthorized' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('auth_error');
        expect(c.shouldRetry).toBe(false);
    });

    it('classifica status 400 genérico como auth_error não retriável', function () {
        const err = { status: 400, message: 'Bad Request' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('auth_error');
        expect(c.shouldRetry).toBe(false);
    });

    it('classifica "user disabled" como user_disabled não retriável', function () {
        const err = { message: 'user account is disabled' };
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('user_disabled');
        expect(c.shouldRetry).toBe(false);
        expect(c.userMessage).toContain('Usuário desativado');
    });

    it('classifica erro genérico/inesperado como unknown', function () {
        const err = new Error('boom');
        const c = utils.classifyAuthError(err);
        expect(c.kind).toBe('unknown');
        expect(c.shouldRetry).toBe(false);
        expect(c.userMessage).toContain('Ocorreu um erro inesperado');
    });

    it('mensagens nunca contêm "Failed to fetch" cru (AC-1 parte)', function () {
        const erros = [
            new TypeError('Failed to fetch'),
            { message: 'Failed to fetch' },
            { status: 502, message: 'Bad Gateway' }
        ];
        for (const e of erros) {
            const c = utils.classifyAuthError(e);
            expect(c.userMessage).not.toContain('Failed to fetch');
        }
    });
});
