# Como usar o catálogo e o painel administrativo

O catálogo da loja vem da planilha Google já conectada ao site. Para adicionar uma peça pelo painel, siga a configuração única em PAINEL-ADMIN.md. Depois disso, abra o painel publicado, preencha os dados da peça e clique em Cadastrar peça.

A planilha continua pública somente para leitura do catálogo da loja; a gravação é feita pelo Apps Script implantado com acesso restrito à sua conta Google.

Se precisar ajustar a planilha manualmente, as colunas usadas são:

id | nome | slug | categoria | precoAntigo | preco | img | cores | tamanhos | lancamento | maisVendido

- categoria: camisa, short, bermuda, calca, acessorios ou outros
- cores: Nome:#RRGGBB, separadas por |
- tamanhos: separados por vírgula; use Único para acessórios sem tamanho
- lancamento e maisVendido: TRUE ou FALSE

A loja lê os dados por CSV público e pode levar alguns minutos para mostrar uma alteração recém-salva.