// =====================================================================
// Ajuda: passo a passo de cada tela, por perfil.
// As imagens (img/ajuda) são do ambiente de teste, com dados de exemplo.
// =====================================================================
import { papel } from '../store.js';
import { esc, icones } from '../ui.js';

const GRUPOS = {
  inicio: { nome: 'Comece aqui', icone: 'play-circle' },
  tecnico: { nome: 'Técnico', icone: 'wrench' },
  gestor: { nome: 'Gestor e planejador', icone: 'chart-line' },
  admin: { nome: 'Administrador', icone: 'shield-check' },
  duvidas: { nome: 'Dúvidas comuns', icone: 'circle-help' },
};

// Cada tópico: grupo, título, ícone, imagem (img/ajuda/<img>.jpg), link da tela, passos e dica
const TOPICOS = [
  // ---------- Comece aqui ----------
  { g: 'inicio', id: 'entrar', t: 'Entrar no sistema e pedir acesso', ic: 'log-in', img: 'entrar',
    p: ['Abra o endereço do sistema no computador ou no celular.',
      'Quem já tem acesso: digite o e-mail e a senha e clique em <b>Entrar</b>.',
      'Quem é novo: clique em <b>Criar conta</b>, informe nome, e-mail e senha.',
      'A conta fica <b>aguardando liberação</b> até o administrador liberar e escolher o seu perfil.',
      'Esqueceu a senha? Clique em <b>Esqueci minha senha</b>. Se o e-mail não chegar, fale com o administrador.'] },
  { g: 'inicio', id: 'dashboard', t: 'Dashboard: o resumo do dia', ic: 'layout-dashboard', img: 'dash-alertas', link: 'dashboard',
    p: ['A primeira linha mostra os <b>alertas</b>: paradas em aberto, OS atrasadas, preventivas atrasadas e horímetros sem leitura em dia.',
      'Clique em um quadro de alerta para abrir a lista daquele assunto.',
      'Abaixo ficam os <b>indicadores do mês</b> (OEE, disponibilidade, MTBF, MTTR, falhas e custo), com a comparação com o mês anterior.',
      'Mais abaixo, os gráficos: disponibilidade de 12 meses, situação dos equipamentos e as máquinas que mais pararam.'],
    dica: 'Valores em R$ só aparecem para administrador e gestor.' },
  { g: 'inicio', id: 'menu', t: 'Menu, avisos e celular', ic: 'menu', img: 'menu',
    p: ['O menu à esquerda leva a todas as partes do sistema. Você só vê o que o seu perfil pode usar.',
      'No celular, o menu abre pelo botão de três tracinhos no topo.',
      'O <b>sininho</b> no topo mostra os avisos do sistema para você.',
      'No celular, salve o sistema como app (veja o tópico abaixo).'] },
  { g: 'inicio', id: 'instalar-app', t: 'Salvar o sistema como app no celular', ic: 'smartphone',
    p: ['<b>iPhone:</b> abra o sistema no <b>Safari</b>, toque em <b>Compartilhar</b> (o quadrado com a seta para cima, na barra de baixo), role e toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.',
      '<b>Android:</b> abra o sistema no <b>Chrome</b>, toque no menu de três pontinhos (canto de cima) e em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>. Às vezes aparece um botão <b>Instalar</b> direto no aviso do sistema.',
      'Pronto: o ícone da Fer Alvarez aparece na tela do celular e o sistema abre em tela cheia, como um aplicativo.',
      'Ao abrir o sistema pelo navegador do celular, aparece um aviso com esses passos. Toque em <b>Agora não</b> para esconder por 30 dias.'],
    dica: 'Se o endereço do sistema mudar, apague o ícone antigo e salve de novo pelo endereço novo.' },
  { g: 'inicio', id: 'escolher-planta', t: 'Ver uma planta só ou todas', ic: 'building-2',
    p: ['No topo da tela, ao lado do sininho, escolha <b>Todas as plantas</b> ou uma planta (Matriz e as outras).',
      'Com uma planta escolhida, o dashboard, as listas (equipamentos, OS, paradas, preventivas, preditiva, pendências, produção) e os relatórios mostram só os equipamentos dela.',
      'Em <b>Todas as plantas</b>, os indicadores são o total da empresa. O sistema lembra a sua escolha neste aparelho.',
      'Todos os usuários veem todas as plantas. Pendências sem equipamento aparecem em todas.'],
    dica: 'A escolha só aparece quando há duas ou mais plantas ativas.' },
  { g: 'inicio', id: 'perfis-resumo', t: 'O que cada perfil faz', ic: 'users',
    p: ['<b>Administrador</b>: tudo, inclusive liberar usuários, configurações e correções justificadas.',
      '<b>Gestor de manutenção</b>: equipamentos, custos, indicadores, aprova e acompanha as ordens de serviço.',
      '<b>Planejador</b>: cria e programa manutenções e OS, acompanha prazos e pendências.',
      '<b>Técnico</b>: executa as OS, registra horas, peças, paradas, inspeções, horímetros e a produção do turno.',
      '<b>Consulta</b>: só visualiza equipamentos, históricos e indicadores.'] },

  // ---------- Técnico ----------
  { g: 'tecnico', id: 'horimetros', t: 'Fazer a ronda de horímetros', ic: 'gauge', img: 'horimetro-leitura', link: 'horimetros',
    p: ['Abra <b>Horímetros</b> no menu.',
      'Confira a data e a hora da ronda no topo (já vem com agora).',
      'Na linha de cada máquina, digite o valor do mostrador em <b>Nova leitura</b> e tecle <b>Enter</b> (ou clique no botão azul ao lado).',
      'Use os quadros no topo para ver só as atrasadas ou sem leitura.'],
    dica: 'O sistema não aceita leitura menor que a anterior nem maior do que o tempo que passou. Se errou, peça ao administrador para corrigir: a correção fica registrada com justificativa.' },
  { g: 'tecnico', id: 'parada', t: 'Registrar uma parada de máquina', ic: 'octagon-pause', img: 'parada', link: 'paradas/nova',
    p: ['Abra <b>Paradas</b> e clique em <b>Registrar parada</b>.',
      'Escolha a <b>máquina</b>, o <b>motivo</b> e se a parada foi planejada ou não.',
      'Informe a hora em que parou e, se souber, o impacto na produção.',
      'Se já existe uma OS para o problema, ligue a parada a ela.',
      'Clique em <b>Registrar parada</b>. A máquina passa a aparecer como parada ou em manutenção.'] },
  { g: 'tecnico', id: 'iluminacao', t: 'Registrar troca de lâmpadas', ic: 'lightbulb', link: 'iluminacao',
    p: ['Abra <b>Iluminação</b> e clique no ponto de luz (ex.: um vão do galpão ou um poste).',
      'Clique em <b>Registrar troca</b>, informe quantas lâmpadas trocou e o motivo (queimada, fim da vida útil…).',
      'Se a lâmpada nova for de outro tipo ou potência, informe: o ponto é atualizado sozinho.',
      'Limpeza, troca de reator ou outro serviço: use <b>Registrar manutenção</b> e descreva o que foi feito.'],
    dica: 'Trocando todas as lâmpadas do ponto, a vida útil recomeça a contar. Os pontos vencidos aparecem primeiro na lista.' },
  { g: 'tecnico', id: 'encerrar-parada', t: 'Acompanhar e encerrar a parada', ic: 'circle-check', img: 'paradas', link: 'paradas',
    p: ['Em <b>Paradas</b> aparecem as paradas em aberto e há quanto tempo cada uma dura.',
      'Abra a parada para mudar a fase (em reparo, aguardando peças etc.).',
      'Quando a máquina voltar a funcionar, clique em <b>Encerrar parada</b> e informe a hora do retorno.'],
    dica: 'Concluir a OS não encerra a parada. O retorno da máquina é confirmado sempre na própria parada.' },
  { g: 'tecnico', id: 'os-nova', t: 'Abrir uma ordem de serviço (OS)', ic: 'clipboard-plus', img: 'os-nova', link: 'ordens/nova',
    p: ['Abra <b>Ordens de serviço</b> e clique em <b>Nova OS</b>.',
      'Escolha a máquina, o tipo e a prioridade.',
      'Responda se <b>houve falha do equipamento</b>. Isso conta para o MTBF.',
      'Escreva um título curto e descreva o problema: o que acontece, desde quando, onde.',
      'Clique em <b>Abrir OS</b>. O número (OS-ano-número) é criado pelo sistema.'] },
  { g: 'tecnico', id: 'os-executar', t: 'Executar a OS e finalizar o atendimento', ic: 'wrench', img: 'os-ficha', link: 'ordens',
    p: ['Abra a OS na lista de <b>Ordens de serviço</b>. Marque <b>Só as minhas</b> para ver as suas.',
      'Clique em <b>Iniciar execução</b> quando começar o serviço.',
      'Na aba <b>Mão de obra</b>, use <b>Lançar horas</b>. Na aba <b>Peças</b>, use <b>Lançar peça</b> para cada peça trocada.',
      'Se precisar esperar, use <b>Aguardando peças</b> ou <b>Aguardando terceiros</b>; depois, <b>Retomar execução</b>.',
      'No fim, clique em <b>Finalizar atendimento</b> e descreva o que foi feito. A OS fica <b>Atendida</b>.',
      'Quem abriu a OS recebe um aviso, confere e clica em <b>Finalizar OS</b>. Se ainda faltar algo, ele usa <b>Devolver para execução</b> e você recebe o aviso com o motivo.'],
    dica: 'Para finalizar o atendimento é preciso ter pelo menos um lançamento de horas. A máquina parada só volta a operar depois que a OS ligada à parada for finalizada.' },
  { g: 'tecnico', id: 'inspecao', t: 'Registrar uma inspeção preditiva', ic: 'activity', img: 'inspecao', link: 'preditiva/inspecoes/nova',
    p: ['Abra <b>Manutenção preditiva</b> e clique em <b>Registrar inspeção</b>.',
      'Escolha a máquina e a técnica (vibração, termografia, análise de óleo…).',
      'O sistema mostra os pontos de medição da máquina com os limites: digite o valor de cada um.',
      'Se medir um ponto que não está cadastrado, use <b>Medição avulsa</b>.',
      'Escreva o que observou e clique em <b>Salvar inspeção</b>. Valores fora do limite viram alerta no dashboard.'] },
  { g: 'tecnico', id: 'lancar-turno', t: 'Lançar a produção do turno', ic: 'factory', img: 'lancar-turno', link: 'producao?aba=lancar',
    p: ['Abra <b>Produção e OEE</b> e clique em <b>Lançar turno</b>.',
      'Confira o <b>dia em que o turno começou</b> e o <b>turno</b> (o sistema já sugere o turno atual).',
      'Em cada máquina, digite o total produzido no turno (bom + refugo) e quanto foi <b>refugo/sucata</b>, na unidade da máquina.',
      'Deixe em branco a máquina que não produziu neste turno.',
      'Clique em <b>Salvar turno</b>.'],
    dica: 'Cada máquina só pode ter um lançamento por turno. Depois de salvo, só o gestor ou o administrador corrige, com justificativa.' },
  { g: 'tecnico', id: 'pendencias', t: 'Pendências', ic: 'list-todo', img: 'pendencias', link: 'pendencias',
    p: ['Pendência é algo para resolver depois: comprar uma peça, terminar um ajuste, pedir um orçamento.',
      'Em <b>Pendências</b>, clique em <b>Nova pendência</b> (ou crie dentro da própria OS).',
      'No quadro, use <b>Iniciar</b> e <b>Concluir</b> para andar com ela.',
      'Marque <b>Só as minhas</b> para ver as que estão com você.'] },

  // ---------- Gestor e planejador ----------
  { g: 'gestor', id: 'aprovar-os', t: 'Aprovar e programar ordens de serviço', ic: 'badge-check', img: 'os-lista', link: 'ordens',
    p: ['Em <b>Ordens de serviço</b>, os quadros do topo filtram: em andamento, atrasadas, abertas, em execução.',
      'Abra uma OS <b>Aberta</b> e clique em <b>Aprovar</b>.',
      'Use <b>Editar</b> para definir responsável e prazo, e <b>Marcar como planejada</b> quando estiver programada.',
      'Acompanhe o andamento e os custos (mão de obra e peças) na própria OS.'] },
  { g: 'gestor', id: 'preventiva', t: 'Agenda de preventivas', ic: 'calendar-check', img: 'preventiva', link: 'preventiva',
    p: ['Abra <b>Planejamento preventivo</b>. A aba <b>Agenda</b> mostra o que vence, por data ou por horímetro.',
      'Clique em <b>Gerar OS</b> para criar a ordem de serviço de uma preventiva.',
      '<b>Gerar OS da semana</b> cria de uma vez as OS de tudo o que vence na semana.',
      'Quando a OS da preventiva é finalizada, a próxima data é calculada sozinha.',
      'A aba <b>Cumprimento</b> mostra quantas preventivas foram feitas no prazo.'] },
  { g: 'gestor', id: 'planos', t: 'Criar um plano preventivo', ic: 'calendar-plus', img: 'planos', link: 'preventiva?aba=planos',
    p: ['Em <b>Planejamento preventivo</b>, clique em <b>Novo plano</b>.',
      'Escolha a máquina e diga de quanto em quanto tempo: em <b>dias</b> (calendário) ou em <b>horas de horímetro</b>.',
      'Liste as tarefas do plano (o que o técnico deve fazer e conferir).',
      'Salve. O plano entra na agenda.'] },
  { g: 'gestor', id: 'oee', t: 'OEE da planta e por máquina', ic: 'chart-pie', img: 'oee', link: 'producao',
    p: ['Abra <b>Produção e OEE</b>. Escolha o período no topo.',
      'O quadro escuro é o <b>OEE da planta</b>: a média das máquinas, pesando mais as que têm mais horas programadas.',
      '<b>Disponibilidade</b>: quanto do tempo programado a máquina ficou rodando (as paradas tiram).',
      '<b>Performance</b>: quanto ela produziu comparado com a velocidade ideal no tempo em que rodou.',
      '<b>Qualidade</b>: quanto da produção saiu boa (o refugo tira).',
      'Mais abaixo, a tabela por máquina, do maior OEE para o menor, e o botão <b>Baixar Excel</b>.'],
    dica: 'Referência de mercado: 85% ou mais é classe mundial; abaixo de 60% merece atenção.' },
  { g: 'gestor', id: 'indicadores', t: 'Indicadores e relatórios', ic: 'file-bar-chart', img: 'indicadores', link: 'relatorios',
    p: ['Abra <b>Relatórios</b>. Na aba <b>Indicadores</b>, escolha o período e, se quiser, uma máquina.',
      '<b>Disponibilidade</b>: tempo em que a máquina esteve disponível dentro do horário programado.',
      '<b>MTBF</b>: tempo médio entre falhas (quanto maior, melhor).',
      '<b>MTTR</b>: tempo médio para reparar (quanto menor, melhor).',
      'Use <b>Baixar Excel</b> ou <b>Imprimir / PDF</b>. A aba <b>Relatórios</b> tem as listas prontas.'] },
  { g: 'gestor', id: 'calendario', t: 'Calendário de funcionamento', ic: 'calendar-clock', img: 'calendario', link: 'relatorios?aba=calendario',
    p: ['Em <b>Relatórios</b>, abra a aba <b>Calendário de funcionamento</b>.',
      'Informe os horários em que a usina (ou cada máquina) deve trabalhar em cada dia da semana.',
      'Cadastre as <b>exceções</b>: feriados, paradas programadas, turnos extras.'],
    dica: 'Sem o calendário, a disponibilidade e o OEE aparecem como "sem calendário", porque o sistema não sabe quanto tempo cada máquina deveria trabalhar.' },
  { g: 'gestor', id: 'programacao', t: 'Programação semanal da equipe', ic: 'calendar-range', link: 'programacao',
    p: ['Em <b>Programação semanal</b>, cadastre os colaboradores da manutenção no botão <b>Colaboradores</b> (não precisam ter conta).',
      'Clique no <b>+</b> do dia de cada colaborador e marque as pendências da lista, ou escreva outra atividade (ex.: preventiva + lubrificação G01).',
      'Durante a semana, clique em cada atividade e marque <b>Feita</b> ou <b>Não feita</b> (com o motivo). Feita pode concluir a pendência junto.',
      'O topo mostra a <b>eficiência da semana</b>: feitas ÷ programadas, por colaborador e no total.'],
    dica: 'Quem tem conta ligada ao colaborador vê a própria programação e registra o resultado pelo celular.' },
  { g: 'gestor', id: 'pecas', t: 'Peças e custos', ic: 'cog', img: 'pecas', link: 'pecas',
    p: ['Em <b>Peças e componentes</b> fica o catálogo, com o custo de referência de cada peça.',
      'Quando o técnico lança uma peça na OS, o custo do momento é copiado para a OS.',
      'Abra uma peça para ver em quais máquinas e OS ela foi usada.'],
    dica: 'O sistema não controla estoque: ele registra o que foi trocado e quanto custou.' },

  // ---------- Administrador ----------
  { g: 'admin', id: 'liberar', t: 'Liberar quem pediu acesso', ic: 'user-check', img: 'liberar', link: 'usuarios',
    p: ['Abra <b>Usuários e configurações</b>. Quem pediu acesso aparece no topo, em amarelo.',
      'Clique em <b>Liberar</b> e escolha o perfil da pessoa.',
      'Para mudar o perfil depois, ou desativar alguém que saiu, use <b>Editar</b> (desativar pede um motivo).'] },
  { g: 'admin', id: 'perfis', t: 'Permissões de cada perfil', ic: 'shield-check', img: 'perfis', link: 'usuarios',
    p: ['Na aba <b>Perfis e permissões</b> fica a tabela do que cada perfil pode fazer.',
      'Marque ou desmarque para ajustar, por exemplo, se o técnico pode registrar horímetros.',
      'A aba <b>Custo da mão de obra</b> guarda o valor da hora usado nas OS.',
      'A aba <b>Histórico de alterações</b> mostra quem mudou o quê e quando.'] },
  { g: 'admin', id: 'plantas', t: 'Cadastrar as plantas', ic: 'building-2', link: 'usuarios?aba=plantas',
    p: ['Abra <b>Usuários e configurações</b> › aba <b>Plantas</b> e toque em <b>Nova planta</b>.',
      'Informe o nome (ex.: Planta Sul), um código curto (ex.: SUL), a cidade e a ordem na lista. A Matriz já vem cadastrada com todos os equipamentos atuais.',
      'Depois, em cada equipamento, escolha a planta no campo <b>Planta</b> (Editar equipamento). Equipamento novo já vem com a planta escolhida no topo.',
      'Planta não se apaga: quando sai de uso, desmarque <b>Planta ativa</b> — só é possível depois de mudar os equipamentos dela para outra planta.'],
    dica: 'Turnos e horário de funcionamento são os mesmos para todas as plantas.' },
  { g: 'admin', id: 'equipamentos', t: 'Cadastrar equipamentos', ic: 'factory', img: 'equipamentos', link: 'equipamentos',
    p: ['Abra <b>Equipamentos</b> e clique em <b>Novo equipamento</b>.',
      'Preencha TAG (código único), nome, categoria, setor e criticidade.',
      'Informe se a máquina tem horímetro.',
      'Salve. Na ficha da máquina ficam o histórico, as OS, as paradas, as peças, os planos e os documentos.',
      'Para mudar o status (por exemplo, desativar), use <b>Alterar status</b> na ficha. Ele pede o motivo.'] },
  { g: 'admin', id: 'cadastro-oee', t: 'Marcar as máquinas que medem OEE', ic: 'chart-pie', img: 'cadastro-oee', link: 'equipamentos',
    p: ['Abra a máquina em <b>Equipamentos</b> e clique em <b>Editar</b>.',
      'Na parte <b>Produção (OEE)</b>, marque <b>Esta máquina produz e mede OEE</b>.',
      'Informe a <b>unidade de produção</b> (t, peças, cortes…) e a <b>velocidade ideal por hora</b>.',
      'Salve. A máquina passa a aparecer em <b>Lançar turno</b> e no OEE.'],
    dica: 'Velocidade ideal é quanto a máquina produz em 1 hora na velocidade de projeto (ou a melhor velocidade sustentada). Se mudar depois, os turnos já lançados continuam com a velocidade antiga.' },
  { g: 'admin', id: 'turnos', t: 'Cadastrar os turnos', ic: 'clock', img: 'turnos', link: 'producao?aba=turnos',
    p: ['Em <b>Produção e OEE</b>, abra a aba <b>Turnos</b>.',
      'Clique em <b>Novo turno</b> e informe o nome e os horários (por exemplo, Turno A 06:00–14:00).',
      'O turno que passa da meia-noite é entendido sozinho.',
      'Turno que não é mais usado: <b>Desativar</b> (os lançamentos antigos continuam).'] },

  // ---------- Dúvidas comuns ----------
  { g: 'duvidas', id: 'faq-erro', t: 'Lancei um valor errado. E agora?', ic: 'undo-2',
    p: ['Nada é apagado no sistema: tudo o que é corrigido fica registrado.',
      '<b>Leitura de horímetro</b>: o administrador corrige ou anula, com justificativa.',
      '<b>Produção do turno</b>: em <b>Produção e OEE → Lançamentos</b>, o gestor ou o administrador clica em Corrigir ou Anular e escreve o motivo.',
      '<b>Parada</b>: os horários são corrigidos na própria ficha da parada.'] },
  { g: 'duvidas', id: 'faq-menu', t: 'Não aparece um item do menu para mim', ic: 'eye-off',
    p: ['O menu mostra só o que o seu perfil pode usar.', 'Se precisar de uma tela que não aparece, peça ao administrador para revisar o seu perfil.'] },
  { g: 'duvidas', id: 'faq-calendario', t: 'Disponibilidade ou OEE com aviso "sem calendário"', ic: 'calendar-x',
    p: ['O sistema precisa saber o horário em que a máquina deveria trabalhar.', 'Cadastre em <b>Relatórios → Calendário de funcionamento</b>.'] },
  { g: 'duvidas', id: 'faq-performance', t: 'Performance passou de 100%', ic: 'gauge',
    p: ['Isso quer dizer que a máquina produziu mais rápido do que a velocidade ideal cadastrada.',
      'O sistema limita em 100% e mostra um aviso. Revise a velocidade ideal no cadastro da máquina.'] },
  { g: 'duvidas', id: 'faq-turno', t: 'Por que não consigo lançar o turno de novo?', ic: 'copy-x',
    p: ['Cada máquina só tem um lançamento por dia e turno. Se o valor estiver errado, peça a correção ao gestor ou ao administrador.',
      'Também não é possível lançar turno de data futura.'] },
];

const padrao = () => ({ tecnico: 'tecnico', planejador: 'gestor', gestor: 'gestor', consulta: 'inicio', admin: 'inicio' }[papel()] || 'inicio');
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function cartao(tp) {
  return `<article class="card tut-topico" id="tut-${tp.id}">
    <div class="tut-corpo${tp.img ? '' : ' sem-img'}">
      ${tp.img ? `<a class="tut-img" href="img/ajuda/${tp.img}.jpg" target="_blank" rel="noopener" title="Ver a tela em tamanho grande">
        <img src="img/ajuda/${tp.img}.jpg" alt="Tela de exemplo: ${esc(tp.t)}" loading="lazy" width="1280" height="720"></a>` : ''}
      <div class="tut-texto">
        <h3><i data-lucide="${tp.ic}"></i> ${esc(tp.t)}</h3>
        <ol>${tp.p.map((x) => `<li>${x}</li>`).join('')}</ol>
        ${tp.dica ? `<div class="alerta small"><i data-lucide="lightbulb"></i><div>${esc(tp.dica)}</div></div>` : ''}
        ${tp.link ? `<a class="btn btn-sm" href="#/${tp.link}"><i data-lucide="arrow-right"></i> Ir para a tela</a>` : ''}
      </div>
    </div></article>`;
}

export async function render(el) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let grupo = GRUPOS[params.get('aba')] ? params.get('aba') : padrao();
  el.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Ajuda</h1>
      <p>Passo a passo de cada tela, por perfil. As imagens são de exemplo (ambiente de teste).</p></div></div>
    <div class="campo tut-busca"><input type="search" id="tut-q" placeholder="Buscar na ajuda: ex. parada, OEE, senha, horímetro…" aria-label="Buscar na ajuda"></div>
    <div class="abas" role="tablist">${Object.entries(GRUPOS).map(([k, v]) => `<button class="aba" data-g="${k}"><i data-lucide="${v.icone}"></i> ${v.nome}</button>`).join('')}</div>
    <div id="tut-lista"></div>`;
  const lista = el.querySelector('#tut-lista');
  const q = el.querySelector('#tut-q');

  function mostrar() {
    const termo = semAcento(q.value.trim());
    el.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', !termo && b.dataset.g === grupo));
    if (termo) {
      const achados = TOPICOS.filter((tp) => semAcento(tp.t + ' ' + tp.p.join(' ') + ' ' + (tp.dica || '')).replace(/<[^>]+>/g, '').includes(termo));
      lista.innerHTML = achados.length
        ? `<p class="muted">${achados.length} resultado(s) para "${esc(q.value.trim())}"</p>${achados.map((tp) => `<div class="tut-grupo-rotulo">${esc(GRUPOS[tp.g].nome)}</div>${cartao(tp)}`).join('')}`
        : `<div class="alerta aviso"><i data-lucide="search-x"></i><div>Nada encontrado para "${esc(q.value.trim())}". Tente outra palavra.</div></div>`;
    } else {
      lista.innerHTML = TOPICOS.filter((tp) => tp.g === grupo).map(cartao).join('');
    }
    icones();
  }
  el.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => {
    grupo = b.dataset.g; q.value = '';
    history.replaceState(null, '', `${location.pathname}${location.search}#/ajuda?aba=${grupo}`); mostrar();
  }));
  q.addEventListener('input', mostrar);
  mostrar();
}
