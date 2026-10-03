Especificação Técnica e Arquitetura de Software: Plataforma Multiplataforma de Gestão Operacional para Lava-Jato e Estética Automotiva

1. Visão Geral, Contexto de Mercado e Estratégia Arquitetural Multiplataforma

O mercado de embelezamento e manutenção veicular atravessa uma transformação estrutural marcante, migrando do modelo tradicional de lava-jatos de pátio focado em alta rotatividade para centros avançados de detalhamento automotivo (auto detailing), aplicação de revestimentos cerâmicos (vitrificação) e películas de proteção de pintura (paint protection film - PPF). Essa transição eleva consideravelmente o ticket médio e exige um tempo de permanência veicular prolongado, transformando a dinâmica operacional do setor. Para sustentar essa complexidade, os estabelecimentos demandam ecossistemas de software modernos e integrados que substituam anotações informais por fluxos automatizados em tempo real. A arquitetura de software para esse segmento deve oferecer suporte a operações intensivas sob condições adversas de pátio, garantindo thread principal não-bloqueante com I/O assíncrono, rastreabilidade de serviços e blindagem financeira e jurídica.

1.1. Análise Comparativa e Benchmarking de Mercado

O ecossistema de soluções tecnológicas para o segmento automotivo divide-se entre sistemas voltados ao fluxo de caixa rápido e recepção agilizada de pátio e plataformas focadas na gestão de estúdios de detalhamento de alto ticket. A tabela a seguir sintetiza os principais benchmarks nacionais e internacionais, com precificação padronizada nas moedas de origem (BRL para soluções nacionais e USD para internacionais):

Sistema	Plataforma / Arquitetura	Funcionalidades Principais	Modelo de Cobrança	Diferencial Operacional
SisJato	PWA (Web, Android, iOS)	Check-in/out rápido, DRE gerencial, emissão fiscal (NFC-e), gestão de conveniência e estacionamento.	Assinatura mensal a partir de R$ 45,00.	Painel unificado para multi-filiais e arquitetura PWA de leveza operacional.
Lava Jato Pro	Android Nativo	Ordem de serviço com QR Code, módulo de estofados, impressão Bluetooth ESC/POS.	Assinatura fixa por estabelecimento sem limite de dispositivos.	Operação focada no uso em múltiplos tablets e smartphones Android.
Lavatech	Web e Mobile	Catálogo online no WhatsApp, orçamentos em PDF, agendamento autônomo, cockpit operacional.	Planos mensais a partir de R$ 19,00.	Conversão direta do atendimento via WhatsApp em agendamentos confirmados.
Lava já!	Web e Mobile	Reconhecimento de placas via IA, checklist digital de avarias, assistente Lavi, cashback nativo.	Teste gratuito de 7 dias e planos recorrentes.	Reconhecimento automático de placas por visão computacional e motor de cashback.
Jump Car	Android e Terminais Smart POS	Operação offline, regime de contas segregado, remarketing pós-venda, integração POS.	Planos a partir de R$ 49,00/mês.	Execução nativa em máquinas de cartão (Smart POS) sem dependência contínua de internet.
VeltaCar	Nuvem / Web Mobile	CRM e ERP completo, emissão de NFS-e em +4.000 municípios, checklist fotográfico, autoatendimento.	Assinatura mensal sem fidelidade.	Cobertura fiscal abrangente e gestão de processos para empresas de médio e grande porte.
Mobile Tech RX	iOS, Android, Web	Inspeção visual por painel do veículo, escaneamento de VIN, estimador para detalhamento e funilaria.	US 39, US 99 e US 199/mês por admin (+US 15 a US$ 29 por usuário adicional).	Estimador visual de avarias altamente preciso para serviços de estética e reparo rápido.
Urable	iOS, Android, Web	Rastreabilidade de lotes de vitrificadores, gestão de garantias, agendamento por recurso e box.	Assinatura mensal por faixas: Express (US 70), Pro (US 110) e Enterprise (US$ 183/mês).	Especialização em estúdios de detalhamento avançado e aplicação de revestimentos cerâmicos.
DetailPro	iOS, Android, Web	Agendamento online, orçamentação dinâmica, gerenciamento de equipe e checklists.	Assinatura mensal com teste gratuito de 14 dias.	Automação de processos operacionais para estúdios de estética automotiva.
BookCrew	Web Mobile / Cloud	Agendamento 24/7, assistente de IA para chamadas, retenção de depósitos, lembretes por SMS/E-mail.	Planos fixos de US 49 (Basic), US 99 (Pro) e US$ 199/mês (Growth) sem taxa por assento.	Prevenção de no-shows com depósitos configuráveis e assistente virtual autônomo.
Menutize	Web / Cloud CRM	Envio de orçamentos em camadas (Good/Better/Best), cobrança recorrente, acompanhamento de visualizações.	Valor fixo de US 29/mês por 1 assento (membros adicionais por US 15/assento).	Orçamentação multinível e acompanhamento em tempo real da abertura de propostas.

A mudança do perfil operacional — da alta rotatividade para serviços de detalhamento de alto ticket — altera profundamente os requisitos do software. Em operações de volume, o foco do sistema reside em maximizar a velocidade de entrada para evitar a formação de filas no pátio. Já nos serviços de detalhamento, onde os veículos permanecem por dias e os orçamentos superam milhares de reais, a prioridade passa a ser a mitigação de riscos jurídicos por meio do registro minucioso de danos pré-existentes, o vínculo com número de chassi/VIN, a retenção de sinal/depósito de garantia para evitar o absenteísmo (no-show) e o controle rígido do tempo de execução por etapa.

1.2. Estratégia de Desenvolvimento Multiplataforma e Stack Tecnológica

Para atender com eficiência às particularidades do pátio, a plataforma adota uma abordagem de engenharia dividida por função operacional e restrições físicas de ambiente:

* Dispositivos Móveis de Pátio (Smartphones, Tablets e Smart POS): Desenvolvidos em Flutter ou React Native, cobrindo iOS, Android e terminais Android dedicados. A interface adota obrigatoriamente um tema escuro (Dark Mode) nativo configurado para atender à razão de contraste WCAG AAA (mínimo 7:1) com alvos de toque expandidos (mínimo de 48 \times 48 \text{ dp}), garantindo legibilidade sob iluminação solar direta de 100.000 lux e operação por técnicos utilizando luvas de proteção de nitrilo/borracha. O hardware móvel especificado para o pátio exige grau de proteção mínimo IP67 (resistência total à poeira e imersão temporária em água) e capas emborrachadas reforçadas contra quedas acidentais no piso de concreto.
* Estações Administrativas e Cockpit de Gestão (PC Desktop / Web): Construídas em PWA (Progressive Web App) ou empacotadas via Electron para ambiente desktop. Essa camada foca no processamento intensivo de dados, permitindo a gestão financeira detalhada, emissão de notas fiscais, controle de estoque de insumos químicos e parametrização do sistema.

1.3. Padrão Arquitetural Offline-First e Sincronização Assíncrona

Considerando que pátios, galpões e estufas de cura frequentemente possuem zonas de sombra de sinal celular e cobertura Wi-Fi instável, a aplicação móvel é projetada estritamente sob o padrão Offline-First.

Toda leitura e gravação de dados ocorre primariamente em um banco de dados local SQLite, encapsulado por abstrações reativas de alta velocidade como WatermelonDB (no ecossistema React Native) ou Isar/Hive (no ecossistema Flutter). A seguir, apresenta-se o esquema DDL SQL de persistência local para a fila de mutações assíncronas e para o registro das vistorias veiculares:

-- Tabela de Fila de Sincronização Local (Mutation Queue)
CREATE TABLE sync_queue (
    id TEXT PRIMARY KEY NOT NULL, -- UUIDv4 gerado na ponta móvel
    table_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    payload TEXT NOT NULL, -- JSON contendo a mutação
    timestamp INTEGER NOT NULL, -- Unix epoch timestamp em milissegundos
    synced_at INTEGER NULL, -- Null se pendente; timestamp se sincronizado
    retry_count INTEGER DEFAULT 0,
    error_log TEXT NULL
);

CREATE INDEX idx_sync_queue_synced_at ON sync_queue(synced_at);
CREATE INDEX idx_sync_queue_timestamp ON sync_queue(timestamp);

-- Tabela de Vistorias Veiculares Locais
CREATE TABLE vehicle_inspections (
    uuid TEXT PRIMARY KEY NOT NULL, -- UUIDv4
    vehicle_plate TEXT NOT NULL,
    vin_number TEXT NULL,
    inspector_id TEXT NOT NULL,
    vector_damages_json TEXT NOT NULL, -- Taxonomia e coordenadas no Canvas
    signature_base64 TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    synced_status INTEGER DEFAULT 0 -- 0: Pendente, 1: Sincronizado
);

CREATE INDEX idx_inspections_plate ON vehicle_inspections(vehicle_plate);
CREATE INDEX idx_inspections_synced ON vehicle_inspections(synced_status);


┌────────────────────────────────────────────────────────┐
│               DISPOSITIVO MÓVEL (PÁTIO)                 │
│ ┌────────────────────────────────────────────────────┐ │
│ │             Interface de Usuário (60 FPS)          │ │
│ └─────────────────────────┬──────────────────────────┘ │
│                           │ (Thread de I/O Assíncrono) │
│                           ▼                            │
│ ┌────────────────────────────────────────────────────┐ │
│ │        BD Local SQLite (WatermelonDB / Isar)       │ │
│ └─────────────────────────┬──────────────────────────┘ │
│                           │ (Gravação ACID local)      │
│                           ▼                            │
│ ┌────────────────────────────────────────────────────┐ │
│ │  Sync Queue Local (UUIDv4 + Unix Epoch Timestamp)  │ │
│ └─────────────────────────┬──────────────────────────┘ │
└───────────────────────────┼────────────────────────────┘
                            │
               (Conectividade Restabelecida)
                            │
                            ▼ [WebSockets / HTTPS REST]
┌────────────────────────────────────────────────────────┐
│                   SERVIDOR BACKEND NUVEM               │
│ ┌────────────────────────────────────────────────────┐ │
│ │  Motor de Sincronização & Resolução Conflitos (LWW) │ │
│ └─────────────────────────┬──────────────────────────┘ │
│                           ▼                            │
│ ┌────────────────────────────────────────────────────┐ │
│ │         PostgreSQL (Persistência Global / CQRS)    │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘


A sincronização de dados com a nuvem ocorre por meio de uma fila de mutações assíncronas (Sync Queue). Cada alteração gerada localmente recebe um identificador único universal (UUIDv4) e um timestamp de precisão. Quando a conectividade à internet é restabelecida, os pacotes da fila são transmitidos ao servidor backend via WebSockets ou requisições HTTPS. Os conflitos decorrentes de alterações simultâneas no mesmo veículo são resolvidos aplicando a regra Last-Write-Wins (LWW) ou através de dados replicados sem conflito (Conflict-Free Replicated Data Types - CRDTs), preservando a integridade das informações globais.

Com a resiliência arquitetural do aplicativo móvel devidamente assegurada no pátio, cria-se a infraestrutura local necessária para executar algoritmos de inteligência artificial diretamente no dispositivo.

2. Módulo de Visão Computacional na Borda (Edge AI) para Reconhecimento de Placas

A fase de check-in representa o principal gargalo de atendimento em um lava-jato. A digitação manual de caracteres pelos operadores não apenas retarda a recepção e gera filas na entrada, mas também insere erros de cadastro que prejudicam o histórico veicular e a comunicação pós-venda. A integração de um módulo de reconhecimento automático de placas (Automatic License Plate Recognition - ALPR) operando via inteligência artificial na borda (edge computing) elimina a entrada manual de dados, reduz o tempo de triagem para poucos segundos e valida instantaneamente o veículo.

2.1. Arquitetura do Modelo de Detecção Local (YOLOv8n Otimizado)

O modelo de detecção veicular e localização de placas baseia-se na arquitetura YOLOv8 Nano (YOLOv8n) otimizada e convertida para execução local via ONNX Runtime, garantindo compatibilidade direta e processamento de baixo consumo em chips móveis.

Para viabilizar a execução em hardware portátil sem sacrificar a precisão, o modelo utiliza componentes customizados:

* Módulo GCE (Ghost Convolution + Squeeze-and-Excitation + Cross Stage Partial): Substitui as convoluções tradicionais no módulo CSP da rede. A convolução Ghost gera mapas de características intermediários por meio de transformações lineares de baixo custo computacional. Em seguida, o mecanismo de atenção Squeeze-and-Excitation (SE) recalibra adaptativamente os pesos dos canais, destacando bordas e texturas da placa enquanto suprime o ruído de fundo. Essa estrutura reduz os parâmetros da rede de detecção em 31,6% (de 3,29 milhões para 2,25 milhões) e o tamanho da base de 6,09 MB para 4,17 MB, mantendo a precisão mAP@0.5-95 em 0,769.
* Rede BiFPN (Bidirectional Feature Pyramid Network): Substitui a estrutura PANet no Neck da rede. A BiFPN introduz conexões cruzadas bidirecionais e fusão de recursos ponderada e adaptativa, permitindo que o sistema identifique pequenas áreas de placas e compense variações de ângulo, inclinação e iluminação adversa.

                  ┌────────────────────────┐
                  │    Imagem de Entrada   │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │   Backbone com GCE     │
                  │  (Ghost + SE + CSP)    │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │      Neck BiFPN        │
                  │ (Fusão Multiescala)    │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │ Pose Detection Head    │
                  │ (BBox + 4 Vértices)    │
                  └────────────────────────┘


A cabeça de detecção (Head) utiliza estimação de pose para mapear a caixa delimitadora (bounding box) e os quatro vértices exatos da placa. O modelo encadeado completo de detecção e reconhecimento (GCE_B_YOLO + N_E_LPRNet) ocupa 5,91 MB de armazenamento total. É crucial diferenciar a latência por etapa do tempo de resposta global: o módulo isolado de OCR (character recognition) opera com uma latência de inferência de 48 a 53 ms (~50 ms), enquanto a esteira completa (end-to-end) — englobando captura, detecção local por GCE_B_YOLO, retificação de perspectiva e OCR por N_E_LPRNet — atinge um tempo total de resposta de 235 ms (uma redução substancial frente aos 275 ms da combinação não otimizada YOLOv8n + N_E_LPRNet).

2.2. Pré-processamento e Engine OCR de Extração de Caracteres

Assim que a caixa delimitadora e os quatro vértices da placa (P_1, P_2, P_3, P_4) são identificados pelo Pose Head, a região da placa passa por uma transformação de perspectiva (homography perspective transform) para corrigir inclinações operacionais.

A mapeação de coordenadas transforma os 4 vértices de origem da imagem para um retângulo de destino de largura W e altura H pré-definidas (136 \times 36 \text{ pixels}):

S = \begin{bmatrix} x_1 & y_1 \\ x_2 & y_2 \\ x_3 & y_3 \\ x_4 & y_4 \end{bmatrix} \longrightarrow D = \begin{bmatrix} 0 & 0 \\ W & 0 \\ W & H \\ 0 & H \end{bmatrix}

Através da matriz de transformação homográfica M \in \mathbb{R}^{3 \times 3}, obtida pela resolução do sistema D_i \equiv M \cdot S_i, aplica-se a reamostragem bilinear da imagem, gerando o tensor retificado. Na sequência, a imagem recortada passa por conversão para escala de cinza, equalização adaptativa de histograma (CLAHE) e limiarização adaptativa antes de ser entregue à engine OCR.

A leitura dos caracteres é realizada pela rede neural N_E_LPRNet (evolução otimizada da LPRNet):

* N_E_LPRNet: Nesta arquitetura, as camadas de Dropout originais foram substituídas por camadas de Batch Normalization (BN), estabilizando o treinamento e elevando a capacidade de generalização. Além disso, foi adicionado o módulo EMA (Efficient Multi-scale Attention) após o segundo bloco básico (Small Basic Block), aumentando a capacidade da rede de extrair recursos discriminativos de textos contínuos. O modelo possui 0,44 milhão de parâmetros, tamanho reduzido de 1,74 MB, processamento de 0,16 GFLOPs e atinge uma acurácia de 96,61% no reconhecimento de caracteres.

2.3. Validação Gramatical e Enriquecimento Automático de Dados

A string resultante da inferência visual passa por um filtro local de validação gramatical via Expressões Regulares (RegEx), garantindo conformidade com os padrões de emplacamento brasileiros:

* Padrão Antigo (LPI): ^[A-Z]{3}[0-9]{4}$
* Padrão Mercosul: ^[A-Z]{3}[0-9]{1}[A-Z]{1}[0-9]{2}$

                  ┌────────────────────────┐
                  │   Placa Reconhecida    │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │  Validação por RegEx   │
                  └───────────┬────────────┘
                              │
                              ▼
               ┌──────────────┴──────────────┐
               │  Existe no SQLite Local?    │
               └──────┬──────────────┬───────┘
                      │              │
             Sim ┌────┘              └────┐ Não
                 ▼                        ▼
    ┌────────────────────────┐  ┌────────────────────────┐
    │ Carrega Dados Locais   │  │ Consulta API Brasil    │
    │ (Cliente / Histórico)  │  │ (API Key + SLA Com.)   │
    └────────────────────────┘  └───────────┬────────────┘
                                            │
                                            ▼
                                ┌────────────────────────┐
                                │ Preenche Marca, Modelo,│
                                │    Ano e Cor no App    │
                                └────────────────────────┘


1. Busca Primária Local: O aplicativo realiza uma consulta imediata ao SQLite interno. Caso o veículo já tenha frequentado o estabelecimento, os dados do proprietário, histórico de avarias e preferências são exibidos instantaneamente.
2. Enriquecimento Assíncrono de Fallback: Se for um veículo inédito, o sistema aciona de forma assíncrona a infraestrutura comercial da API Brasil via HTTPS REST. A escolha da API Brasil frente a soluções abertas comunitárias (como a BrasilAPI, que não possui garantias formais de SLA nem suporte técnico corporativo) fundamenta-se na exigência de estabilidade operacional, previsibilidade de limite de requisições e autenticação segura via API Key.

Abaixo, detalha-se o contrato de dados JSON para a resposta de consulta veicular enviada pela API Brasil:

{
  "status": 200,
  "message": "Consulta realizada com sucesso",
  "data": {
    "placa": "ABC1D23",
    "marca": "BMW",
    "modelo": "320i M Sport 2.0 Turbo",
    "ano_fabricacao": 2023,
    "ano_modelo": 2024,
    "cor": "Preto",
    "combustivel": "Gasolina/Etanol",
    "chassi_mascarado": "9BM352000***12345",
    "fipe": {
      "codigo_fipe": "005389-9",
      "valor_referencia": "R$ 315.000,00"
    }
  }
}


Com a placa confirmada e os dados do veículo devidamente preenchidos em tela, o operador avança para a inspeção física e o registro fotográfico do estado de conservação do automóvel.

3. Módulo de Check-in, Checklist Digital e Vistoria de Avarias

O checklist digital de entrada é a ferramenta primária para a proteção jurídica e a preservação do patrimônio financeiro de um centro de estética automotiva. Em serviços de alto ticket — como polimento técnico, aplicação de PPF ou vitrificação —, desacordos sobre arranhões, mossas na lataria ou trincas em vidros podem comprometer a margem de lucro da operação. A vistoria digital formalizada no momento da recepção constrói uma relação transparente com o cliente e resguarda o estabelecimento contra alegações desfundamentadas de danos pré-existentes.

3.1. Mapeamento Vetorial e Anatomia Veicular Interativa

A interface de vistoria exibe uma representação gráfica interativa em vetores (renderizada via Canvas móvel a 60 FPS) contendo a anatomia completa do veículo. O modelo é setorizado nas seguintes regiões:

* Estrutura Externa: Frente, Traseira, Lateral Esquerda, Lateral Direita e Teto.
* Componentes Específicos: Conjunto Óptico (faróis e lanternas), Rodas/Pneus e Cabine/Estofamento.

O operador toca diretamente no setor anatômico afetado e seleciona o diagnóstico a partir de uma taxonomia padronizada de danos:

* Arranhão Superficial (afeta apenas a camada de verniz)
* Risco Profundo (atinge a camada de tinta ou primer)
* Amassado / Mossa
* Mancha Química / Chuva Ácida
* Trinca ou Bicada no Para-brisa
* Ausência de Componente / Avaria Interna

3.2. Captura Fotográfica e Estamparia de Metadados de Auditoria

Para cada dano assinalado no mapa vetorial, o aplicativo exige a captura de ao menos uma evidência fotográfica. Para otimizar o armazenamento local e diminuir o consumo de banda de dados móveis, o pipeline de imagem aplica compressão local no formato WebP, limitando a resolução máxima a 1024x768 pixels.

Antes da persistência, o aplicativo grava diretamente sobre a matriz de pixels da imagem uma marca d'água indelével contendo os metadados de auditoria:

+---------------------------------------------------+
| [FOTO DA AVARIA VEICULAR - WebP 1024x768]         |
|                                                   |
|                                                   |
| _________________________________________________ |
| AUDIT: 2026-03-28 14:32:05 UTC                    |
| GPS: -23.550520, -46.633308 | PLACA: ABC1D23       |
+---------------------------------------------------+


Essa estamparia torna a foto auditável e impede manipulações posteriores no arquivo armazenado.

3.3. Coleta de Assinatura e Formalização do Termo de Recepção

A formalização do check-in encerra-se com a coleta da assinatura digital do cliente. A assinatura é desenhada no Canvas tátil do dispositivo móvel e vetorizada para armazenamento.

Imediatamente após a confirmação do aceite, o sistema consolida o termo de recepção em formato PDF e encaminha um link de visualização para o WhatsApp do cliente. O documento exibe a relação de serviços contratados, o mapa vetorial com os pontos marcados, a galeria de fotos auditadas e o termo de responsabilidade de pátio.

Com o termo assinado e o veículo oficialmente recepcionado, as informações de entrada alimentam a esteira de produção e o controle físico do pátio.

4. Gestão Operacional de Pátio, Fluxo de Produção e Agendamento

A gestão visual de pátio é indispensável para evitar gargalos operacionais, otimizar o tempo de permanência do veículo e manter a equipe técnica engajada. O módulo operacional transforma os dados coletados na recepção em uma linha de produção transparente, controlando o ciclo de vida do serviço desde o início da lavagem até a entrega das chaves.

4.1. Painel Kanban Tátil e Ciclo de Vida do Veículo

A movimentação de veículos no pátio é gerenciada por meio de um painel Kanban interativo, projetado para telas sensíveis ao toque. O ciclo de vida do atendimento é estruturado nos seguintes estados operacionais obrigatórios:

[ Fila de Espera ] ──► [ Em Lavagem ] ──► [ Estética/Cura ] ──► [ Controle QA ] ──► [ Pronto ]


1. Fila de Espera (Aguardando Início): Veículo recepcionado, aguardando liberação de box.
2. Em Lavagem / Pré-lavagem: Execução de processos de descontaminação e lavagem técnica.
3. Estética / Polimento / Cura: Etapas de correção de pintura, higienização detalhada, PPF ou vitrificação.
4. Inspeção de Qualidade (QA Checklist): Validação final dos itens contratados por um supervisor.
5. Pronto para Retirada: Veículo liberado para cobrança e devolução ao cliente.

4.2. Temporizadores de Cura e Controle por Box de Serviço

Serviços avançados de estética exigem o cumprimento rigoroso de tempos de secagem e cura técnica. A aplicação vincula os temporizadores regressivos aos boxes físicos configurados no sistema:

* Cura Parcial de Vitrificador Cerâmico: Exige entre 1 e 4 horas em ambiente livre de poeira e água.
* Instalação de Películas PPF: Exige intervalo de acomodação do adesivo.

Ao atingir o limite do tempo programado, o aplicativo dispara alertas visuais no painel Kanban e emite notificações sonoras nos dispositivos móveis dos técnicos responsáveis, garantindo a qualidade final sem comprometer a rotatividade dos boxes.

4.3. Alocação Multi-Técnico e Rateio de Produção

Trabalhos de maior complexidade frequentemente demandam a atuação concomitante de múltiplos profissionais em um mesmo veículo. O sistema permite atribuir múltiplos técnicos a uma única Ordem de Serviço (OS), possibilitando o registro fracionado de etapas operacionais:

* Técnico A: Responsável pela higienização interna e lavagem de chassi.
* Técnico B: Responsável pelo polimento técnico e aplicação do vitrificador.

Essa divisão fornece a base de dados exata para o cálculo fracionado de comissões e produtividade individual no módulo financeiro.

Com o serviço concluído e validado na inspeção de qualidade, o veículo passa para a fase final de liquidação financeira e emissão do comprovante físico de pátio.

5. Arquitetura de Hardware, Impressão Térmica ESC/POS e Terminais Smart POS

A integração fluida entre o aplicativo móvel e os periféricos de impressão e pagamento elimina a necessidade de infraestruturas centralizadas com computadores de mesa no pátio. O operador realiza o atendimento, cobra o serviço e emite o comprovante utilizando um único dispositivo portátil.

5.1. Protocolo de Comunicação Bluetooth e Comandos ESC/POS

Para a comunicação com impressoras térmicas portáteis de bolso (formatos 58mm e 80mm), o aplicativo utiliza os protocolos Bluetooth Classic (SPP) e Bluetooth Low Energy (BLE) através da biblioteca nativa @sofyan.rs/react-native-bluetooth-escpos-printer.

Abaixo, apresenta-se o código em TypeScript/JavaScript para controle da impressora e emissão do comprovante, acompanhado da representação dos bytes hexadecimais puros do padrão ESC/POS:

import {
  BluetoothManager,
  BluetoothEscposPrinter
} from "@sofyan.rs/react-native-bluetooth-escpos-printer";

async function printYardReceipt(orderData: {
  osNumber: string;
  plate: string;
  service: string;
  amount: string;
  qrCodeUrl: string;
}): Promise<void> {
  try {
    // Inicializa a impressora (HEX: 0x1B 0x40 -> ESC @)
    await BluetoothEscposPrinter.printerInit();
    
    // Alinhamento centralizado (HEX: 0x1B 0x61 0x01 -> ESC a 1)
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
    
    // Negrito ON (HEX: 0x1B 0x45 0x01 -> ESC E 1)
    await BluetoothEscposPrinter.setBlob(1);
    await BluetoothEscposPrinter.printText("CENTRO DE ESTETICA AUTOMOTIVA\n\r", {
      encoding: "GBK",
      widthtimes: 1,
      heigthtimes: 1
    });
    await BluetoothEscposPrinter.setBlob(0); // Negrito OFF
    
    await BluetoothEscposPrinter.printText("COMPROVANTE DE ENTRADA DE PATIO\n\r", {});
    await BluetoothEscposPrinter.printText("--------------------------------\n\r", {});
    
    // Alinhamento à esquerda (HEX: 0x1B 0x61 0x00 -> ESC a 0)
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
    await BluetoothEscposPrinter.printText(`OS: ${orderData.osNumber}\n\r`, {});
    await BluetoothEscposPrinter.printText(`PLACA: ${orderData.plate}\n\r`, {});
    await BluetoothEscposPrinter.printText(`SERVICO: ${orderData.service}\n\r`, {});
    await BluetoothEscposPrinter.printText(`VALOR TOTAL: R$ ${orderData.amount}\n\r`, {});
    await BluetoothEscposPrinter.printText("--------------------------------\n\r", {});
    
    // Impressão de QR Code (Comando nativo GS k)
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
    await BluetoothEscposPrinter.printQRCode(orderData.qrCodeUrl, 6, 1);
    await BluetoothEscposPrinter.printText("\n\rAcesse para ver o Checklist Digital\n\r\n\r", {});
    
    // Corte parcial do papel (HEX: 0x1D 0x56 0x42 0x00 -> GS V 66 0)
    await BluetoothEscposPrinter.cutOnePoint();
  } catch (error) {
    console.error("Falha na impressao ESC/POS:", error);
    // Dispara rotina de re-tentativa e armazenamento no buffer de spool local
  }
}


* Tratamento de Falhas e Gestão de Buffer: A camada de hardware implementa rotinas de reconexão automática em segundo plano, monitoramento do buffer de envio e filas de re-tentativa caso a impressora perca o sinal de rádio durante a emissão de uma ficha.

5.2. Compatibilidade Nativa com Terminais Smart POS Android

O aplicativo é compilado nativamente para execução em maquininhas de cartão ativas do mercado, conhecidas como Smart POS (incluindo modelos Sunmi V2/P2, Moderninha Smart, Cielo Lio e Stone POS).

┌────────────────────────────────────────────────────────┐
|                   TERMINAL SMART POS                   |
| ┌────────────────────────────────────────────────────┐ |
| |        Aplicativo de Gestão (Flutter/RN)           | |
| └─────────────────────────┬──────────────────────────┘ |
|                           │                            |
|             Consumo de SDKs Proprietários              |
|                     (Java / Kotlin)                    |
|                           │                            |
|        ┌──────────────────┴──────────────────┐         |
|        ▼                                     ▼         |
| ┌──────────────┐                     ┌──────────────┐  |
| | Impressora   |                     | Pinpad / TEF |  |
| | Térmica Int. |                     | (Cartões/PIX)|  |
| └──────────────┘                     └──────────────┘  |
└────────────────────────────────────────────────────────┘


Através do consumo dos SDKs proprietários fornecidos pelas credenciadoras (escritos em Java/Kotlin), a aplicação unifica o check-in, a leitura da placa, a coleta da assinatura digital, o processamento da transação financeira de débito/crédito e a impressão do comprovante em um único hardware móvel de pátio.

Os valores capturados durante o checkout presencial e nas maquininhas alimentam diretamente a arquitetura financeira do sistema.

6. Gestão Financeira, Regras de Negócio e Engenharia de Comissionamento

A disciplina no fluxo de caixa e o controle rigoroso sobre os custos operacionais são os pilares que garantem a rentabilidade em empresas de embelezamento automotivo. O módulo financeiro automatiza os repasses de equipe, trata o parcelamento de cartões sob os princípios de transações ACID e previne desvios de caixa através da segregação de contas.

6.1. Regime de Segregação Rígida de 3 Contas

Para evitar a mistura de recursos físicos do pátio com o caixa de despesas fixas, o sistema adota o modelo arquitetural de Três Contas Virtuais Independentes:

[ Faturamento Bruto (Checkout) ]
               │
               ├────────────────────────┬────────────────────────┐
               ▼                        ▼                        ▼
     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
     │ 1. Caixa Pátio   │     │ 2. Tesouraria    │     │ 3. Caixa Despesas│
     │    (Espécie/Gav) │     │    (PIX/Cartões) │     │    (Passivas)    │
     └─────────┬────────┘     └──────────────────┘     └──────────────────┘
               │
      (Sangria Obrigatória)
               │
               ▼
     ┌──────────────────┐
     │ Lançamento Duplo │
     └──────────────────┘


1. Caixa de Operação (Pátio/Gaveta): Registra apenas entradas em dinheiro espécie e pagamentos físicos efetuados na recepção durante o turno ativo.
2. Conta Tesouraria / Banco: Controla as liquidações de PIX e cartões de débito/crédito. Calcula os prazos de compensação (D+0, D+1, D+30) e desconta automaticamente as taxas de desconto das credenciadoras.
3. Caixa de Despesas Passivas: Conta isolada projetada para provisionar o pagamento futuro de comissões de técnicos, insumos químicos e custos fixos (aluguel, energia).

* Regra de Sangria de Pátio: Qualquer retirada física do caixa da recepção exige obrigatoriamente um lançamento duplo no sistema: uma "Sangria para Tesouraria" casada com uma "Despesa Operacional Categorizada", eliminando divergências no fechamento do caixa diário.

6.2. Motor Flexível de Comissionamento e Regras de Negócio

A remuneração dos profissionais de estética baseia-se no desempenho. O motor de regras financeiras suporta diferentes configurações de cálculo:

* Valor Percentual ou Fixo: Configuração de repasses percentuais sobre serviços de rotina ou valores fixos por veículo em procedimentos complexos (ex: R$ 250,00 por aplicação de PPF).
* Alternância de Comissionamento (Commission Toggle) - Estudo de Caso Misto: O sistema trata individualmente itens de mão de obra e insumos/adicionais. Considere uma Ordem de Serviço no valor total de R$ 1.500,00:
  * Item 1 (Mão de Obra): Polimento Técnico 3 Etapas = R$ 1.200,00 (Comissão ativada em 20%).
  * Item 2 (Produto/Adicional): Taxa de Insumo do Vitrificador Cerâmico = R$ 300,00 (Commission Toggle = OFF).
  * Cálculo Financeiro: A comissão repassada ao operador será de **R 240,00** (R$ 1.200,00 \times 0,20). A taxa de R 300,00 do vitrificador é integralmente destinada à margem bruta do estabelecimento para cobertura de insumos químicos, sem qualquer repasse.
* Rateio Multi-Técnico Proporcional: Algoritmo que divide a comissão total do item de mão de obra entre os técnicos alocados, respeitando as etapas executadas por cada um.
* Política de Descontos: Configuração que determina o impacto de descontos concedidos no checkout: é possível optar pela dedução proporcional da comissão do operador ou pela absorção integral do abatimento pela margem do estabelecimento.

6.3. Modelos de Recorrência, Faturamento de Frotas e Cashback

Para criar previsibilidade de receita e estabilizar o caixa ao longo do ano, a plataforma dispõe de três módulos complementares:

* Convênios e Frotas a Faturar: Permite o cadastramento de frotas corporativas, concessionárias parceiras ou locadoras. Os veículos realizam o serviço no pátio sem pagamento presencial. O sistema acumula as Ordens de Serviço, valida os limites de crédito configurados, bloqueia automaticamente novas entradas em caso de inadimplência e gera faturas consolidadas em PDF.
* Clubes de Assinatura Recorrente: Integração via gateways em nuvem (Stripe ou Mercado Pago) para cobrança mensal no cartão de crédito do cliente. A validação do plano ocorre no momento da leitura da placa no check-in, liberando os serviços contratados sem cobrança adicional.
* Cashback Digital Nativo: Sistema de retenção de clientes atrelado ao CPF do proprietário e à placa do veículo. A cada checkout concluído, um percentual do valor pago é retido na carteira digital do cliente. O saldo acumulado possui prazo de validade expirável e pode ser utilizado como abatimento parcial em agendamentos futuros.

Os eventos gerados no checkout e no motor financeiro disparam instantaneamente as réguas de automação e mensageria pós-venda baseadas em Event-Driven Architecture (EDA).

7. Automação de Mensageria, Notificações e Retenção via WhatsApp

O aplicativo de mensagens instantâneas WhatsApp é o principal canal de contato com o cliente automotivo. A automação das comunicações reduz drasticamente a taxa de absenteísmo, acelera a aprovação de orçamentos e mantém o cliente informado sobre o andamento do serviço.

7.1. Estratégia Híbrida de Integração com WhatsApp

A arquitetura do sistema adota uma abordagem de integração estruturada em dois níveis:

* Deep Linking Nativo: Utilização do protocolo whatsapp://send no dispositivo móvel do operador. Permite o envio manual e gratuito de orçamentos e recibos em PDF diretamente pelo aplicativo oficial do WhatsApp instalado no aparelho, sendo a solução ideal para interações pontuais.
* WhatsApp Business Cloud API (Meta): Conexão direta entre o backend da plataforma e a API em nuvem da Meta via Webhooks assíncronos. Dispara notificações automatizadas em segundo plano com base em eventos do sistema, sem necessidade de interferência humana ou consumo da bateria do celular do operador.

7.2. Régua de Automação de Notificações e Pós-Venda

O servidor de mensageria executa quatro automações orientadas a eventos:

[ Evento: Check-in ]  ──►  Notification 1: OS Digital + Link de Fotos de Avarias
[ Evento: Veículo Pronto ] ──► Notification 2: Conta Final + Chave PIX Dinâmico EMV
[ Evento: 24h pós-entrega ] ──► Notification 3: Pesquisa NPS + Link Google Review
[ Evento: >30 dias inativo] ──► Notification 4: Oferta Reengajamento + Cashback Expira


1. Check-in Realizado: Disparo imediato da Ordem de Serviço digital com link seguro para visualização do checklist e galeria de fotos de avarias.
2. Veículo Pronto para Retirada: Notificação automática informando a conclusão do serviço, o valor final e a chave PIX Dinâmico EMV com reconciliação bancária automática.
3. Pesquisa NPS e Avaliação no Google: Disparo realizado 24 horas após a entrega do veículo, solicitando uma nota de satisfação (NPS). Clientes que atribuem notas 9 ou 10 recebem um direcionamento para deixar uma avaliação pública no Google Meu Negócio.
4. Régua de Reengajamento e Retenção: Varredura diária no banco de dados para identificar veículos sem visitas há mais de 30 dias. O sistema envia uma mensagem personalizada oferecendo um desconto de retorno e alertando sobre o saldo de cashback prestes a expirar.

Abaixo, detalha-se o contrato JSON de payload enviado via Meta WhatsApp Cloud API para o evento de veiculo_pronto com montagem de chave PIX EMV dinâmica:

{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "5511999998888",
  "type": "template",
  "template": {
    "name": "vehicle_ready_pix",
    "language": {
      "code": "pt_BR"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "João Silva" },
          { "type": "text", "text": "BMW 320i (ABC1D23)" },
          { "type": "text", "text": "350,00" },
          { "type": "text", "text": "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-4266141740005204000053039865406350.005802BR5925ESTETICA AUTOMOTIVA VIP6009SAO PAULO62070503***6304E2CA" }
        ]
      },
      {
        "type": "button",
        "sub_type": "url",
        "index": "0",
        "parameters": [
          { "type": "text", "text": "10492" }
        ]
      }
    ]
  }
}


A convergência entre visão computacional, resiliência de pátio e automação financeira consolida a matriz tecnológica de requisitos do projeto.

8. Matriz de Requisitos e Consolidação da Arquitetura

A especificação técnica deste ecossistema demonstra que o sucesso de um software para a estética automotiva moderna depende do equilíbrio entre a velocidade de operação no pátio e a solidez do controle administrativo em nuvem. A arquitetura móvel precisa entregar desempenho instantâneo no atendimento de borda enquanto alimenta em segundo plano os motores de inteligência, comissionamento e retenção de clientes.

8.1. Matriz Consolidada de Requisitos Técnicos

A tabela a seguir sintetiza os componentes da plataforma, servindo como guia definitivo para as equipes de engenharia de software e desenvolvimento:

Módulo Funcional	Requisito Operacional	Solução Técnica Recomendada	Diretrizes e Desafios de Desenvolvimento
Interface do Usuário (UI/UX)	Operação tátil ágil no pátio sob luz solar direta (100k lux) e uso de luvas.	Flutter ou React Native com tema Dark Mode nativo (WCAG AAA >= 7:1) e alvos >= 48 \text{ dp}.	Desenvolver fluxos operacionais que exijam no máximo 3 toques na tela por ação.
Motor ALPR (Visão Computacional)	Identificação de placas em < 1 segundo com alta precisão e baixo consumo.	Modelo GCE_B_YOLO + N_E_LPRNet rodando localmente via ONNX Runtime (< 6 MB total).	Aplicar retificação geométrica homográfica nos 4 vértices da placa antes de submeter ao OCR.
Checklist e Vistoria	Mapeamento de avarias com evidências fotográficas auditáveis.	Representação vetorial em Canvas (60 FPS) + compressão WebP (1024x768) + estamparia de metadados.	Inserir marca d'água com data, hora UTC, GPS e placa diretamente na matriz de pixels da imagem.
Persistência e Offline-First	Operação ininterrupta em pátios e galpões sem sinal de internet.	Banco SQLite local (WatermelonDB / Isar) com Sync Queue e sincronização WebSockets.	Utilizar UUIDv4 gerados no cliente para evitar duplicidade e resolver conflitos por Last-Write-Wins (LWW).
Impressão Térmica e Smart POS	Emissão portátil de comprovantes de pátio e integração de pagamentos.	Protocolo ESC/POS via Bluetooth (@sofyan.rs/react-native-bluetooth-escpos-printer) e Smart POS Android.	Implementar tratamento de buffer e reconexão automática Bluetooth em caso de queda de sinal.
Automação de Mensageria	Disparos automáticos de status, chave PIX EMV e régua de retenção pós-venda.	Webhooks assíncronos integrados à WhatsApp Business Cloud API da Meta.	Controlar rigorosamente a frequência dos disparos para manter conformidade com as políticas anti-spam da Meta.
