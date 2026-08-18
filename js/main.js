// Initialize Application: Auth first, then Database & Initial View
window.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    initDB();
    if (typeof lucide !== 'undefined') lucide.createIcons();
});
