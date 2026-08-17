-- Tabela de Clientes
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(100),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de Veículos
CREATE TABLE veiculos (
    id SERIAL PRIMARY KEY,
    placa VARCHAR(20) UNIQUE NOT NULL,
    marca VARCHAR(50),
    modelo VARCHAR(50),
    cor VARCHAR(30),
    cliente_id INTEGER REFERENCES clientes(id),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de Serviços e Tabela de Tipos de Lavagem
CREATE TABLE servicos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(20) NOT NULL, -- 'LAVAGEM' ou 'OUTRO'
    preco DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    descricao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de Produtos e Nível de Estoque
CREATE TABLE produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    valor DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    nivel VARCHAR(20) NOT NULL DEFAULT 'CHEIO', -- 'CHEIO' (Green 100%), 'MEIO' (Yellow 50%), 'BAIXO' (Red 20%)
    percentual INT NOT NULL DEFAULT 100,
    descricao TEXT,
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de Processos / Ordens de Serviço (Entrada, Saída e Estorno)
CREATE TABLE processos (
    id SERIAL PRIMARY KEY,
    veiculo_id INTEGER REFERENCES veiculos(id),
    cliente_id INTEGER REFERENCES clientes(id),
    data_entrada TIMESTAMP DEFAULT NOW(),
    data_saida TIMESTAMP,
    status VARCHAR(20) DEFAULT 'EM_ANDAMENTO', -- 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO' / 'ESTORNADO'
    lavagem_id INTEGER REFERENCES servicos(id),
    valor_lavagem DECIMAL(10, 2) DEFAULT 0.00,
    valor_adicionais DECIMAL(10, 2) DEFAULT 0.00,
    valor_total DECIMAL(10, 2) DEFAULT 0.00,
    forma_pagamento VARCHAR(30), -- 'PIX', 'DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO'
    observacoes TEXT,
    hash_integridade VARCHAR(64),
    -- Campos de Estorno / Cancelamento
    data_estorno TIMESTAMP,
    motivo_estorno TEXT,
    valor_estornado DECIMAL(10, 2) DEFAULT 0.00,
    synced BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de Serviços Adicionais vinculados ao Processo
CREATE TABLE processo_servicos (
    id SERIAL PRIMARY KEY,
    processo_id INTEGER REFERENCES processos(id),
    servico_id INTEGER REFERENCES servicos(id),
    preco_aplicado DECIMAL(10, 2) NOT NULL,
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Registros de Mídia (Fotos e Vídeos)
CREATE TABLE registros_midia (
    id SERIAL PRIMARY KEY,
    processo_id INTEGER REFERENCES processos(id),
    tipo VARCHAR(10) NOT NULL, -- 'FOTO', 'VIDEO'
    caminho_arquivo VARCHAR(255) NOT NULL, -- URL segura S3 / Storage
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Achados Internos / Checklist de Inspeção
CREATE TABLE achados_internos (
    id SERIAL PRIMARY KEY,
    processo_id INTEGER REFERENCES processos(id),
    descricao TEXT NOT NULL,
    categoria VARCHAR(50),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- ========================================================
-- DADOS INICIAIS (SEED DATA): TIPOS DE LAVAGENS, PREÇOS E PRODUTOS
-- ========================================================

-- Tipos de Lavagem
INSERT INTO servicos (nome, categoria, preco, descricao) VALUES
('Ducha Rápida', 'LAVAGEM', 35.00, 'Lavagem externa rápida com enxágue e secagem'),
('Lavagem Simples', 'LAVAGEM', 50.00, 'Lavagem externa com shampoo neutro e aspiração interna simples'),
('Lavagem Completa', 'LAVAGEM', 80.00, 'Lavagem externa detalhada, caixas de roda, aspiração completa e pretinho'),
('Lavagem Executiva / Detalhada', 'LAVAGEM', 130.00, 'Lavagem técnica detalhada, cera líquida, limpeza de painel e vidros');

-- Outros Serviços e Preços
INSERT INTO servicos (nome, categoria, preco, descricao) VALUES
('Cera de Carnaúba / Cristalizadora', 'OUTRO', 45.00, 'Aplicação manual de cera protetora de alto brilho'),
('Higienização de Ar-Condicionado (Ozone)', 'OUTRO', 60.00, 'Ozonização para eliminação de fungos, bactérias e maus odores'),
('Lavagem Técnica de Motor', 'OUTRO', 70.00, 'Limpeza minuciosa do motor com produtos desengraxantes e verniz elétrico'),
('Limpeza e Hidratação de Couro', 'OUTRO', 120.00, 'Higienização profunda dos bancos de couro com hidratante específico'),
('Cristalização de Para-brisa', 'OUTRO', 40.00, 'Repelente de água para chuva nos vidros dianteiros');

-- Produtos e Controle de Nível
INSERT INTO produtos (nome, valor, nivel, percentual, descricao) VALUES
('Shampoo Neutro Automotivo 5L', 85.00, 'CHEIO', 90, 'Detergente neutro de alto rendimento para lavagem geral'),
('Cera de Carnaúba Premium 500g', 65.00, 'CHEIO', 80, 'Cera de proteção e brilho intenso'),
('Pretinho de Pneus 5L', 45.00, 'MEIO', 50, 'Brilho e proteção duradoura para pneus'),
('Desengraxante de Motor 5L', 75.00, 'CHEIO', 100, 'Desengraxante para caixas de roda e motores'),
('Cheirinho / Essência Automotiva 1L', 35.00, 'BAIXO', 20, 'Aroma interno para veículos'),
('Cristalizador de Para-brisa 500ml', 40.00, 'MEIO', 45, 'Repelente de chuva para vidros');