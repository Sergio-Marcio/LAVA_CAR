// Initialize Application: Auth first, then Database & Initial View
window.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    await initDB();
    if (typeof iniciarSincroniaAutomatica === 'function') iniciarSincroniaAutomatica();
    if (typeof loadAgenda === 'function') loadAgenda();
    if (typeof executarSync === 'function' && navigator.onLine) {
        executarSync();
    } else if (typeof autoPullFromCloud === 'function' && navigator.onLine) {
        autoPullFromCloud();
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
});
