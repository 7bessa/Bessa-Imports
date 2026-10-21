(function() {
  var mensagem = document.getElementById('mensagem');
  var botao = document.getElementById('abrirPainel');
  var urlInformada = String(window.BESSA_ADMIN_URL || '').trim();

  try {
    var url = new URL(urlInformada);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.includes('/macros/s/')) {
      throw new Error('Endereço não reconhecido.');
    }
    botao.href = url.href;
    botao.hidden = false;
    botao.addEventListener('click', function() {
      mensagem.textContent = 'Abrindo o painel da Bessa Imports…';
    });
    mensagem.textContent = 'Acesse o painel usando a conta Google autorizada.';
  } catch (erro) {
    botao.hidden = true;
    mensagem.textContent = 'O painel ainda precisa ser publicado e conectado. Siga as instruções em PAINEL-ADMIN.md.';
  }
})();