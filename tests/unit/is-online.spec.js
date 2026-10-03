import { describe, it, expect, beforeEach } from 'vitest';
import { loadAuthUtils } from '../setup.js';

describe('isOnline', function () {
    let utils;
    beforeEach(function () {
        utils = loadAuthUtils();
    });

    it('retorna boolean em condições normais', function () {
        const r = utils.isOnline();
        expect(typeof r).toBe('boolean');
    });

    it('quando navigator.onLine = true, retorna true', function () {
        const original = typeof navigator !== 'undefined' ? navigator.onLine : undefined;
        try {
            Object.defineProperty(navigator, 'onLine', { configurable: true, writable: true, value: true });
            expect(utils.isOnline()).toBe(true);
        } finally {
            if (original !== undefined) {
                Object.defineProperty(navigator, 'onLine', { configurable: true, writable: true, value: original });
            }
        }
    });

    it('quando navigator.onLine = false, retorna false', function () {
        const original = typeof navigator !== 'undefined' ? navigator.onLine : undefined;
        try {
            Object.defineProperty(navigator, 'onLine', { configurable: true, writable: true, value: false });
            expect(utils.isOnline()).toBe(false);
        } finally {
            if (original !== undefined) {
                Object.defineProperty(navigator, 'onLine', { configurable: true, writable: true, value: original });
            }
        }
    });
});
