
/* =========================================================
   BESSA IMPORTS — script principal
   Loja com carrinho e checkout simulados (localStorage).
   Nenhum pagamento real é processado.
   ========================================================= */

// ----- 5. Catálogo de produtos -----
// Os produtos vêm de uma Planilha Google publicada — cadastrar um produto novo
// é só adicionar uma linha na planilha, inclusive pelo app do celular.
// Se a planilha não carregar por qualquer motivo, o site cai automaticamente
// pro arquivo local /assets/produtos.json (backup).
let produtos = [];

// ===== CONFIGURE AQUI =====
// Troque pelo link da sua planilha publicada em CSV (veja instruções no COMO-CADASTRAR-PRODUTOS.md).
// Formato: https://docs.google.com/spreadsheets/d/SEU_ID_AQUI/gviz/tq?tqx=out:csv&gid=0
const PLANILHA_CSV_URL = "https://docs.google.com/spreadsheets/d/1-GdVSxtt7TLKfWtigXnogznYeYj25UgDeqW0AO499Rw/gviz/tq?tqx=out:csv&gid=0";
// ===========================

// ----- Parser de CSV simples (RFC 4180: lida com vírgula, aspas e quebra de linha dentro de campo) -----
function parseCSV(texto){
  const linhas = [];
  let campo = '', linha = [], dentroAspas = false;
  for (let i = 0; i < texto.length; i++){
    const c = texto[i];
    if (dentroAspas){
      if (c === '"'){
        if (texto[i + 1] === '"'){ campo += '"'; i++; }
        else dentroAspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"'){
      dentroAspas = true;
    } else if (c === ','){
      linha.push(campo); campo = '';
    } else if (c === '\n' || c === '\r'){
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.length > 1 || linha[0] !== ''){ linhas.push(linha); }
      linha = [];
    } else {
      campo += c;
    }
  }
  if (campo.length || linha.length){ linha.push(campo); linhas.push(linha); }
  return linhas;
}

// ----- Converte as linhas da planilha no mesmo formato que o site já usa -----
function linhasParaProdutos(linhas){
  if (!linhas.length) return [];
  // Também aceita planilhas em que cada linha CSV foi importada numa única célula.
  if (linhas.every(linha => linha.length === 1)){
    linhas = parseCSV(linhas.map(linha => linha[0]).join('\n'));
  }
  const cabecalho = linhas[0].map(h => h.trim().toLowerCase());
  const col = nome => cabecalho.indexOf(nome);
  const ehVerdadeiro = v => /^(true|verdadeiro|sim|1|x)$/i.test((v || '').trim());
  const numero = v => parseFloat((v || '0').replace(',', '.')) || 0;

  return linhas.slice(1)
    .filter(l => (l[col('id')] || '').trim() !== '')
    .map(l => {
      const cores = (l[col('cores')] || '').split('|').filter(Boolean).map(par => {
        const [nome, hex] = par.split(':');
        return { nome: (nome || '').trim(), hex: (hex || '#9a9a95').trim() };
      });
      const tamanhos = (l[col('tamanhos')] || '').split(',').map(t => t.trim()).filter(Boolean);

      return {
        id: Number(l[col('id')]),
        nome: l[col('nome')] || '',
        slug: l[col('slug')] || '',
        categoria: (l[col('categoria')] || '').trim(),
        precoAntigo: numero(l[col('precoantigo')]),
        preco: numero(l[col('preco')]),
        img: l[col('img')] || '',
        cores: cores.length ? cores : [{ nome: 'Padrão', hex: '#9a9a95' }],
        tamanhos: tamanhos.length ? tamanhos : ['Único'],
        lancamento: ehVerdadeiro(l[col('lancamento')]),
        maisVendido: ehVerdadeiro(l[col('maisvendido')])
      };
    });
}

// Promise que resolve quando o catálogo termina de carregar. Qualquer função que
// precise da lista de produtos deve rodar depois dela (produtosProntos.then(...)).
// window.__produtosPreCarregados é usado só em previews locais (arquivo aberto direto,
// sem servidor), onde fetch() não funciona — no site publicado essa variável não existe.
function carregarDoJsonLocal(){
  return fetch('/Bessa-Imports/assets/produtos.json').then(r => r.json());
}

const produtosProntos = (window.__produtosPreCarregados
    ? Promise.resolve(window.__produtosPreCarregados)
    : (PLANILHA_CSV_URL.startsWith('http')
        ? fetch(PLANILHA_CSV_URL)
            .then(resposta => resposta.text())
            .then(texto => {
              const catalogo = linhasParaProdutos(parseCSV(texto));
              return catalogo.length ? catalogo : carregarDoJsonLocal();
            })
            .catch(erro => {
              console.error('Não foi possível carregar a planilha, usando produtos.json como backup:', erro);
              return carregarDoJsonLocal();
            })
        : carregarDoJsonLocal() // link da planilha ainda não configurado — usa o arquivo local
      )
  )
  .then(dados => { produtos = dados; })
  .catch(erro => { console.error('Não foi possível carregar o catálogo de produtos', erro); });

const TAMANHOS_DISPONIVEIS = ["P", "M", "G", "GG"];

const idsOfertas = [1, 3, 8]; // Camisa Oxford, Jaqueta Jeans, Tênis Casual — destaques

let carrinho = [];
let cupomAtivo = null;

// ----- Formatação em Real -----
function formatarPreco(valor){
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// FIX: trava o scroll do body quando um painel/modal está aberto, compensando a largura
// da scrollbar (se houver) com padding-right para o conteúdo não deslocar/balançar
function bloquearScroll(){
  const larguraScrollbar = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = 'hidden';
  if (larguraScrollbar > 0){
    document.body.style.paddingRight = larguraScrollbar + 'px';
  }
}
function desbloquearScroll(){
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
}

// ----- Renderizar cards de produto (reutilizável) -----
function escaparHtml(valor){
  return String(valor == null ? '' : valor).replace(/[&<>"']/g, function(caractere){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[caractere];
  });
}

function urlImagemSegura(valor){
  const texto = String(valor || '').trim();
  if (!texto) return '';
  if (texto.startsWith('/')){
    return texto.startsWith('//') ? '' : texto;
  }
  try {
    const url = new URL(texto, window.location.origin);
    return url.protocol === 'https:' ? url.href : '';
  } catch (erro) {
    return '';
  }
}

function montarCardsProdutos(lista){
  return lista.map(function(p){
    const nome = escaparHtml(p.nome);
    const slug = encodeURIComponent(String(p.slug || ''));
    const imagem = escaparHtml(urlImagemSegura(p.img));
    const id = Number(p.id);
    const precoAntigo = Number(p.precoAntigo) || 0;
    const preco = Number(p.preco) || 0;

    return '<article class="produto">' +
      '<a href="/Bessa-Imports/produto.html?slug=' + slug + '" class="produto-link" aria-label="Ver detalhes de ' + nome + '">' +
        '<div class="produto-img-wrap">' +
          '<img src="' + imagem + '" alt="' + nome + '" loading="lazy">' +
        '</div>' +
        '<div class="produto-info">' +
          '<div class="produto-nome">' + nome + '</div>' +
          '<div class="produto-precos">' +
            (precoAntigo > preco ? '<span class="preco-antigo">' + formatarPreco(precoAntigo) + '</span>' : '') +
            '<span class="preco-atual">' + formatarPreco(preco) + '</span>' +
          '</div>' +
        '</div>' +
      '</a>' +
      '<div class="produto-info produto-info-acao">' +
        '<button class="btn-add" aria-label="Adicionar ' + nome + ' ao carrinho" data-action="adicionar-carrinho" data-id="' + id + '">Adicionar ao carrinho</button>' +
      '</div>' +
    '</article>';
  }).join('');
}
// ----- Renderizar grid de ofertas (destaques na página) -----
function renderizarProdutos(){
  const destaques = produtos.filter(p => idsOfertas.includes(p.id));
  document.getElementById('gridProdutos').innerHTML = montarCardsProdutos(destaques);
}

// ----- Renderizar "Lançamentos" e "Mais Vendidos" na home — puxa automaticamente pela flag do produto -----
function renderizarLancamentos(){
  const grid = document.getElementById('gridLancamentos');
  if (!grid) return;
  grid.innerHTML = montarCardsProdutos(produtos.filter(p => p.lancamento));
}
function renderizarMaisVendidos(){
  const grid = document.getElementById('gridMaisVendidos');
  if (!grid) return;
  grid.innerHTML = montarCardsProdutos(produtos.filter(p => p.maisVendido));
}

// ----- Renderizar grid com todos os produtos (modal "Ver todos", só existe na home) -----
function renderizarTodosProdutos(){
  const grid = document.getElementById('gridTodosProdutos');
  if (!grid) return;
  grid.innerHTML = montarCardsProdutos(produtos);
}

// ----- Vitrine de categoria: ordenação + filtro por tamanho (páginas /categoria/<slug>) -----
let categoriaAtualSlug = null;
let ordenacaoAtual = 'relevancia';
let tamanhoFiltroAtual = null;

function montarVitrineCategoria(slug){
  categoriaAtualSlug = slug;
  ordenacaoAtual = 'relevancia';
  tamanhoFiltroAtual = null;
  renderizarFiltrosTamanho(slug);
  aplicarFiltrosCategoria();
}

// Gera os chips de tamanho com base no que os produtos desta categoria realmente têm
function renderizarFiltrosTamanho(slug){
  const barra = document.getElementById('filtroTamanhoOpcoes');
  if (!barra) return;
  const lista = produtos.filter(p => p.categoria === slug);
  const tamanhosDisponiveis = [...new Set(lista.flatMap(p => p.tamanhos || []))];
  if (tamanhosDisponiveis.length === 0){
    barra.innerHTML = '<span class="filtro-tamanho-vazio">—</span>';
    return;
  }
  barra.innerHTML = tamanhosDisponiveis.map(t => `
    <button type="button" class="filtro-tamanho-btn" data-action="filtro-tamanho" data-tamanho="${t}">${t}</button>
  `).join('');
}

function selecionarOrdenacao(valor){
  ordenacaoAtual = valor;
  aplicarFiltrosCategoria();
}

function alternarFiltroTamanho(tamanho, btn){
  if (tamanhoFiltroAtual === tamanho){
    tamanhoFiltroAtual = null;
    btn.classList.remove('ativo');
  } else {
    document.querySelectorAll('.filtro-tamanho-btn').forEach(b => b.classList.remove('ativo'));
    tamanhoFiltroAtual = tamanho;
    btn.classList.add('ativo');
  }
  aplicarFiltrosCategoria();
}

function aplicarFiltrosCategoria(){
  let lista = produtos.filter(p => p.categoria === categoriaAtualSlug);

  if (tamanhoFiltroAtual){
    lista = lista.filter(p => p.tamanhos && p.tamanhos.includes(tamanhoFiltroAtual));
  }

  lista = lista.slice(); // não altera o array original ao ordenar
  if (ordenacaoAtual === 'menor-preco'){
    lista.sort((a, b) => a.preco - b.preco);
  } else if (ordenacaoAtual === 'maior-preco'){
    lista.sort((a, b) => b.preco - a.preco);
  } else if (ordenacaoAtual === 'recentes'){
    lista.sort((a, b) => b.id - a.id); // maior id = adicionado mais recentemente ao catálogo
  }

  renderizarGradeVitrine(lista);
}

function renderizarGradeVitrine(lista){
  const grid = document.getElementById('gridVitrine');
  const vazio = document.getElementById('vitrineVazia');
  if (!grid) return;
  if (lista.length === 0){
    grid.innerHTML = '';
    grid.style.display = 'none';
    if (vazio) vazio.style.display = 'block';
    return;
  }
  if (vazio) vazio.style.display = 'none';
  grid.style.display = '';
  grid.innerHTML = montarCardsProdutos(lista);
}

// ----- Página de busca (/busca?q=...) -----
function executarBusca(){
  const params = new URLSearchParams(window.location.search);
  const termo = (params.get('q') || '').trim();
  const tituloEl = document.getElementById('buscaTitulo');
  const grid = document.getElementById('gridBusca');
  const vazio = document.getElementById('buscaVazia');
  if (!grid) return;

  if (tituloEl){
    tituloEl.textContent = termo ? `Resultados para "${termo}"` : 'Buscar produtos';
  }

  if (!termo){
    grid.innerHTML = '';
    grid.style.display = 'none';
    if (vazio) vazio.style.display = 'block';
    return;
  }

  const termoNormalizado = termo.toLowerCase();
  const resultados = produtos.filter(p => p.nome.toLowerCase().includes(termoNormalizado));

  if (resultados.length === 0){
    grid.innerHTML = '';
    grid.style.display = 'none';
    if (vazio) vazio.style.display = 'block';
    return;
  }
  if (vazio) vazio.style.display = 'none';
  grid.style.display = '';
  grid.innerHTML = montarCardsProdutos(resultados);
}

// ----- Página de Produto: galeria, tamanho, cor -----
let produtoAtual = null;
let tamanhoSelecionado = null;
let corSelecionada = null;

function renderizarProduto(slug){
  const container = document.getElementById('produtoDetalhe');
  if (!container) return;

  const produto = produtos.find(function(item){ return item.slug === slug; });
  if (!produto){
    container.innerHTML = '<div class="container"><h1>Produto não encontrado</h1><p>Volte à loja para ver as peças disponíveis.</p><a href="/Bessa-Imports/">Voltar à loja</a></div>';
    document.title = 'Produto não encontrado — Bessa Imports';
    return;
  }

  produtoAtual = produto;
  tamanhoSelecionado = null;
  corSelecionada = null;

  const foto = urlImagemSegura(produto.img);
  const fotos = [foto];
  const nomeSeguro = escaparHtml(produto.nome);

  const CATEGORIAS_COM_PAGINA = { camisa: 'Camisa', short: 'Short', bermuda: 'Bermuda', calca: 'Calças', acessorios: 'Acessórios' };
  const breadcrumbEl = document.getElementById('breadcrumbCategoria');
  if (CATEGORIAS_COM_PAGINA[produto.categoria]){
    breadcrumbEl.textContent = CATEGORIAS_COM_PAGINA[produto.categoria];
    breadcrumbEl.href = '/Bessa-Imports/categoria/' + encodeURIComponent(produto.categoria) + '.html';
  } else {
    breadcrumbEl.textContent = 'Coleção';
    breadcrumbEl.href = '/Bessa-Imports/#loja';
  }
  document.getElementById('breadcrumbNome').textContent = produto.nome;

  document.getElementById('galeriaPrincipal').innerHTML = '<img id="fotoGrande" src="' + escaparHtml(fotos[0]) + '" alt="' + nomeSeguro + '">';
  document.getElementById('galeriaMiniaturas').innerHTML = fotos.map(function(fotoGaleria, i){
    const fotoSegura = escaparHtml(fotoGaleria);
    return '<button type="button" class="' + (i === 0 ? 'ativa' : '') + '" aria-label="Ver foto ' + (i + 1) + '" data-action="trocar-foto" data-foto="' + fotoSegura + '">' +
      '<img src="' + fotoSegura + '" alt="' + nomeSeguro + ' — foto ' + (i + 1) + '">' +
    '</button>';
  }).join('');

  document.getElementById('produtoDetalheNome').textContent = produto.nome;
  const precoAntigoEl = document.getElementById('produtoDetalhePrecoAntigo');
  const precoAntigo = Number(produto.precoAntigo) || 0;
  if (precoAntigo > Number(produto.preco)) {
    precoAntigoEl.textContent = formatarPreco(precoAntigo);
    precoAntigoEl.hidden = false;
  } else {
    precoAntigoEl.textContent = '';
    precoAntigoEl.hidden = true;
  }
  document.getElementById('produtoDetalhePrecoAtual').textContent = formatarPreco(Number(produto.preco) || 0);

  const tamanhos = Array.isArray(produto.tamanhos) && produto.tamanhos.length
    ? produto.tamanhos
    : TAMANHOS_DISPONIVEIS;
  document.getElementById('tamanhosOpcoes').innerHTML = tamanhos.map(function(tamanho){
    const tamanhoSeguro = escaparHtml(tamanho);
    return '<button type="button" class="tamanho-btn" data-action="selecionar-tamanho" data-tamanho="' + tamanhoSeguro + '">' + tamanhoSeguro + '</button>';
  }).join('');

  const cores = Array.isArray(produto.cores) ? produto.cores : [];
  document.getElementById('coresOpcoes').innerHTML = cores.map(function(cor){
    const nomeCor = escaparHtml(cor.nome);
    const hex = /^#[0-9a-f]{6}$/i.test(String(cor.hex || '')) ? cor.hex : '#9a9a95';
    return '<button type="button" class="cor-btn" data-hex="' + hex + '" data-action="selecionar-cor" data-cor="' + nomeCor + '" aria-label="Cor ' + nomeCor + '" title="' + nomeCor + '"></button>';
  }).join('');

  document.querySelectorAll('#coresOpcoes .cor-btn').forEach(function(botao){
    botao.style.background = botao.dataset.hex;
  });

  document.title = String(produto.nome || 'Produto') + ' — Bessa Imports';
}
function trocarFotoGaleria(src, btn){
  document.getElementById('fotoGrande').src = src;
  document.querySelectorAll('.galeria-miniaturas button').forEach(b => b.classList.remove('ativa'));
  btn.classList.add('ativa');
}

function selecionarTamanho(tamanho, btn){
  tamanhoSelecionado = tamanho;
  document.querySelectorAll('.tamanho-btn').forEach(b => b.classList.remove('selecionado'));
  btn.classList.add('selecionado');
  document.getElementById('valorTamanhoEscolhido').textContent = tamanho;
  document.getElementById('erroSelecao').style.display = 'none';
}

function selecionarCor(cor, btn){
  corSelecionada = cor;
  document.querySelectorAll('.cor-btn').forEach(b => b.classList.remove('selecionada'));
  btn.classList.add('selecionada');
  document.getElementById('valorCorEscolhida').textContent = cor;
  document.getElementById('erroSelecao').style.display = 'none';
}

function adicionarAoCarrinhoComOpcoes(){
  if (!produtoAtual) return;
  if (!tamanhoSelecionado || !corSelecionada){
    const erro = document.getElementById('erroSelecao');
    erro.textContent = 'Selecione o tamanho e a cor antes de continuar.';
    erro.style.display = 'block';
    return;
  }
  adicionarAoCarrinho(produtoAtual.id, tamanhoSelecionado, corSelecionada);
}

// ----- Modal "Produtos": abrir / fechar -----
function abrirProdutos(){
  renderizarTodosProdutos();
  document.getElementById('modalProdutosOverlay').classList.add('ativo');
  bloquearScroll();
}
function fecharProdutos(){
  document.getElementById('modalProdutosOverlay').classList.remove('ativo');
  desbloquearScroll();
}

// ----- Carrinho: adicionar produto -----
// tamanho/cor são opcionais — usados quando o produto é adicionado pela página de produto
// ----- Preço e quantidade "autorizados" de um item do carrinho -----
// Ponto central de segurança do carrinho: o preço usado em QUALQUER cálculo ou
// exibição nunca vem do valor salvo no item do carrinho (localStorage) — ele é
// sempre buscado de novo no catálogo (`produtos`, carregado de produtos.json).
// Isso é o que existe pra confiar hoje: um item de carrinho editado manualmente
// no localStorage/console do navegador (id existente com "preco" alterado) é
// ignorado — o preço real do produto prevalece sempre.
// Isso NÃO substitui validação de servidor: como o site ainda não tem backend
// nem pagamento real, esta é a barreira possível no front-end. Antes de acionar
// qualquer pagamento de verdade, o valor final do pedido tem que ser recalculado
// e confirmado num endpoint de servidor (ex: Cloudflare Pages Function) a partir
// só dos IDs e quantidades — nunca aceitando um total enviado pelo cliente.
function precoAutorizado(item){
  const produtoReal = produtos.find(p => p.id === item.id);
  return produtoReal ? produtoReal.preco : item.preco; // fallback só se o catálogo ainda não carregou
}
function quantidadeAutorizada(item){
  const qtd = Math.round(Number(item.qtd));
  if (!Number.isFinite(qtd)) return 1;
  return Math.max(1, Math.min(99, qtd)); // trava contra qtd negativa, zero ou um valor absurdo editado à mão
}

function adicionarAoCarrinho(id, tamanho, cor){
  const produto = produtos.find(p => p.id === id);
  if (!produto) return; // id que não existe no catálogo — ignora
  const itemExistente = carrinho.find(i => i.id === id && i.tamanho === tamanho && i.cor === cor);
  if (itemExistente){
    itemExistente.qtd = quantidadeAutorizada({ qtd: itemExistente.qtd + 1 });
  } else {
    // preco/nome/img são só uma cópia pra exibir rápido — o valor que realmente
    // conta em qualquer cálculo é sempre relido do catálogo (precoAutorizado)
    carrinho.push({
      id: produto.id, nome: produto.nome, preco: produto.preco, img: produto.img, qtd: 1,
      tamanho: tamanho || null, cor: cor || null
    });
  }
  salvarCarrinho();
  atualizarBadge();
  renderizarCarrinho();
  mostrarToast('Produto adicionado!');
}

// ----- Carrinho: remover item (por posição, pois pode haver o mesmo produto em tamanhos/cores diferentes) -----
function removerDoCarrinho(index){
  carrinho.splice(index, 1);
  salvarCarrinho();
  atualizarBadge();
  renderizarCarrinho();
}

// ----- Carrinho: alterar quantidade (por posição) -----
function alterarQuantidade(index, delta){
  const item = carrinho[index];
  if (!item) return;
  item.qtd = quantidadeAutorizada({ qtd: item.qtd + delta });
  salvarCarrinho();
  atualizarBadge();
  renderizarCarrinho();
}

// ----- Abrir / fechar drawer do carrinho -----
function abrirCarrinho(){
  document.getElementById('drawerCarrinho').classList.add('aberto');
  document.getElementById('overlayCarrinho').classList.add('ativo');
  bloquearScroll();
}
function fecharCarrinho(){
  document.getElementById('drawerCarrinho').classList.remove('aberto');
  document.getElementById('overlayCarrinho').classList.remove('ativo');
  desbloquearScroll();
}

// ----- Cupom -----
function aplicarCupom(){
  const input = document.getElementById('inputCupom');
  const msg = document.getElementById('cupomMsg');
  const valor = input.value.trim().toUpperCase();

  if (valor === 'BESSA10'){
    cupomAtivo = 'BESSA10';
    msg.textContent = 'Cupom aplicado: 10% de desconto ✓';
    msg.className = 'cupom-msg ok';
  } else if (valor === ''){
    msg.textContent = '';
    msg.className = 'cupom-msg';
  } else {
    cupomAtivo = null;
    msg.textContent = 'Cupom inválido';
    msg.className = 'cupom-msg erro';
  }
  calcularTotal();
}

// ----- Calcular totais -----
const WHATSAPP_PEDIDOS = '5562995718537';
const FRETE_GRATIS_MINIMO = 299; // valor mínimo pro frete grátis (mesmo da faixa amarela do topo)

function calcularTotal(){
  const subtotal = carrinho.reduce((soma, item) => soma + precoAutorizado(item) * quantidadeAutorizada(item), 0);
  const desconto = cupomAtivo === 'BESSA10' ? subtotal * 0.10 : 0;
  const total = subtotal - desconto;

  document.getElementById('resSubtotal').textContent = formatarPreco(subtotal);
  document.getElementById('resTotal').textContent = formatarPreco(total);

  const linhaDesconto = document.getElementById('linhaDesconto');
  if (desconto > 0){
    linhaDesconto.style.display = 'flex';
    document.getElementById('resDesconto').textContent = '- ' + formatarPreco(desconto);
  } else {
    linhaDesconto.style.display = 'none';
  }

  atualizarFreteGratis(subtotal);
  return { subtotal, desconto, total };
}

// ----- Aviso "faltam R$X para o frete grátis" com barra de progresso -----
function atualizarFreteGratis(subtotal){
  const box = document.getElementById('freteGratisBox');
  const texto = document.getElementById('freteGratisTexto');
  const barra = document.getElementById('freteGratisProgresso');
  if (!box) return;

  box.style.display = 'block';
  const progresso = Math.min(100, (subtotal / FRETE_GRATIS_MINIMO) * 100);
  barra.style.width = progresso + '%';

  if (subtotal >= FRETE_GRATIS_MINIMO){
    box.classList.add('completo');
    texto.innerHTML = '🎉 Você ganhou <strong>frete grátis</strong>!';
  } else {
    box.classList.remove('completo');
    const faltam = FRETE_GRATIS_MINIMO - subtotal;
    texto.innerHTML = `Faltam <strong>${formatarPreco(faltam)}</strong> para o frete grátis`;
  }
}

// ----- Atualizar badge do carrinho -----
function atualizarBadge(){
  const total = carrinho.reduce((soma, item) => soma + quantidadeAutorizada(item), 0);
  document.getElementById('cartBadge').textContent = total;
}

// ----- Renderizar conteúdo do drawer -----
function renderizarCarrinho(){
  const body = document.getElementById('drawerBody');
  const footer = document.getElementById('drawerFooter');

  if (carrinho.length === 0){
    body.innerHTML = `
      <div class="carrinho-vazio">
        <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p>Seu carrinho está vazio</p>
      </div>`;
    footer.style.display = 'none';
    document.getElementById('freteGratisBox').style.display = 'none'; // FIX: some o aviso de frete grátis com o carrinho vazio
    return;
  }

  footer.style.display = 'block';
  body.innerHTML = carrinho.map((item, index) => {
    const preco = precoAutorizado(item); // nunca confia no item.preco salvo — relê do catálogo
    const qtd = quantidadeAutorizada(item);
    return `
    <div class="item-carrinho">
      <img src="${item.img}" alt="${item.nome}">
      <div class="item-info">
        <div>
          <div class="item-nome">${item.nome}</div>
          ${(item.tamanho || item.cor) ? `<div class="item-variacao">${item.tamanho ? 'Tam. ' + item.tamanho : ''}${item.tamanho && item.cor ? ' · ' : ''}${item.cor || ''}</div>` : ''}
          <div class="item-preco">${formatarPreco(preco)}</div>
        </div>
        <div class="item-controles">
          <div class="qtd-controle">
            <button aria-label="Diminuir quantidade" data-action="alterar-qtd" data-index="${index}" data-delta="-1">−</button>
            <span>${qtd}</span>
            <button aria-label="Aumentar quantidade" data-action="alterar-qtd" data-index="${index}" data-delta="1">+</button>
          </div>
          <button class="item-remover" data-action="remover-item" data-index="${index}">Remover</button>
        </div>
      </div>
    </div>
  `;
  }).join('');

  calcularTotal();
}

// ----- Persistência local -----
function salvarCarrinho(){
  localStorage.setItem('bessa_carrinho', JSON.stringify(carrinho));
  localStorage.setItem('bessa_cupom', cupomAtivo || '');
}
function carregarCarrinho(){
  const salvo = localStorage.getItem('bessa_carrinho');
  const cupomSalvo = localStorage.getItem('bessa_cupom');
  let bruto = [];
  try {
    bruto = salvo ? JSON.parse(salvo) : [];
    if (!Array.isArray(bruto)) bruto = [];
  } catch (erro) {
    bruto = []; // localStorage corrompido ou adulterado manualmente — carrinho volta vazio, nunca quebra
  }
  // Mantém só entradas com formato válido; preço e quantidade continuam sendo
  // relidos do catálogo em todo cálculo (precoAutorizado/quantidadeAutorizada),
  // isso aqui só evita guardar lixo/objetos malformados no estado.
  carrinho = bruto.filter(item => item && typeof item.id === 'number' && Number.isFinite(item.id));
  cupomAtivo = cupomSalvo || null;
}

// ----- Toast -----
let toastTimeout;
function mostrarToast(mensagem){
  const toast = document.getElementById('toast');
  document.getElementById('toastTexto').textContent = mensagem;
  toast.classList.add('mostrar');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('mostrar'), 2600);
}

// ----- Checkout: abrir / fechar -----
function abrirCheckout(){
  if (carrinho.length === 0) return;

  const totais = calcularTotal();
  const itens = carrinho.map(function(item, index){
    const preco = precoAutorizado(item);
    const quantidade = quantidadeAutorizada(item);
    const variacoes = [];
    if (item.tamanho) variacoes.push('Tamanho: ' + item.tamanho);
    if (item.cor) variacoes.push('Cor: ' + item.cor);

    return (index + 1) + '. ' + item.nome +
      (variacoes.length ? '\n   ' + variacoes.join(' | ') : '') +
      '\n   Quantidade: ' + quantidade +
      '\n   Valor unitário: ' + formatarPreco(preco) +
      '\n   Total do item: ' + formatarPreco(preco * quantidade);
  }).join('\n\n');

  const linhas = [
    'Olá! Quero fazer este pedido na Bessa Imports:',
    '',
    itens,
    '',
    'Subtotal: ' + formatarPreco(totais.subtotal),
    totais.desconto > 0 ? 'Cupom BESSA10: -' + formatarPreco(totais.desconto) : null,
    'Total dos produtos: ' + formatarPreco(totais.total),
    'Frete: ' + (totais.subtotal >= FRETE_GRATIS_MINIMO ? 'grátis' : 'a combinar pelo WhatsApp'),
    '',
    'Por favor, confirme a disponibilidade, o prazo e as formas de pagamento.'
  ].filter(function(linha){ return linha !== null; });

  const url = 'https://wa.me/' + WHATSAPP_PEDIDOS + '?text=' + encodeURIComponent(linhas.join('\n'));
  window.location.assign(url);
}
function fecharCheckout(){
  document.getElementById('modalOverlay').classList.remove('ativo');
  desbloquearScroll();
}

function renderizarResumoPedido(){
  const { subtotal, desconto, total } = calcularTotal();
  const resumo = document.getElementById('resumoPedido');
  let html = carrinho.map(item => {
    const preco = precoAutorizado(item);
    const qtd = quantidadeAutorizada(item);
    return `<div class="resumo-pedido-item"><span>${qtd}x ${item.nome}</span><span>${formatarPreco(preco * qtd)}</span></div>`;
  }).join('');
  html += `<div class="resumo-pedido-item"><span>Subtotal</span><span>${formatarPreco(subtotal)}</span></div>`;
  if (desconto > 0){
    html += `<div class="resumo-pedido-item"><span>Desconto</span><span>- ${formatarPreco(desconto)}</span></div>`;
  }
  html += `<div class="resumo-pedido-item resumo-pedido-total"><span>Total</span><span>${formatarPreco(total)}</span></div>`;
  resumo.innerHTML = html;
}

// ----- Validação e sanitização de formulários -----
// Regra geral: nunca confiar no que o usuário digita — todo valor de input
// passa por aqui antes de ser usado, comparado ou exibido em tela.

// Remove tags HTML e escapa caracteres especiais. Sempre que um valor digitado
// pelo usuário for inserido de volta na página (ex: innerHTML), ele passa por
// esta função antes — é o que evita um <script> ou onerror="" virar XSS.
function sanitizarTexto(valor){
  if (typeof valor !== 'string') return '';
  return valor
    .trim()
    .replace(/<[^>]*>/g, '') // remove qualquer tag HTML embutida
    .replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]))
    .slice(0, 500); // trava um tamanho máximo razoável contra payloads gigantes
}

// Nome: só letras (com acento), espaços, apóstrofo e hífen — bloqueia números/símbolos/tags
function validarNome(nome){
  return /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]{4,80}$/.test((nome || '').trim());
}

// E-mail: formato real (usuário@domínio.tld), sem espaços, com limite de tamanho (RFC 5321)
function validarEmail(email){
  const limpo = (email || '').trim();
  if (!limpo || limpo.length > 254) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(limpo);
}

// Telefone: entre 10 e 11 dígitos numéricos (DDD + número), ignorando formatação digitada
function validarTelefone(telefone){
  const digitos = (telefone || '').replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 11;
}

// CEP: exatamente 8 dígitos, ignorando hífen/espaços
function validarCEP(cep){
  const digitos = (cep || '').replace(/\D/g, '');
  return digitos.length === 8;
}

// ----- Checkout: validação e envio -----
function validarCampo(id, condicao){
  const campo = document.getElementById(id);
  const erro = document.getElementById('erro' + id.charAt(0).toUpperCase() + id.slice(1));
  const valido = condicao;
  if (!valido){
    campo.classList.add('campo-erro');
    if (erro) erro.style.display = 'block';
  } else {
    campo.classList.remove('campo-erro');
    if (erro) erro.style.display = 'none';
  }
  return valido;
}

function finalizarPedido(e){
  e.preventDefault();

  // Sanitiza tudo antes de validar ou usar — nunca confiar no valor bruto do input
  const nome = sanitizarTexto(document.getElementById('nome').value);
  const email = sanitizarTexto(document.getElementById('email').value);
  const telefone = sanitizarTexto(document.getElementById('telefone').value);
  const cep = sanitizarTexto(document.getElementById('cep').value);
  const endereco = sanitizarTexto(document.getElementById('endereco').value);
  const numero = sanitizarTexto(document.getElementById('numero').value);
  const cidade = sanitizarTexto(document.getElementById('cidade').value);
  const estado = sanitizarTexto(document.getElementById('estado').value);

  let ok = true;
  ok = validarCampo('nome', validarNome(nome)) && ok;
  ok = validarCampo('email', validarEmail(email)) && ok;
  ok = validarCampo('telefone', validarTelefone(telefone)) && ok;
  ok = validarCampo('cep', validarCEP(cep)) && ok;
  ok = validarCampo('endereco', endereco.length > 2) && ok;
  ok = validarCampo('numero', numero.length > 0) && ok;
  ok = validarCampo('cidade', cidade.length > 1) && ok;
  ok = validarCampo('estado', estado.length === 2) && ok;

  if (!ok) return;

  // Simulação de sucesso — nenhum pagamento real é processado
  const modalBody = document.getElementById('modalBody');
  document.getElementById('modalTitulo').textContent = 'Pedido confirmado';
  modalBody.innerHTML = `
    <div class="sucesso-tela">
      <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <h3>Pedido confirmado!</h3>
      <p>Você receberá um e-mail com os detalhes em <strong id="emailConfirmado"></strong>.</p>
      <button class="btn btn-primario btn-voltar-loja" data-action="fechar-checkout-resetar">Voltar à loja</button>
    </div>
  `;
  // FIX XSS: o e-mail nunca é interpolado dentro do HTML — vai por textContent,
  // que trata o valor sempre como texto puro, nunca como código a ser executado.
  document.getElementById('emailConfirmado').textContent = email;

  carrinho = [];
  cupomAtivo = null;
  salvarCarrinho();
  atualizarBadge();
  renderizarCarrinho();
}

function fecharCheckoutEResetar(){
  fecharCheckout();
  setTimeout(() => location.reload(), 300);
}

// ----- Newsletter (se o formulário existir nesta página) -----
const formNewsletterEl = document.getElementById('formNewsletter');
if (formNewsletterEl){
  formNewsletterEl.addEventListener('submit', function(e){
    e.preventDefault();
    const inputEmail = document.getElementById('emailNewsletter');
    const email = sanitizarTexto(inputEmail.value); // nunca confia no valor bruto do input

    if (!validarEmail(email)){
      inputEmail.classList.add('campo-erro');
      mostrarToast('Digite um e-mail válido.');
      return;
    }
    inputEmail.classList.remove('campo-erro');

    document.getElementById('newsletterMsg').style.display = 'block';
    this.reset();
  });
}

// ----- Popup 10% OFF (primeira visita) -----
function abrirPopup(){
  document.getElementById('popupOverlay').classList.add('ativo');
}
function fecharPopup(){
  document.getElementById('popupOverlay').classList.remove('ativo');
  localStorage.setItem('bessa_popup_visto', 'true');
}

// ----- Menu mobile -----
// FIX: abrir/fechar com overlay dedicado, trava de scroll e compensação de scrollbar
function abrirMenu(){
  document.getElementById('menu').classList.add('aberto');
  document.getElementById('menuOverlay').classList.add('ativo');
  bloquearScroll();
}
function fecharMenu(){
  document.getElementById('menu').classList.remove('aberto');
  document.getElementById('menuOverlay').classList.remove('ativo');
  desbloquearScroll();
}
document.querySelectorAll('nav.menu a').forEach(link => {
  // FIX: fecha o menu automaticamente ao clicar em um link (a rolagem suave já vem do scroll-behavior:smooth do html)
  link.addEventListener('click', fecharMenu);
});

// ----- Submenu "Categoria" (dropdown/acordeão) -----
function toggleCategoria(e){
  e.preventDefault();
  e.stopPropagation();
  const item = document.getElementById('categoriaDropdown');
  const toggle = item.querySelector('.menu-dropdown-toggle');
  const aberto = item.classList.toggle('aberto');
  toggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
}
// Fecha o dropdown "Categoria" ao clicar fora dele (comportamento de desktop)
document.addEventListener('click', function(e){
  const item = document.getElementById('categoriaDropdown');
  if (item && item.classList.contains('aberto') && !item.contains(e.target)){
    item.classList.remove('aberto');
    item.querySelector('.menu-dropdown-toggle').setAttribute('aria-expanded', 'false');
  }
});

// ----- Fechar modal clicando fora (elementos existem em todas as páginas) -----
const modalOverlayEl = document.getElementById('modalOverlay');
if (modalOverlayEl){
  modalOverlayEl.addEventListener('click', function(e){
    if (e.target === this) fecharCheckout();
  });
}
const modalProdutosOverlayEl = document.getElementById('modalProdutosOverlay');
if (modalProdutosOverlayEl){
  modalProdutosOverlayEl.addEventListener('click', function(e){
    if (e.target === this) fecharProdutos();
  });
}

const formCheckoutEl = document.getElementById('formCheckout');
if (formCheckoutEl){
  formCheckoutEl.addEventListener('submit', finalizarPedido);
}

// ----- Carrossel de promoções (banner rotativo da home) -----
let carrosselSlideAtual = 0;
let carrosselTimer = null;

function mostrarSlideCarrossel(indice){
  const slides = document.querySelectorAll('.carrossel-slide');
  const dots = document.querySelectorAll('.carrossel-dot');
  if (!slides.length) return;
  carrosselSlideAtual = (indice + slides.length) % slides.length;
  slides.forEach((s, i) => s.classList.toggle('ativo', i === carrosselSlideAtual));
  dots.forEach((d, i) => d.classList.toggle('ativo', i === carrosselSlideAtual));
}
function mudarSlideCarrossel(delta){
  mostrarSlideCarrossel(carrosselSlideAtual + delta);
  reiniciarAutoplayCarrossel();
}
function irParaSlideCarrossel(indice){
  mostrarSlideCarrossel(indice);
  reiniciarAutoplayCarrossel();
}
function reiniciarAutoplayCarrossel(){
  pararAutoplayCarrossel();
  carrosselTimer = setInterval(() => mostrarSlideCarrossel(carrosselSlideAtual + 1), 5000);
}
function pararAutoplayCarrossel(){
  if (carrosselTimer) clearInterval(carrosselTimer);
}
function iniciarCarrossel(){
  const container = document.getElementById('carrossel');
  if (!container) return;
  const slides = document.querySelectorAll('.carrossel-slide');
  document.getElementById('carrosselDots').innerHTML = Array.from(slides).map((_, i) =>
    `<button type="button" class="carrossel-dot${i === 0 ? ' ativo' : ''}" aria-label="Ir para slide ${i + 1}" data-action="ir-para-slide" data-indice="${i}"></button>`
  ).join('');
  reiniciarAutoplayCarrossel();
  container.addEventListener('mouseenter', pararAutoplayCarrossel);
  container.addEventListener('mouseleave', reiniciarAutoplayCarrossel);
}

// ----- Delegação central de eventos -----
// Nenhum onclick/onchange fica escrito no HTML — tudo passa por aqui, via atributos
// data-action. Isso é o que permite rodar com uma CSP sem 'unsafe-inline' em
// script-src (o navegador bloqueia qualquer onclick="" escrito no HTML, mas
// addEventListener() feito pelo próprio script sempre funciona normalmente).
document.addEventListener('click', function(e){
  const alvo = e.target.closest('[data-action]');
  if (!alvo) return;
  const acao = alvo.dataset.action;

  switch (acao){
    case 'abrir-menu': abrirMenu(); break;
    case 'fechar-menu': fecharMenu(); break;
    case 'abrir-carrinho': abrirCarrinho(); break;
    case 'fechar-carrinho': fecharCarrinho(); break;
    case 'abrir-checkout': abrirCheckout(); break;
    case 'fechar-checkout': fecharCheckout(); break;
    case 'fechar-checkout-resetar': fecharCheckoutEResetar(); break;
    case 'abrir-produtos': abrirProdutos(); break;
    case 'fechar-produtos': fecharProdutos(); break;
    case 'fechar-popup': fecharPopup(); break;
    case 'aplicar-cupom': aplicarCupom(); break;
    case 'toggle-categoria': toggleCategoria(e); break;
    case 'carrossel-anterior': mudarSlideCarrossel(-1); break;
    case 'carrossel-proximo': mudarSlideCarrossel(1); break;
    case 'ir-para-slide': irParaSlideCarrossel(Number(alvo.dataset.indice)); break;
    case 'adicionar-carrinho': adicionarAoCarrinho(Number(alvo.dataset.id)); break;
    case 'adicionar-com-opcoes': adicionarAoCarrinhoComOpcoes(); break;
    case 'alterar-qtd': alterarQuantidade(Number(alvo.dataset.index), Number(alvo.dataset.delta)); break;
    case 'remover-item': removerDoCarrinho(Number(alvo.dataset.index)); break;
    case 'filtro-tamanho': alternarFiltroTamanho(alvo.dataset.tamanho, alvo); break;
    case 'trocar-foto': trocarFotoGaleria(alvo.dataset.foto, alvo); break;
    case 'selecionar-tamanho': selecionarTamanho(alvo.dataset.tamanho, alvo); break;
    case 'selecionar-cor': selecionarCor(alvo.dataset.cor, alvo); break;
  }
});

document.addEventListener('change', function(e){
  if (e.target.dataset.action === 'selecionar-ordenacao'){
    selecionarOrdenacao(e.target.value);
  }
});

// ----- Inicialização comum a todas as páginas -----
// FIX 2: altura real da viewport (corrige corte no fundo do menu mobile em navegadores sem 100dvh)
function definirAlturaReal(){
  document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
}
definirAlturaReal();
window.addEventListener('resize', definirAlturaReal, { passive: true });
window.addEventListener('orientationchange', definirAlturaReal, { passive: true });

// A grade de "Ofertas" só existe na home — cada página chama sua própria renderização depois de carregar este arquivo
if (document.getElementById('gridProdutos')){
  iniciarCarrossel(); // não depende do catálogo, pode iniciar na hora
  produtosProntos.then(() => {
    renderizarProdutos();
    renderizarLancamentos();
    renderizarMaisVendidos();
  });
}

// Páginas de categoria, produto e busca: o "parâmetro" da página (slug/termo) vem de
// um atributo data-* no HTML, nunca de um <script> inline — CSP sem 'unsafe-inline'
// bloquearia um <script> escrito direto na página.
const gridVitrineEl = document.getElementById('gridVitrine');
if (gridVitrineEl){
  produtosProntos.then(() => montarVitrineCategoria(gridVitrineEl.dataset.categoria));
}

const produtoDetalheEl = document.getElementById('produtoDetalhe');
if (produtoDetalheEl){
  produtosProntos.then(() => { const slugDaUrl = new URLSearchParams(window.location.search).get('slug'); renderizarProduto(slugDaUrl || produtoDetalheEl.dataset.produtoSlug); });
}

if (document.getElementById('gridBusca')){
  produtosProntos.then(() => executarBusca());
}

carregarCarrinho();
atualizarBadge();
renderizarCarrinho();

// Assim que o catálogo (produtos.json) terminar de carregar, recalcula o carrinho
// com os preços autorizados de verdade — cobre o caso de o carrinho ter sido
// renderizado antes do catálogo chegar (fallback temporário com o preço salvo).
produtosProntos.then(() => {
  atualizarBadge();
  renderizarCarrinho();
});

if (document.getElementById('popupOverlay') && !localStorage.getItem('bessa_popup_visto')){
  setTimeout(abrirPopup, 4000);
}
