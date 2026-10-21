# Painel administrativo da Bessa Imports

O catálogo da loja já é lido de uma planilha Google. O painel usa essa mesma planilha para cadastrar peças, sem colocar senha ou chave de escrita no site público.

## Configuração única

1. Abra a planilha usada pelo catálogo na conta Google que tem acesso de edição:
   https://docs.google.com/spreadsheets/d/1-GdVSxtt7TLKfWtigXnogznYeYj25UgDeqW0AO499Rw/edit
2. Na planilha, abra **Extensões → Apps Script**.
3. Substitua o conteúdo de Code.gs pelo arquivo painel-admin/Code.gs.
4. Crie um arquivo HTML chamado Index e cole o conteúdo de painel-admin/Index.html.
5. Em **Configurações do projeto**, habilite a exibição do manifesto e substitua-o pelo arquivo painel-admin/appsscript.json.
6. Salve. Execute listarProdutosAdmin pelo editor uma vez e autorize o acesso à planilha.
7. Clique em **Implantar → Nova implantação → App da Web**. Configure **Executar como: eu** e **Quem tem acesso: somente eu**. Implante e aprove as permissões solicitadas.
8. Abra o endereço do app da Web para cadastrar peças e guarde esse endereço como favorito.
9. Para abrir pelo endereço /admin.html da loja, cole o endereço publicado em assets/admin-config.js e publique novamente os arquivos do site.

A publicação restrita à sua conta é importante: o painel grava na planilha. Não coloque senha, token ou chave de escrita em assets/site.js nem em qualquer arquivo público.

## Como cadastrar uma peça

Preencha o nome, a categoria, o preço, um link HTTPS público da foto, as cores e os tamanhos. Para cores, use uma por linha no formato Nome:#RRGGBB, por exemplo Preto:#0d0d0d. Para acessório sem tamanho, use Único. O endereço da página é preenchido pelo nome.

Ao salvar, o painel grava uma nova linha na planilha e gera o código do produto. O site usa essa planilha como catálogo; a atualização pública pode levar alguns minutos por causa do cache do Google.

A foto precisa estar acessível publicamente para aparecer na loja. O site não cria imagens de produto automaticamente.

## WhatsApp e páginas das peças

Ao finalizar o carrinho, a loja abre o WhatsApp configurado no site com nomes das peças, tamanhos, cores, quantidades, subtotal, desconto e total. O cliente ainda precisa revisar e enviar a mensagem no WhatsApp.

Novas peças recebem uma página de produto dinâmica pelo endereço /produto.html?slug=...; não é necessário criar um arquivo HTML individual para cada cadastro.

Documentação oficial do Apps Script:
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/html/communication