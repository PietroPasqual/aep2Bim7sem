'use strict';

const $ = (id) => document.getElementById(id);

const AppState = {
  STATES: { INPUT: 'input', VALIDATING: 'validating', RESULT: 'result', AI_QUERY: 'ai_query' },
  current: 'input',
  data: { unit: 'metric', sexo: 'M' },
  result: null,

  transition(next) {
    const allowed = {
      input:      ['validating'],
      validating: ['input', 'result'],
      result:     ['input', 'ai_query'],
      ai_query:   ['result'],
    };
    if (allowed[this.current]?.includes(next)) {
      this.current = next;
      return true;
    }
    console.warn(`Transição inválida: ${this.current} → ${next}`);
    return false;
  }
};

const Validators = {
  PESO:      /^[1-9]\d{0,2}(?:\.\d)?$/,
  ALTURA_CM: /^[1-9]\d{1,2}(?:\.\d)?$/,
  ALTURA_FT: /^[1-9](?:\.\d{1,2})?$/,
  IDADE:     /^(?:[1-9]|[1-9]\d|1[01]\d|120)$/,

  normalize(value) {
    return String(value).trim().replace(',', '.');
  },

  validate(field, rawValue, unit) {
    const value = this.normalize(rawValue);
    if (!value) return { valid: false, msg: 'Campo obrigatório.' };

    if (field === 'peso') {
      if (!this.PESO.test(value)) {
        return { valid: false, msg: `Peso inválido. Digite um número como 70${unit === 'metric' ? '' : ' (em lb)'}.` };
      }
      const n = parseFloat(value);
      if (unit === 'metric' && (n < 10 || n > 500))
        return { valid: false, msg: 'Peso fora do intervalo válido (10–500 kg).' };
      if (unit === 'imperial' && (n < 22 || n > 999))
        return { valid: false, msg: 'Peso fora do intervalo válido (22–999 lb).' };
    }

    if (field === 'altura') {
      const re = unit === 'metric' ? this.ALTURA_CM : this.ALTURA_FT;
      if (!re.test(value)) {
        return { valid: false, msg: unit === 'metric' ? 'Altura inválida. Digite em cm (ex: 170).' : 'Altura inválida. Digite em ft (ex: 5.7).' };
      }
      const n = parseFloat(value);
      if (unit === 'metric' && (n < 50 || n > 250))
        return { valid: false, msg: 'Altura fora do intervalo válido (50–250 cm).' };
      if (unit === 'imperial' && (n < 1.5 || n > 8.2))
        return { valid: false, msg: 'Altura fora do intervalo válido (1.5–8.2 ft).' };
    }

    if (field === 'idade' && !this.IDADE.test(value)) {
      return { valid: false, msg: 'Idade inválida. Digite entre 1 e 120 anos.' };
    }

    return { valid: true };
  }
};

const DecisionTree = {
  ADULT_SEGMENTS: [
    { max: 18.5, cat: 'Abaixo do Peso',     hex: '#3aa3c9', range: '< 18.5',      risco: 'baixo',      pIni: 0,  pFim: 11,  imcIni: 14,   imcFim: 18.5 },
    { max: 25.0, cat: 'Peso Normal',        hex: '#2fa45c', range: '18.5 – 24.9', risco: 'normal',     pIni: 11, pFim: 36,  imcIni: 18.5, imcFim: 25 },
    { max: 30.0, cat: 'Sobrepeso',          hex: '#dfa018', range: '25.0 – 29.9', risco: 'moderado',   pIni: 36, pFim: 51,  imcIni: 25,   imcFim: 30 },
    { max: 35.0, cat: 'Obesidade Grau I',   hex: '#e3722a', range: '30.0 – 34.9', risco: 'alto',       pIni: 51, pFim: 63,  imcIni: 30,   imcFim: 35 },
    { max: 40.0, cat: 'Obesidade Grau II',  hex: '#d6453a', range: '35.0 – 39.9', risco: 'muito alto', pIni: 63, pFim: 80,  imcIni: 35,   imcFim: 40 },
    { max: Infinity, cat: 'Obesidade Grau III', hex: '#8e2620', range: '≥ 40.0',  risco: 'extremo',    pIni: 80, pFim: 100, imcIni: 40,   imcFim: 50 },
  ],

  classify(imc, idade) {
    if (idade < 18) return this._classifyChild(imc);

    const seg = this.ADULT_SEGMENTS.find(s => imc < s.max) || this.ADULT_SEGMENTS.at(-1);
    return { ...seg, posPonteiro: this._pointerPos(imc, seg) };
  },

  _pointerPos(imc, seg) {
    const t = Math.min(1, Math.max(0, (imc - seg.imcIni) / (seg.imcFim - seg.imcIni)));
    return Math.round(seg.pIni + t * (seg.pFim - seg.pIni));
  },

  _classifyChild(imc) {
    if (imc < 16)   return { cat: 'Muito Abaixo do Peso', hex: '#3aa3c9', range: '< 16',        risco: 'baixo',    posPonteiro: 3 };
    if (imc < 18.5) return { cat: 'Abaixo do Peso',       hex: '#3aa3c9', range: '< 18.5',      risco: 'baixo',    posPonteiro: 7 };
    if (imc < 24)   return { cat: 'Peso Adequado',        hex: '#2fa45c', range: '18.5 – 23.9', risco: 'normal',   posPonteiro: 22 };
    if (imc < 28)   return { cat: 'Sobrepeso',            hex: '#dfa018', range: '24 – 27.9',   risco: 'moderado', posPonteiro: 44 };
    return            { cat: 'Obesidade',                 hex: '#d6453a', range: '≥ 28',        risco: 'alto',     posPonteiro: 65 };
  },

  getRecommendations(classificacao, idade) {
    const base = {
      'Abaixo do Peso': [
        'Aumente o consumo calórico com alimentos nutritivos como abacate, castanhas, ovos e carnes magras.',
        'Realize refeições a cada 3–4 horas, incluindo lanches saudáveis entre as principais refeições.',
        'Pratique exercícios de resistência (musculação) para ganho de massa muscular saudável.',
        'Consulte um nutricionista para um plano alimentar personalizado e um médico para descartar causas subjacentes.',
        'Evite dietas restritivas ou saltar refeições.'
      ],
      'Muito Abaixo do Peso': [
        'Procure avaliação médica com urgência para investigar possíveis causas.',
        'Acompanhamento nutricional intensivo é essencial.',
        'Não inicie exercícios intensos antes de estabilizar o estado nutricional.',
        'Refeições frequentes e alimentos de alta densidade energética são prioritários.'
      ],
      'Peso Normal': [
        'Parabéns! Mantenha seu peso com uma alimentação equilibrada: frutas, verduras, proteínas e grãos integrais.',
        'Pratique pelo menos 150 min/semana de atividade física moderada (caminhada, natação, ciclismo).',
        'Evite o consumo excessivo de alimentos ultraprocessados, açúcar e sódio.',
        'Realize exames preventivos anuais mesmo estando no peso ideal.',
        'Mantenha boa hidratação: pelo menos 2 litros de água por dia.'
      ],
      'Peso Adequado': [
        'Seu peso está adequado para a sua faixa etária.',
        'Mantenha hábitos saudáveis com atividade física regular e alimentação variada.',
        'Acompanhe seu desenvolvimento com seu pediatra regularmente.'
      ],
      'Sobrepeso': [
        'Reduza o consumo de alimentos ultraprocessados, frituras e bebidas açucaradas.',
        'Aumente a ingestão de fibras: vegetais, leguminosas e grãos integrais auxiliam na saciedade.',
        'Estabeleça uma rotina de atividade física: 30 min de caminhada rápida diária já é eficaz.',
        'Controle as porções das refeições e evite comer na frente de telas.',
        'Consulte um médico para avaliar fatores de risco como pressão alta e glicemia.'
      ],
      'Obesidade Grau I': [
        'Adote um déficit calórico moderado com orientação de nutricionista — evite dietas restritivas sem supervisão.',
        'Priorize atividades físicas de baixo impacto: natação, caminhada e ciclismo são excelentes opções.',
        'Monitore regularmente pressão arterial, glicemia e colesterol.',
        'Reduza o consumo de sal, açúcar e gorduras saturadas.',
        'Considere apoio psicológico — mudança de hábitos é um processo que envolve fatores emocionais.'
      ],
      'Obesidade Grau II': [
        'Acompanhamento médico e nutricional regular é fundamental.',
        'O risco cardiovascular é alto — avalie com seu médico a necessidade de exames específicos.',
        'Atividade física deve ser iniciada de forma gradual com orientação profissional.',
        'Intervenção multidisciplinar (médico, nutricionista, psicólogo, educador físico) é a abordagem mais eficaz.',
        'Evite o consumo de álcool e cigarro, que amplificam os riscos associados.'
      ],
      'Obesidade Grau III': [
        'Busque avaliação médica imediata — este nível de IMC é classificado como obesidade mórbida.',
        'Tratamento multidisciplinar intensivo é necessário, podendo incluir cirurgia bariátrica avaliada por especialista.',
        'Qualquer atividade física deve ser iniciada somente com liberação médica.',
        'Cuide da saúde mental — a obesidade grave frequentemente está associada a quadros de ansiedade e depressão.',
        'Apoio familiar e de grupos de suporte pode ser determinante no processo de tratamento.'
      ],
      'Obesidade': [
        'Procure acompanhamento com pediatra e nutricionista para um plano adequado à fase de crescimento.',
        'Priorize atividades físicas divertidas e regulares: esportes, dança, bicicleta.',
        'Reduza bebidas açucaradas e alimentos ultraprocessados no dia a dia.',
        'Envolva a família — mudanças de hábito funcionam melhor quando todos participam.'
      ],
    };

    let recs = base[classificacao] || base['Peso Normal'];

    if (idade >= 60) {
      recs = [...recs, 'Para sua faixa etária, exercícios de equilíbrio e fortalecimento muscular são especialmente importantes para prevenir quedas.'];
    } else if (idade < 18) {
      recs = [...recs, 'Durante a infância e adolescência, o acompanhamento por um pediatra é essencial para avaliar o crescimento adequadamente.'];
    }

    return recs;
  }
};

const fmt = (n, dec = 1) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: dec });

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function markdownLite(texto) {
  return escapeHTML(texto)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function animateReadout(el, target) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = target.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return;
  }
  const dur = 750;
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function setUnit(unit, btn) {
  AppState.data.unit = unit;

  btn.parentElement.querySelectorAll('.unit-btn').forEach(b => {
    const ativo = b === btn;
    b.classList.toggle('active', ativo);
    b.setAttribute('aria-pressed', ativo);
  });

  const cfg = unit === 'metric'
    ? { peso: 'kg', altura: 'cm', phPeso: '70',  phAltura: '170' }
    : { peso: 'lb', altura: 'ft', phPeso: '154', phAltura: '5.7' };

  $('unit-peso').textContent = cfg.peso;
  $('unit-altura').textContent = cfg.altura;
  $('input-peso').placeholder = cfg.phPeso;
  $('input-altura').placeholder = cfg.phAltura;

  ['peso', 'altura', 'idade'].forEach(clearError);
}

function setSexo(sexo, btn) {
  AppState.data.sexo = sexo;
  btn.parentElement.querySelectorAll('.unit-btn').forEach(b => {
    const ativo = b === btn;
    b.classList.toggle('active', ativo);
    b.setAttribute('aria-pressed', ativo);
  });
}

function clearError(field) {
  $(`row-${field}`)?.classList.remove('error');
  const err = $(`err-${field}`);
  if (err) { err.textContent = ''; err.classList.remove('visible'); }
}

function showError(field, msg) {
  $(`row-${field}`)?.classList.add('error');
  const err = $(`err-${field}`);
  if (err) { err.textContent = msg; err.classList.add('visible'); }
}

function validateField(field) {
  const val = $(`input-${field}`).value;
  const result = Validators.validate(field, val, AppState.data.unit);
  result.valid ? clearError(field) : showError(field, result.msg);
  return result.valid;
}

function calcularIMC() {
  if (!AppState.transition('validating')) return;

  const validos = ['peso', 'altura', 'idade'].map(validateField);
  if (validos.includes(false)) {
    AppState.transition('input');
    return;
  }

  let peso   = parseFloat(Validators.normalize($('input-peso').value));
  let altura = parseFloat(Validators.normalize($('input-altura').value));
  const idade = parseInt($('input-idade').value, 10);

  if (AppState.data.unit === 'imperial') {
    peso   *= 0.453592;
    altura *= 30.48;
  }

  const alturaM = altura / 100;
  const imc = peso / (alturaM * alturaM);

  const classificacao = DecisionTree.classify(imc, idade);
  const recomendacoes = DecisionTree.getRecommendations(classificacao.cat, idade);

  const pesoIdealMin = 18.5 * alturaM * alturaM;
  const pesoIdealMax = 24.9 * alturaM * alturaM;

  AppState.result = {
    imc: Math.round(imc * 10) / 10,
    classificacao, recomendacoes,
    peso, altura, idade,
    pesoIdealMin, pesoIdealMax
  };

  AppState.transition('result');
  renderResult();
}

function renderResult() {
  const { imc, classificacao, recomendacoes, peso, altura, pesoIdealMin, pesoIdealMax } = AppState.result;
  const imperial = AppState.data.unit === 'imperial';

  document.documentElement.style.setProperty('--cat-color', classificacao.hex);
  document.documentElement.style.setProperty('--cat-tint', classificacao.hex + '18');

  animateReadout($('imc-valor'), imc);
  $('imc-categoria').textContent = classificacao.cat;
  $('imc-range').textContent = `IMC ${classificacao.range} kg/m²`;

  $('scale-pointer').style.left = '0%';
  setTimeout(() => { $('scale-pointer').style.left = classificacao.posPonteiro + '%'; }, 150);

  if (imperial) {
    $('stat-peso').textContent      = fmt(peso / 0.453592, 1) + ' lb';
    $('stat-altura').textContent    = fmt(altura / 30.48, 1) + ' ft';
    $('stat-ideal-min').textContent = fmt(pesoIdealMin / 0.453592, 1) + ' lb';
    $('stat-ideal-max').textContent = fmt(pesoIdealMax / 0.453592, 1) + ' lb';
  } else {
    $('stat-peso').textContent      = fmt(peso, 1) + ' kg';
    $('stat-altura').textContent    = fmt(altura, 0) + ' cm';
    $('stat-ideal-min').textContent = fmt(pesoIdealMin, 1) + ' kg';
    $('stat-ideal-max').textContent = fmt(pesoIdealMax, 1) + ' kg';
  }

  $('recs-list').innerHTML = recomendacoes.map(r => `
    <div class="rec-item">
      <div class="rec-dot"></div>
      <div class="rec-text">${escapeHTML(r)}</div>
    </div>
  `).join('');

  const sugestoesPorCategoria = {
    'Abaixo do Peso':       ['Como ganhar peso de forma saudável?', 'Quais alimentos têm mais calorias boas?', 'Que exercícios me ajudam a ganhar massa?'],
    'Muito Abaixo do Peso': ['Quando devo buscar um médico?', 'Quais são os riscos do baixo peso?'],
    'Peso Normal':          ['Como manter meu peso ideal?', 'Quais exercícios posso fazer?', 'Como melhorar minha alimentação?'],
    'Peso Adequado':        ['Como me manter saudável?', 'Quais esportes são recomendados para minha idade?'],
    'Sobrepeso':            ['Como emagrecer de forma saudável?', 'O que devo evitar comer?', 'Quanto exercício devo fazer por semana?'],
    'Obesidade Grau I':     ['Como começar a emagrecer?', 'Quais exames devo fazer?', 'Quais exercícios são seguros para mim?'],
    'Obesidade Grau II':    ['Quais são os riscos de saúde?', 'Quando considerar cirurgia bariátrica?', 'Como começar uma dieta com segurança?'],
    'Obesidade Grau III':   ['O que é cirurgia bariátrica?', 'Quais complicações o peso causa?', 'Como pedir ajuda profissional?'],
    'Obesidade':            ['Como criar hábitos saudáveis?', 'Quais atividades físicas são boas para minha idade?'],
  };

  const sugestoes = sugestoesPorCategoria[classificacao.cat] || sugestoesPorCategoria['Peso Normal'];
  const sugContainer = $('ai-suggestions');
  sugContainer.innerHTML = '';
  sugestoes.forEach(texto => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ai-sug';
    chip.textContent = texto;
    chip.addEventListener('click', () => {
      $('ai-input').value = texto;
      $('ai-input').focus();
    });
    sugContainer.appendChild(chip);
  });

  $('ai-response').classList.remove('visible');
  $('ai-response').innerHTML = '';
  $('ai-input').value = '';

  $('screen-input').classList.remove('active');
  $('screen-result').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  if (!AppState.transition('input')) return;
  AppState.result = null;
  $('screen-result').classList.remove('active');
  $('screen-input').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function perguntarIA() {
  const pergunta = $('ai-input').value.trim();
  if (!pergunta || !AppState.result) return;
  if (!AppState.transition('ai_query')) return;

  const btn = $('ai-btn');
  const spinner = $('ai-spinner');
  const response = $('ai-response');

  btn.disabled = true;
  spinner.classList.add('visible');
  response.classList.remove('visible');

  const { imc, classificacao, peso, altura, idade } = AppState.result;
  const sistema = `Você é um assistente educativo de saúde preventiva alinhado à ODS 3 da ONU.
O usuário tem as seguintes características:
- IMC: ${imc} (${classificacao.cat})
- Peso: ${peso.toFixed(1)} kg | Altura: ${altura.toFixed(0)} cm | Idade: ${idade} anos
- Sexo biológico: ${AppState.data.sexo === 'M' ? 'Masculino' : 'Feminino'}

Responda de forma clara, educativa e empática. Baseie-se em evidências científicas. Seja objetivo (máx. 220 palavras).
SEMPRE finalize lembrando que não substitui avaliação profissional. Escreva em português brasileiro.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: sistema,
        messages: [{ role: 'user', content: pergunta }]
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    const texto = (data.content || [])
      .filter(bloco => bloco.type === 'text')
      .map(bloco => bloco.text)
      .join('\n')
      .trim();

    response.innerHTML = texto
      ? markdownLite(texto)
      : '<span class="ai-error">Não foi possível gerar uma resposta agora. Tente novamente.</span>';
    response.classList.add('visible');
    $('ai-input').value = '';
  } catch (e) {
    console.error('Erro no assistente de IA:', e);
    response.innerHTML = '<span class="ai-error">Erro ao conectar com o assistente. Verifique sua conexão e tente novamente.</span>';
    response.classList.add('visible');
  } finally {
    btn.disabled = false;
    spinner.classList.remove('visible');
    AppState.transition('result');
  }
}

document.querySelectorAll('[data-unit]').forEach(btn =>
  btn.addEventListener('click', () => setUnit(btn.dataset.unit, btn)));

document.querySelectorAll('[data-sexo]').forEach(btn =>
  btn.addEventListener('click', () => setSexo(btn.dataset.sexo, btn)));

['peso', 'altura', 'idade'].forEach(field => {
  const input = $(`input-${field}`);
  input.addEventListener('input', () => validateField(field));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); calcularIMC(); }
  });
});

$('btn-calcular').addEventListener('click', calcularIMC);
$('btn-voltar').addEventListener('click', goBack);
$('ai-btn').addEventListener('click', perguntarIA);

$('ai-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !$('ai-btn').disabled) {
    e.preventDefault();
    perguntarIA();
  }
});
