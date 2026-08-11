// Recebe o formulário público, valida no servidor e grava com service_role.
// O anon key nunca consegue inserir direto nas tabelas (RLS bloqueia).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  cors,
  erro,
  json,
  dataBR,
  enviarEmail,
  layoutEmail,
  EQUIPE_LABEL,
} from '../_shared/comum.ts'

const MAX_COLABORADORES = 50
const LIMITE_POR_IP_HORA = 5

function cpfValido(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  for (let t = 9; t < 11; t++) {
    let soma = 0
    for (let i = 0; i < t; i++) soma += parseInt(cpf[i]) * (t + 1 - i)
    if (((soma * 10) % 11) % 10 !== parseInt(cpf[t])) return false
  }
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const b = await req.json()

    // ---- honeypot -----------------------------------------------------
    if (b.website) return json({ protocolo: 'F9-0000-0000', token: 'x' }) // finge sucesso

    // ---- rate limit por IP --------------------------------------------
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido'
    const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await sb
      .from('eventos_solicitacao')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'CRIADA')
      .gte('created_at', umaHoraAtras)
      .filter('payload->>ip', 'eq', ip)
    if ((count ?? 0) >= LIMITE_POR_IP_HORA)
      return erro('Muitas solicitações em pouco tempo. Tente novamente mais tarde.', 429)

    // ---- validação ----------------------------------------------------
    const obrig = [
      'equipe',
      'diretor_id',
      'solicitante_nome',
      'solicitante_email',
      'solicitante_whatsapp',
      'data_entrada',
      'data_saida',
      'tipo_hospedagem',
      'obs_transporte',
    ]
    for (const c of obrig) if (!b[c]) return erro(`Campo obrigatório ausente: ${c}`)

    const SERVICOS_OK = ['AEREO', 'RODOVIARIO', 'VAN', 'CARRO', 'HOSPEDAGEM']
    const servicos: string[] = Array.isArray(b.servicos)
      ? [...new Set(b.servicos.filter((s: string) => SERVICOS_OK.includes(s)))]
      : []
    if (servicos.length === 0) return erro('Selecione ao menos um serviço.')

    const temTransporte = servicos.some((s) =>
      ['AEREO', 'RODOVIARIO', 'VAN'].includes(s),
    )
    if (b.data_saida <= b.data_entrada)
      return erro('A data de saída precisa ser posterior à de entrada.')
    if (!EQUIPE_LABEL[b.equipe]) return erro('Equipe inválida.')
    if (b.equipe === 'OUTROS' && !String(b.equipe_outro ?? '').trim())
      return erro('Informe qual é a área quando escolher "Outros".')
    if (servicos.includes('AEREO') && (!b.aeroporto_saida || !b.aeroporto_chegada))
      return erro('Informe os aeroportos de saída e chegada.')

    if (servicos.includes('VAN')) {
      if (
        !String(b.van_local_saida ?? '').trim() ||
        !String(b.van_destino ?? '').trim() ||
        !b.van_data_saida ||
        !b.van_hora_saida
      )
        return erro('Preencha os dados da van: saída, data, horário e destino.')

      // Passageiros é opcional: num ônibus fretado a lista costuma vir depois,
      // e o número pode passar de qualquer teto. Só recusa o que não é número.
      if (b.van_qtd_passageiros != null && b.van_qtd_passageiros !== '') {
        const n = Number(b.van_qtd_passageiros)
        if (!Number.isInteger(n) || n < 1)
          return erro('Quantidade de passageiros inválida.')
      }

      if (!['VAN', 'ONIBUS'].includes(b.van_tipo_veiculo))
        return erro('Selecione se o fretamento é van ou ônibus.')
      const veiculos = Number(b.van_qtd_veiculos)
      if (!Number.isInteger(veiculos) || veiculos < 1 || veiculos > 50)
        return erro('Informe a quantidade de veículos (1 a 50).')
    }

    const carros = Array.isArray(b.carros) ? b.carros : []
    if (servicos.includes('CARRO')) {
      if (carros.length === 0) return erro('Inclua ao menos uma reserva de carro.')
      if (carros.length > 20) return erro('Máximo de 20 reservas de carro.')
      for (const c of carros) {
        if (String(c.condutor_nome ?? '').trim().split(/\s+/).length < 2)
          return erro('Informe o nome completo de cada condutor.')
        if (!cpfValido(String(c.condutor_cpf ?? '')))
          return erro(`CPF inválido para o condutor ${c.condutor_nome}.`)
        if (!['MANUAL', 'AUTOMATICO'].includes(c.transmissao))
          return erro('Selecione o câmbio de cada carro.')
        if (!['HATCH', 'SEDAN', 'SUV'].includes(c.tipo_carro))
          return erro('Selecione o tipo de cada carro.')
        if (!c.retirada_data || !c.devolucao_data)
          return erro('Informe as datas de retirada e devolução de cada carro.')
        if (!c.retirada_hora || !c.devolucao_hora)
          return erro('Informe os horários de retirada e devolução de cada carro.')
        if (String(c.devolucao_data) < String(c.retirada_data))
          return erro('A devolução do carro não pode ser antes da retirada.')
        if (
          String(c.devolucao_data) === String(c.retirada_data) &&
          String(c.devolucao_hora) <= String(c.retirada_hora)
        )
          return erro('No mesmo dia, a devolução precisa ser depois da retirada.')
      }
    }

    if (servicos.includes('RODOVIARIO')) {
      if (!String(b.rodo_regiao_saida ?? '').trim())
        return erro('Informe a região de saída do rodoviário.')
      if (!String(b.rodo_cidade_estado ?? '').trim())
        return erro('Informe a cidade e o estado do rodoviário.')
    }

    if (servicos.includes('VAN')) {
      if (
        !String(b.van_retorno_local ?? '').trim() ||
        !b.van_retorno_data ||
        !b.van_retorno_hora ||
        !String(b.van_retorno_destino ?? '').trim()
      )
        return erro('Preencha os dados de retorno da van.')
      if (String(b.van_retorno_data) < String(b.van_data_saida))
        return erro('O retorno da van não pode ser antes da ida.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.solicitante_email))
      return erro('E-mail do solicitante inválido.')
    if (!/^\d{10,11}$/.test(b.solicitante_whatsapp)) return erro('WhatsApp inválido.')

    // Hospedagem fora do hotel dos passageiros com a operação reservando é o
    // único caso em que a lista de pessoas pode faltar: a empresa de ônibus
    // manda os dados depois. Aí se reserva quarto, não pessoa.
    const reservaPorQuarto =
      b.tipo_hospedagem === 'FORA_HOTEL_PAX' && b.hosp_externa_operacao === true

    if (reservaPorQuarto) {
      const q = Number(b.hosp_qtd_quartos)
      if (!Number.isInteger(q) || q < 1 || q > 200)
        return erro('Informe quantos quartos a operação precisa reservar.')
      if (!['SINGLE', 'DUPLO', 'TRIPLO', 'QUADRUPLO', 'QUINTUPLO'].includes(b.hosp_tipo_quarto))
        return erro('Selecione o tipo de quarto.')
      if (!['COM_CAFE', 'SEM_CAFE'].includes(b.hosp_alimentacao))
        return erro('Selecione a alimentação.')
    }

    const colabs = Array.isArray(b.colaboradores) ? b.colaboradores : []
    if (colabs.length === 0 && !reservaPorQuarto)
      return erro('Inclua ao menos um colaborador.')
    if (colabs.length > MAX_COLABORADORES)
      return erro(`Máximo de ${MAX_COLABORADORES} colaboradores por solicitação.`)

    const cpfsVistos = new Set<string>()
    for (const c of colabs) {
      if (!c.nome_completo || c.nome_completo.trim().split(/\s+/).length < 2)
        return erro(`Nome completo inválido: "${c.nome_completo ?? ''}"`)
      if (!cpfValido(String(c.cpf ?? '')))
        return erro(`CPF inválido para ${c.nome_completo}.`)
      if (cpfsVistos.has(c.cpf))
        return erro(`CPF repetido nesta solicitação: ${c.nome_completo}.`)
      cpfsVistos.add(c.cpf)
      if (!c.data_nascimento) return erro(`Data de nascimento ausente: ${c.nome_completo}.`)
    }

    // Uma solicitação pode cobrir várias operações do MESMO destino.
    const edicaoIds: string[] = Array.isArray(b.edicao_ids)
      ? [...new Set(b.edicao_ids.filter(Boolean))]
      : b.edicao_id
        ? [b.edicao_id]
        : []
    if (edicaoIds.length === 0) return erro('Selecione ao menos uma data da operação.')

    // Operação avulsa (Colab, Universidade Forma, Porto Seguro…): não está no
    // calendário, então o que a identifica é o centro de custo. Sem ele a
    // solicitação chegaria na operação sem dizer de onde veio.
    const { data: avulsas } = await sb
      .from('edicoes')
      .select('id')
      .in('id', edicaoIds)
      .eq('avulsa', true)
    const ehAvulsa = (avulsas ?? []).length > 0
    if (ehAvulsa && !String(b.centro_custo ?? '').trim())
      return erro('Informe o centro de custo desta demanda.')
    if (ehAvulsa && edicaoIds.length > 1)
      return erro('A operação avulsa não pode ser combinada com destinos do calendário.')
    if (edicaoIds.length > 20)
      return erro('Máximo de 20 operações por solicitação.')

    const { data: edicoes } = await sb
      .from('edicoes')
      .select('*')
      .in('id', edicaoIds)
      .eq('ativa', true)
      .order('data_inicio')
    if (!edicoes || edicoes.length !== edicaoIds.length)
      return erro('Alguma das datas selecionadas é inválida ou está inativa.')

    const destinos = new Set(edicoes.map((e) => e.destino))
    if (destinos.size > 1)
      return erro('Todas as datas precisam ser do mesmo destino.')

    // A operação mais antiga vira a "principal": alimenta destino, hotel e
    // as listagens. As demais ficam em solicitacao_edicoes.
    const edicao = edicoes[0]

    const { data: diretor } = await sb
      .from('diretores')
      .select('*')
      .eq('id', b.diretor_id)
      .eq('ativo', true)
      .maybeSingle()
    if (!diretor) return erro('Diretor aprovador inválido.')

    // ---- gravação ------------------------------------------------------
    const token = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')

    const { data: sol, error: e1 } = await sb
      .from('solicitacoes')
      .insert({
        token_acompanhamento: token,
        edicao_id: edicao.id,
        equipe: b.equipe,
        equipe_outro:
          b.equipe === 'OUTROS' ? String(b.equipe_outro).trim().slice(0, 60) : null,
        diretor_id: b.diretor_id,
        solicitante_nome: b.solicitante_nome,
        solicitante_email: b.solicitante_email,
        solicitante_whatsapp: b.solicitante_whatsapp,
        data_entrada: b.data_entrada,
        data_saida: b.data_saida,
        tipo_hospedagem: b.tipo_hospedagem,
        centro_custo: ehAvulsa ? String(b.centro_custo).trim() : null,
        servicos,
        // `precisa_transporte` e `modal` seguem preenchidos por compatibilidade
        // com o que já existia; a fonte de verdade agora é `servicos`.
        precisa_transporte: temTransporte,
        modal: servicos.includes('AEREO')
          ? 'AEREO'
          : servicos.includes('VAN')
            ? 'VAN'
            : servicos.includes('RODOVIARIO')
              ? 'RODOVIARIO'
              : null,
        hosp_externa_operacao: b.hosp_externa_operacao ?? null,
        hosp_externa_obs: b.hosp_externa_obs ?? null,
        hosp_qtd_quartos: reservaPorQuarto ? Number(b.hosp_qtd_quartos) : null,
        hosp_tipo_quarto: reservaPorQuarto ? b.hosp_tipo_quarto : null,
        hosp_alimentacao: reservaPorQuarto ? b.hosp_alimentacao : null,
        aeroporto_saida: servicos.includes('AEREO') ? b.aeroporto_saida : null,
        aeroporto_chegada: servicos.includes('AEREO') ? b.aeroporto_chegada : null,
        tipo_voo: servicos.includes('AEREO') ? (b.tipo_voo ?? null) : null,
        aeroporto_saida_volta: b.aeroporto_saida_volta ?? null,
        aeroporto_chegada_volta: b.aeroporto_chegada_volta ?? null,
        voo_data_ida: servicos.includes('AEREO') ? (b.voo_data_ida ?? null) : null,
        voo_data_volta: b.voo_data_volta ?? null,
        rodo_regiao_saida: servicos.includes('RODOVIARIO')
          ? b.rodo_regiao_saida
          : null,
        rodo_cidade_estado: servicos.includes('RODOVIARIO')
          ? b.rodo_cidade_estado
          : null,
        van_retorno_local: servicos.includes('VAN') ? b.van_retorno_local : null,
        van_retorno_data: servicos.includes('VAN') ? b.van_retorno_data : null,
        van_retorno_hora: servicos.includes('VAN') ? b.van_retorno_hora : null,
        van_retorno_destino: servicos.includes('VAN') ? b.van_retorno_destino : null,
        // Campos legados do condutor único: preenchidos com a primeira
        // reserva, para relatórios antigos continuarem funcionando.
        carro_condutor_nascimento: carros[0]?.condutor_nascimento ?? null,
        precisa_bagagem: servicos.includes('AEREO')
          ? b.precisa_bagagem === true
          : null,
        obs_transporte: b.obs_transporte,
        van_local_saida: servicos.includes('VAN') ? b.van_local_saida : null,
        van_data_saida: servicos.includes('VAN') ? b.van_data_saida : null,
        van_hora_saida: servicos.includes('VAN') ? b.van_hora_saida : null,
        van_destino: servicos.includes('VAN') ? b.van_destino : null,
        van_tipo_veiculo: servicos.includes('VAN') ? b.van_tipo_veiculo : null,
        van_qtd_veiculos: servicos.includes('VAN') ? Number(b.van_qtd_veiculos) : null,
        // Passageiros pode vir em branco — Number('') daria 0 e o banco
        // recusa, então o vazio precisa virar nulo de verdade.
        van_qtd_passageiros:
          servicos.includes('VAN') && b.van_qtd_passageiros
            ? Number(b.van_qtd_passageiros)
            : null,
        precisa_locacao_carro: servicos.includes('CARRO'),
        obs_locacao_carro: b.obs_locacao_carro ?? null,
        carro_condutor_nome: carros[0]?.condutor_nome ?? null,
        carro_condutor_cpf: carros[0]?.condutor_cpf ?? null,
        carro_transmissao: carros[0]?.transmissao ?? null,
      })
      .select('id, protocolo')
      .single()
    if (e1) throw new Error(e1.message)

    const { error: e0 } = await sb
      .from('solicitacao_edicoes')
      .insert(edicoes.map((e) => ({ solicitacao_id: sol.id, edicao_id: e.id })))
    if (e0) {
      await sb.from('solicitacoes').delete().eq('id', sol.id)
      throw new Error(e0.message)
    }

    if (carros.length > 0) {
      const { error: ec } = await sb.from('solicitacao_carros').insert(
        carros.map((c: Record<string, unknown>, i: number) => ({
          solicitacao_id: sol.id,
          condutor_nome: String(c.condutor_nome).trim(),
          condutor_cpf: c.condutor_cpf,
          condutor_nascimento: c.condutor_nascimento ?? null,
          transmissao: c.transmissao,
          tipo_carro: c.tipo_carro,
          local_retirada: c.local_retirada ?? null,
          retirada_data: c.retirada_data ?? null,
          retirada_hora: c.retirada_hora ?? null,
          devolucao_data: c.devolucao_data ?? null,
          devolucao_hora: c.devolucao_hora ?? null,
          ordem: (c.ordem as number) ?? i + 1,
        })),
      )
      if (ec) {
        await sb.from('solicitacoes').delete().eq('id', sol.id)
        throw new Error(ec.message)
      }
    }

    // Sem colaborador não há o que inserir — o insert com array vazio erra.
    const { error: e2 } =
      colabs.length === 0
        ? { error: null }
        : await sb.from('colaboradores').insert(
            colabs.map((c: Record<string, unknown>, i: number) => ({
              solicitacao_id: sol.id,
              nome_completo: String(c.nome_completo).trim(),
              cpf: c.cpf,
              data_nascimento: c.data_nascimento,
              ordem: (c.ordem as number) ?? i + 1,
            })),
          )
    if (e2) {
      await sb.from('solicitacoes').delete().eq('id', sol.id)
      throw new Error(e2.message)
    }

    await sb.from('eventos_solicitacao').insert({
      solicitacao_id: sol.id,
      tipo: 'CRIADA',
      descricao: `Solicitação criada por ${b.solicitante_nome}`,
      payload: { ip, pax: colabs.length, servicos },
    })

    // Avisa a operação no Slack. Falha aqui não pode derrubar a solicitação —
    // ela já está gravada e o painel mostra tudo de qualquer forma.
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notificar-operacao`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ solicitacao_id: sol.id }),
      })
    } catch (e) {
      console.error('Falha ao avisar a operação no Slack:', e)
    }

    // ---- e-mails --------------------------------------------------------
    const site = Deno.env.get('SITE_URL') ?? ''
    const linkAcomp = `${site}/s/${token}`

    await enviarEmail(
      b.solicitante_email,
      `[${sol.protocolo}] Recebemos sua solicitação — ${edicao.destino}`,
      layoutEmail(
        'Solicitação recebida',
        `<p>Olá, ${b.solicitante_nome.split(' ')[0]}!</p>
         <p>Sua solicitação foi registrada sob o protocolo
            <strong style="font-family:monospace">${sol.protocolo}</strong>.</p>
         <table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0">
           <tr><td style="padding:6px 0;color:#64748b;width:150px">Destino</td><td>${edicao.destino} — ${edicao.hotel}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">${edicoes.length > 1 ? 'Operações' : 'Operação'}</td><td>${edicoes
             .map((e) => `${dataBR(e.data_inicio)} a ${dataBR(e.data_fim)}`)
             .join('<br>')}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">Estadia</td><td>${dataBR(b.data_entrada)} a ${dataBR(b.data_saida)}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">Equipe</td><td>${EQUIPE_LABEL[b.equipe]}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">Colaboradores</td><td>${colabs.length}</td></tr>
           <tr><td style="padding:6px 0;color:#64748b">Diretor aprovador</td><td>${diretor.nome}</td></tr>
         </table>
         <p>A equipe operacional vai preencher os dados da viagem e encaminhar para aprovação.
            Você receberá a confirmação final por este e-mail.</p>
         ${site ? `<p><a href="${linkAcomp}" style="background:#1f47b8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Acompanhar solicitação</a></p>` : ''}`,
      ),
    )

    const emailOperacao = Deno.env.get('EMAIL_OPERACAO')
    if (emailOperacao) {
      await enviarEmail(
        emailOperacao,
        `Nova solicitação ${sol.protocolo} — ${edicao.destino} (${colabs.length} pax)`,
        layoutEmail(
          'Nova solicitação recebida',
          `<p><strong>${sol.protocolo}</strong> · ${edicao.destino} — ${edicao.hotel}</p>
           <p>${EQUIPE_LABEL[b.equipe]} · ${colabs.length} pax · ${dataBR(b.data_entrada)} a ${dataBR(b.data_saida)}<br>
              Solicitante: ${b.solicitante_nome} (${b.solicitante_email})<br>
              Aprovador: ${diretor.nome}</p>
           ${site ? `<p><a href="${site}/admin/solicitacoes/${sol.id}">Abrir no painel</a></p>` : ''}`,
        ),
      )
    }

    return json({ protocolo: sol.protocolo, token })
  } catch (e) {
    console.error(e)
    return erro(e instanceof Error ? e.message : 'Erro interno.', 500)
  }
})
