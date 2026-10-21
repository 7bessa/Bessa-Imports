const CONFIG = {
  spreadsheetId: '1-GdVSxtt7TLKfWtigXnogznYeYj25UgDeqW0AO499Rw',
  sheetId: 0
};

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Bessa Imports | Painel Admin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function listarProdutosAdmin() {
  const sheetInfo = obterPlanilha_();
  const values = lerLinhasCatalogo_(sheetInfo);

  return values.slice(1)
    .filter(function(row) {
      return String(row[sheetInfo.columns.id] || '').trim() !== '';
    })
    .map(function(row) {
      return {
        id: Number(row[sheetInfo.columns.id]),
        nome: String(row[sheetInfo.columns.nome] || ''),
        slug: String(row[sheetInfo.columns.slug] || ''),
        categoria: String(row[sheetInfo.columns.categoria] || ''),
        precoAntigo: converterNumero_(row[sheetInfo.columns.precoAntigo]),
        preco: converterNumero_(row[sheetInfo.columns.preco]),
        img: String(row[sheetInfo.columns.img] || ''),
        cores: String(row[sheetInfo.columns.cores] || ''),
        tamanhos: String(row[sheetInfo.columns.tamanhos] || ''),
        lancamento: ehVerdadeiro_(row[sheetInfo.columns.lancamento]),
        maisVendido: ehVerdadeiro_(row[sheetInfo.columns.maisVendido])
      };
    })
    .sort(function(a, b) { return b.id - a.id; });
}

function adicionarProdutoAdmin(dados) {
  const produto = validarProduto_(dados);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheetInfo = obterPlanilha_();
    const values = lerLinhasCatalogo_(sheetInfo);
    const ids = values.slice(1)
      .map(function(row) { return Number(row[sheetInfo.columns.id]); })
      .filter(function(id) { return Number.isFinite(id); });

    const slugExiste = values.slice(1).some(function(row) {
      return String(row[sheetInfo.columns.slug] || '').trim().toLowerCase() === produto.slug;
    });
    if (slugExiste) throw new Error('Já existe um produto com este endereço. Altere o nome da peça.');

    const id = ids.length ? Math.max.apply(null, ids) + 1 : 1;
    const newRow = new Array(sheetInfo.lastColumn).fill('');
    newRow[sheetInfo.columns.id] = id;
    newRow[sheetInfo.columns.nome] = produto.nome;
    newRow[sheetInfo.columns.slug] = produto.slug;
    newRow[sheetInfo.columns.categoria] = produto.categoria;
    newRow[sheetInfo.columns.precoAntigo] = produto.precoAntigo;
    newRow[sheetInfo.columns.preco] = produto.preco;
    newRow[sheetInfo.columns.img] = produto.img;
    newRow[sheetInfo.columns.cores] = produto.cores;
    newRow[sheetInfo.columns.tamanhos] = produto.tamanhos;
    newRow[sheetInfo.columns.lancamento] = produto.lancamento;
    newRow[sheetInfo.columns.maisVendido] = produto.maisVendido;

    if (sheetInfo.csvStorage) {
      sheetInfo.sheet.appendRow([serializarCSVAdmin_(newRow)]);
    } else {
      sheetInfo.sheet.appendRow(newRow);
    }
    SpreadsheetApp.flush();

    return { id: id, nome: produto.nome };
  } finally {
    lock.releaseLock();
  }
}

function obterPlanilha_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = spreadsheet.getSheetById(CONFIG.sheetId);
  if (!sheet) throw new Error('A aba principal do catálogo não foi encontrada.');

  const lastColumn = sheet.getLastColumn();
  if (sheet.getLastRow() < 1 || lastColumn < 1) {
    throw new Error('A planilha está vazia. Importe primeiro os cabeçalhos e produtos do catálogo.');
  }

  let csvStorage = false;
  let rows = sheet.getDataRange().getValues();
  if (lastColumn === 1) {
    const csvText = rows.map(function(row) { return String(row[0] || ''); }).join('\n');
    const parsed = parseCSVAdmin_(csvText);
    if (parsed.length && parsed[0].length > 1) {
      rows = parsed;
      csvStorage = true;
    }
  }

  const headers = csvStorage
    ? rows[0]
    : sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const positions = {};
  headers.forEach(function(header, index) {
    positions[normalizarCabecalho_(header)] = index;
  });

  const columns = {};
  ['id', 'nome', 'slug', 'categoria', 'precoAntigo', 'preco', 'img', 'cores', 'tamanhos', 'lancamento', 'maisVendido']
    .forEach(function(name) {
      const key = normalizarCabecalho_(name);
      if (positions[key] === undefined) throw new Error('Cabeçalho ausente na planilha: ' + name);
      columns[name] = positions[key];
    });

  return { sheet: sheet, columns: columns, lastColumn: csvStorage ? headers.length : lastColumn, csvStorage: csvStorage };
}

function lerLinhasCatalogo_(sheetInfo) {
  if (sheetInfo.csvStorage) {
    const cells = sheetInfo.sheet.getDataRange().getDisplayValues();
    return parseCSVAdmin_(cells.map(function(row) { return String(row[0] || ''); }).join('\n'));
  }
  return sheetInfo.sheet.getDataRange().getValues();
}

function parseCSVAdmin_(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const caractere = texto[i];
    if (dentroAspas) {
      if (caractere === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campo += caractere;
      }
    } else if (caractere === '"') {
      dentroAspas = true;
    } else if (caractere === ',') {
      linha.push(campo);
      campo = '';
    } else if (caractere === '\n' || caractere === '\r') {
      if (caractere === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      campo = '';
      if (linha.length > 1 || linha[0] !== '') linhas.push(linha);
      linha = [];
    } else {
      campo += caractere;
    }
  }

  if (campo.length || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

function serializarCSVAdmin_(valores) {
  return valores.map(function(valor) {
    const texto = String(valor == null ? '' : valor);
    return /[",\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  }).join(',');
}
function validarProduto_(dados) {
  if (!dados || typeof dados !== 'object') throw new Error('Confira os dados da peça e tente novamente.');

  const nome = String(dados.nome || '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 100) throw new Error('O nome deve ter entre 2 e 100 caracteres.');

  const slug = gerarSlug_(String(dados.slug || nome));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('O endereço da peça é inválido.');

  const categorias = ['camisa', 'short', 'bermuda', 'calca', 'acessorios', 'outros'];
  const categoria = String(dados.categoria || '').trim().toLowerCase();
  if (categorias.indexOf(categoria) === -1) throw new Error('Escolha uma categoria válida.');

  const preco = converterPrecoEntrada_(dados.preco, 'Preço');
  const precoAntigo = String(dados.precoAntigo || '').trim() === ''
    ? preco
    : converterPrecoEntrada_(dados.precoAntigo, 'Preço anterior');

  const img = String(dados.img || '').trim();
  const urlValida = /^https:\/\/[^\s"'<>]+$/i.test(img);
  const caminhoValido = /^\/assets\/[A-Za-z0-9._/-]+$/.test(img);
  if (!urlValida && !caminhoValido) {
    throw new Error('Informe o link HTTPS público da foto ou um caminho dentro de /Bessa-Imports/assets/.');
  }

  const cores = String(dados.cores || '')
    .split(/[\n|]+/)
    .map(function(linha) { return linha.trim(); })
    .filter(Boolean)
    .map(function(linha) {
      const separador = linha.indexOf(':');
      if (separador < 1) throw new Error('Use uma cor por linha no formato Nome:#RRGGBB.');
      const nomeCor = linha.slice(0, separador).trim();
      const hex = linha.slice(separador + 1).trim();
      if (!nomeCor || !/^#[0-9a-f]{6}$/i.test(hex)) {
        throw new Error('Confira as cores. Cada linha deve ter um nome e uma cor hexadecimal de seis dígitos.');
      }
      return nomeCor + ':' + hex;
    });
  if (!cores.length) throw new Error('Cadastre ao menos uma cor para a peça.');

  const tamanhos = String(dados.tamanhos || '')
    .split(',')
    .map(function(tamanho) { return tamanho.trim(); })
    .filter(Boolean);
  if (!tamanhos.length || tamanhos.length > 20) throw new Error('Informe os tamanhos separados por vírgula. Para acessório, use Único.');

  return {
    nome: nome,
    slug: slug,
    categoria: categoria,
    precoAntigo: precoAntigo,
    preco: preco,
    img: img,
    cores: cores.join('|'),
    tamanhos: tamanhos.join(','),
    lancamento: dados.lancamento === true,
    maisVendido: dados.maisVendido === true
  };
}

function gerarSlug_(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizarCabecalho_(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function converterPrecoEntrada_(valor, rotulo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) throw new Error(rotulo + ' inválido.');
  return Math.round(numero * 100) / 100;
}

function converterNumero_(valor) {
  if (typeof valor === 'number') return valor;
  const texto = String(valor || '').trim();
  if (!texto) return 0;
  const normalizado = texto.indexOf(',') >= 0
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function ehVerdadeiro_(valor) {
  return /^(true|verdadeiro|sim|1|x)$/i.test(String(valor || '').trim());
}