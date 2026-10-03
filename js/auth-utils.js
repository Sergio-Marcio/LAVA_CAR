(function (global) {
    'use strict';

    const LOG_STORAGE_KEY = 'lavacar_auth_error_logs';
    const LOG_MAX_ENTRIES = 100;

    const USER_MESSAGES = {
        offline_or_network: 'Sem conexão com a internet. Verifique sua conexão e tente novamente.',
        server_error: 'Nosso servidor está temporariamente indisponível. Tente novamente em alguns instantes.',
        invalid_credentials: 'E-mail ou senha inválidos.',
        timeout: 'A solicitação demorou muito para responder. Tente novamente em alguns instantes.',
        auth_error: 'Não foi possível autenticar. Verifique seus dados e tente novamente.',
        user_disabled: 'Usuário desativado. Contate o gerente.',
        unknown: 'Ocorreu um erro inesperado ao entrar. Tente novamente mais tarde.'
    };

    function isOnline() {
        try {
            if (typeof global.navigator !== 'undefined' && typeof global.navigator.onLine === 'boolean') {
                return global.navigator.onLine;
            }
        } catch (e) {}
        return true;
    }

    function getUserAgent() {
        try {
            return (global.navigator && global.navigator.userAgent) || 'unknown';
        } catch (e) {
            return 'unknown';
        }
    }

    function classifyAuthError(err) {
        const kind = {
            kind: 'unknown',
            userMessage: USER_MESSAGES.unknown,
            shouldRetry: false,
            rawMessage: ''
        };

        if (!err) return kind;

        const msg = String(err.message || err.msg || err.statusText || '').trim();
        kind.rawMessage = msg;

        const name = String(err.name || '');
        const status = typeof err.status === 'number' ? err.status : null;
        const code = String(err.code || '');

        if (name === 'TimeoutError' || msg === '__TIMEOUT__' || code === 'TIMEOUT') {
            kind.kind = 'timeout';
            kind.userMessage = USER_MESSAGES.timeout;
            kind.shouldRetry = true;
            return kind;
        }

        if (name === 'TypeError' && /failed to fetch|networkerror|network error|load failed/i.test(msg)) {
            kind.kind = 'offline_or_network';
            kind.userMessage = USER_MESSAGES.offline_or_network;
            kind.shouldRetry = true;
            return kind;
        }

        if (msg === 'Failed to fetch' || /Failed to fetch/i.test(msg)) {
            kind.kind = 'offline_or_network';
            kind.userMessage = USER_MESSAGES.offline_or_network;
            kind.shouldRetry = true;
            return kind;
        }

        if (/Invalid login credentials|Invalid email or password/i.test(msg) || code === 'invalid_credentials') {
            kind.kind = 'invalid_credentials';
            kind.userMessage = USER_MESSAGES.invalid_credentials;
            kind.shouldRetry = false;
            return kind;
        }

        if (/user.*disabled|Account.*disabled/i.test(msg) || code === 'user_disabled') {
            kind.kind = 'user_disabled';
            kind.userMessage = USER_MESSAGES.user_disabled;
            kind.shouldRetry = false;
            return kind;
        }

        if (status && status >= 500 && status < 600) {
            kind.kind = 'server_error';
            kind.userMessage = USER_MESSAGES.server_error;
            kind.shouldRetry = true;
            return kind;
        }

        if (/503|Service Unavailable|502|Bad Gateway|504|Gateway Timeout/i.test(msg)) {
            kind.kind = 'server_error';
            kind.userMessage = USER_MESSAGES.server_error;
            kind.shouldRetry = true;
            return kind;
        }

        if (status && status >= 400 && status < 500) {
            kind.kind = 'auth_error';
            kind.userMessage = USER_MESSAGES.auth_error;
            kind.shouldRetry = false;
            return kind;
        }

        if (/Email not confirmed|Email.*confirm/i.test(msg) || code === 'email_not_confirmed') {
            kind.kind = 'auth_error';
            kind.userMessage = 'Confirme seu e-mail antes de fazer login.';
            kind.shouldRetry = false;
            return kind;
        }

        kind.kind = 'unknown';
        kind.userMessage = USER_MESSAGES.unknown;
        kind.shouldRetry = false;
        return kind;
    }

    function exponentialBackoffDelay(attempt) {
        const n = Math.max(0, Math.floor(attempt || 0));
        const base = 1000;
        return base * Math.pow(2, n);
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function withTimeout(promise, ms, signal) {
        let timerId = null;
        let timeoutReject = null;

        const timeoutPromise = new Promise(function (_resolve, reject) {
            timeoutReject = reject;
            timerId = setTimeout(function () {
                const err = new Error('Timeout after ' + ms + 'ms');
                err.name = 'TimeoutError';
                err.message = '__TIMEOUT__';
                err.status = 408;
                reject(err);
            }, ms);
        });

        function clearTimer() {
            if (timerId != null) {
                clearTimeout(timerId);
                timerId = null;
            }
        }

        let abortListener = null;
        if (signal && typeof signal.addEventListener === 'function') {
            abortListener = function () {
                clearTimer();
                const err = new Error('Aborted');
                err.name = 'AbortError';
                timeoutReject && timeoutReject(err);
            };
            signal.addEventListener('abort', abortListener, { once: true });
        }

        return Promise.race([promise, timeoutPromise]).then(
            function (value) {
                clearTimer();
                if (signal && abortListener) signal.removeEventListener('abort', abortListener);
                return value;
            },
            function (reason) {
                clearTimer();
                if (signal && abortListener) signal.removeEventListener('abort', abortListener);
                throw reason;
            }
        );
    }

    async function withRetry(fn, opts) {
        opts = opts || {};
        const maxAttempts = typeof opts.maxAttempts === 'number' ? opts.maxAttempts : 3;
        const operation = opts.operation || 'auth_operation';
        const shouldRetryFn = typeof opts.shouldRetry === 'function'
            ? opts.shouldRetry
            : function (classified) { return classified && classified.shouldRetry === true; };

        let lastError = null;
        let lastClassified = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const result = await fn(attempt, maxAttempts);
                return {
                    ok: true,
                    result: result,
                    attempt: attempt,
                    totalAttempts: maxAttempts
                };
            } catch (err) {
                lastError = err;
                lastClassified = classifyAuthError(err);
                logAuthError({
                    operation: operation,
                    kind: lastClassified.kind,
                    message: lastClassified.rawMessage || String(err && err.message || err),
                    stack: err && err.stack ? err.stack : undefined,
                    attempt: attempt,
                    totalAttempts: maxAttempts
                });

                const isLast = attempt >= maxAttempts - 1;
                if (isLast || !shouldRetryFn(lastClassified, err, attempt)) {
                    break;
                }

                const delay = exponentialBackoffDelay(attempt);
                try {
                    await sleep(delay);
                } catch (e) {}
            }
        }

        return {
            ok: false,
            error: lastError,
            classified: lastClassified,
            attempt: maxAttempts,
            totalAttempts: maxAttempts
        };
    }

    function readLogsRaw() {
        try {
            if (typeof global.localStorage === 'undefined') return [];
            const raw = global.localStorage.getItem(LOG_STORAGE_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function writeLogsRaw(arr) {
        try {
            if (typeof global.localStorage === 'undefined') return false;
            const payload = JSON.stringify(arr);
            global.localStorage.setItem(LOG_STORAGE_KEY, payload);
            return true;
        } catch (e) {
            try {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[auth-utils] Falha ao persistir log:', e);
                }
            } catch (_) {}
            return false;
        }
    }

    function logAuthError(entry) {
        try {
            const timestamp = Date.now();
            const logEntry = {
                timestamp: timestamp,
                operation: String(entry && entry.operation ? entry.operation : 'unknown'),
                kind: String(entry && entry.kind ? entry.kind : 'unknown'),
                message: String(entry && entry.message ? entry.message : ''),
                userAgent: getUserAgent(),
                online: isOnline(),
                attempt: typeof entry && entry.attempt === 'number' ? entry.attempt : 0,
                totalAttempts: typeof entry && entry.totalAttempts === 'number' ? entry.totalAttempts : 1
            };
            if (entry && entry.stack) logEntry.stack = String(entry.stack);
            if (entry && entry.extra && typeof entry.extra === 'object') logEntry.extra = entry.extra;

            const arr = readLogsRaw();
            arr.push(logEntry);

            while (arr.length > LOG_MAX_ENTRIES) {
                arr.shift();
            }

            writeLogsRaw(arr);
            return logEntry;
        } catch (e) {
            return null;
        }
    }

    function getAuthErrorLogs() {
        try {
            const arr = readLogsRaw();
            return arr.slice().sort(function (a, b) {
                return (b.timestamp || 0) - (a.timestamp || 0);
            });
        } catch (e) {
            return [];
        }
    }

    function clearAuthErrorLogs() {
        try {
            if (typeof global.localStorage !== 'undefined') {
                global.localStorage.removeItem(LOG_STORAGE_KEY);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    const api = {
        LOG_STORAGE_KEY: LOG_STORAGE_KEY,
        LOG_MAX_ENTRIES: LOG_MAX_ENTRIES,
        USER_MESSAGES: USER_MESSAGES,
        isOnline: isOnline,
        getUserAgent: getUserAgent,
        classifyAuthError: classifyAuthError,
        exponentialBackoffDelay: exponentialBackoffDelay,
        sleep: sleep,
        withTimeout: withTimeout,
        withRetry: withRetry,
        logAuthError: logAuthError,
        getAuthErrorLogs: getAuthErrorLogs,
        clearAuthErrorLogs: clearAuthErrorLogs
    };

    global.LavaCarAuthUtils = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : {})));
