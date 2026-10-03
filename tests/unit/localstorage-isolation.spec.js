import { describe, it, expect, beforeEach } from 'vitest';

describe('localStorage isolation between tests', function () {
    beforeEach(function () {});

    it('test A grava chave foo e confere', function () {
        localStorage.setItem('foo', 'bar');
        expect(localStorage.getItem('foo')).toBe('bar');
    });

    it('test B NÃO vê chave foo (garante isolamento beforeEach)', function () {
        expect(localStorage.getItem('foo')).toBeNull();
        localStorage.setItem('foo2', 'baz');
    });

    it('test C não vê foo2 também', function () {
        expect(localStorage.getItem('foo')).toBeNull();
        expect(localStorage.getItem('foo2')).toBeNull();
    });
});
