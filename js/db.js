// --- INDEXEDDB INITIALIZATION & SEEDING ---
async function initDB() {
    try {
        db = await idb.openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (!db.objectStoreNames.contains('clientes')) {
                    db.createObjectStore('clientes', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('veiculos')) {
                    const vStore = db.createObjectStore('veiculos', { keyPath: 'id', autoIncrement: true });
                    vStore.createIndex('placa', 'placa', { unique: true });
                }
                if (!db.objectStoreNames.contains('processos')) {
                    const pStore = db.createObjectStore('processos', { keyPath: 'id', autoIncrement: true });
                    pStore.createIndex('status', 'status');
                    pStore.createIndex('placa', 'placa');
                }
                if (!db.objectStoreNames.contains('registros_midia')) {
                    const mStore = db.createObjectStore('registros_midia', { keyPath: 'id', autoIncrement: true });
                    mStore.createIndex('processo_id', 'processo_id');
                }
                if (!db.objectStoreNames.contains('servicos')) {
                    db.createObjectStore('servicos', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('produtos')) {
                    db.createObjectStore('produtos', { keyPath: 'id', autoIncrement: true });
                }
            }
        });

        await seedDefaultServicesIfEmpty();
        await seedDefaultProductsIfEmpty();
        loadDashboardData();
    } catch (err) {
        console.error('Erro no IndexedDB:', err);
        showToast('Erro ao iniciar banco offline', 'error');
    }
}

async function seedDefaultProductsIfEmpty() {
    const count = await db.count('produtos');
    if (count === 0) {
        const tx = db.transaction('produtos', 'readwrite');
        await tx.store.add({ nome: 'Shampoo Neutro Automotivo 5L', valor: 85.00, nivel: 'CHEIO', percentual: 90, descricao: 'Detergente neutro de alto rendimento' });
        await tx.store.add({ nome: 'Cera de Carnaúba Premium 500g', valor: 65.00, nivel: 'CHEIO', percentual: 80, descricao: 'Cera de proteção e brilho intenso' });
        await tx.store.add({ nome: 'Pretinho de Pneus 5L', valor: 45.00, nivel: 'MEIO', percentual: 50, descricao: 'Brilho e proteção duradoura para pneus' });
        await tx.store.add({ nome: 'Desengraxante de Motor 5L', valor: 75.00, nivel: 'CHEIO', percentual: 100, descricao: 'Desengraxante de caixas de roda e motor' });
        await tx.store.add({ nome: 'Cheirinho / Essência Automotiva 1L', valor: 35.00, nivel: 'BAIXO', percentual: 20, descricao: 'Aroma interno para veículos' });
        await tx.store.add({ nome: 'Cristalizador de Para-brisa 500ml', valor: 40.00, nivel: 'MEIO', percentual: 45, descricao: 'Repelente de chuva' });
        await tx.done;
    }
}

async function seedDefaultServicesIfEmpty() {
    const count = await db.count('servicos');
    if (count === 0) {
        const tx = db.transaction('servicos', 'readwrite');
        // Wash Types
        await tx.store.add({ nome: 'Ducha Rápida', categoria: 'LAVAGEM', preco: 35.00, descricao: 'Lavagem externa rápida com enxágue e secagem' });
        await tx.store.add({ nome: 'Lavagem Simples', categoria: 'LAVAGEM', preco: 50.00, descricao: 'Lavagem externa com shampoo neutro e aspiração interna' });
        await tx.store.add({ nome: 'Lavagem Completa', categoria: 'LAVAGEM', preco: 80.00, descricao: 'Lavagem externa detalhada, caixas de roda, aspiração completa e pretinho' });
        await tx.store.add({ nome: 'Lavagem Executiva / Detalhada', categoria: 'LAVAGEM', preco: 130.00, descricao: 'Lavagem técnica detalhada, cera líquida, limpeza de painel e vidros' });

        // Extra Services
        await tx.store.add({ nome: 'Cera de Carnaúba / Cristalizadora', categoria: 'OUTRO', preco: 45.00, descricao: 'Aplicação manual de cera protetora de alto brilho' });
        await tx.store.add({ nome: 'Higienização de Ar-Condicionado (Ozone)', categoria: 'OUTRO', preco: 60.00, descricao: 'Ozonização para eliminação de fungos e maus odores' });
        await tx.store.add({ nome: 'Lavagem Técnica de Motor', categoria: 'OUTRO', preco: 70.00, descricao: 'Limpeza minuciosa do motor com produtos desengraxantes' });
        await tx.store.add({ nome: 'Limpeza e Hidratação de Couro', categoria: 'OUTRO', preco: 120.00, descricao: 'Higienização e hidratação profunda dos bancos de couro' });
        await tx.done;
    }
}

