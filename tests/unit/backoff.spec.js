import { describe, it, expect, beforeEach } from 'vitest';
import { loadAuthUtils } from '../setup.js';

describe('exponentialBackoffDelay', function () {
    let utils;
    beforeEach(function () {
        utils = loadAuthUtils();
    });

    it('attempt 0 retorna >= 1000ms', function () {
        expect(utils.exponentialBackoffDelay(0)).toBeGreaterThanOrEqual(1000);
    });

    it('attempt 0 = 1000 exato', function () {
        expect(utils.exponentialBackoffDelay(0)).toBe(1000);
    });

    it('attempt 1 retorna >= 2000ms (dobra)', function () {
        expect(utils.exponentialBackoffDelay(1)).toBe(2000);
    });

    it('attempt 2 retorna 4000ms', function () {
        expect(utils.exponentialBackoffDelay(2)).toBe(4000);
    });

    it('attempt 3 retorna 8000ms', function () {
        expect(utils.exponentialBackoffDelay(3)).toBe(8000);
    });

    it('lida com valores negativos/undefined como 0 (>=1000)', function () {
        expect(utils.exponentialBackoffDelay(-1)).toBeGreaterThanOrEqual(1000);
        expect(utils.exponentialBackoffDelay(undefined)).toBeGreaterThanOrEqual(1000);
    });
});
