export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

export const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status)

/** Cliente admin (service_role). Só existe dentro da Edge Function. */
export function admin() {
  return {
    url: Deno.env.get('SUPABASE_URL')!,
    key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  }
}

export const dataBR = (iso?: string | null) => {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export const dataHoraBR = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

export const moeda = (v?: number | null) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const EQUIPE_LABEL: Record<string, string> = {
  EQUIPE_MEDICA: 'Equipe Médica',
  EQUIPE_TECNICA: 'Equipe Técnica',
  DIRETORIA: 'Diretoria',
  LOJINHA_FORMA: 'Lojinha da Forma',
  FOTIX: 'Fotix',
  COMERCIAL: 'Comercial',
  CONSELHO: 'Conselho',
  RE: 'R.E.',
  MARKETING: 'Marketing',
  MONITORIA: 'Monitoria',
  SEGURANCA: 'Segurança',
  SALVA_VIDAS: 'Salva-Vidas',
  OUTROS: 'Outros',
  DJ: 'DJ',
}

/**
 * Envia e-mail via Resend.
 *
 * Devolve se realmente saiu e, se não, por quê — quem chama precisa poder
 * avisar a operação em vez de deixar parecer que o e-mail foi entregue.
 */
export async function enviarEmail(
  para: string | string[],
  assunto: string,
  html: string,
): Promise<{ enviado: boolean; motivo?: string }> {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!key || !from) {
    const motivo = 'provedor de e-mail não configurado (RESEND_API_KEY / EMAIL_FROM)'
    console.warn(`${motivo} — não enviado:`, assunto)
    return { enviado: false, motivo }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: para, subject: assunto, html }),
  })
  if (!res.ok) {
    const bruto = await res.text()
    console.error('Resend recusou o envio:', bruto)
    return { enviado: false, motivo: explicarFalhaEmail(bruto, from) }
  }
  return { enviado: true }
}

/**
 * Traduz a recusa do provedor para algo acionável.
 *
 * O texto do Resend vem em JSON e em inglês. Jogado direto na tela, quem
 * opera lê um parágrafo técnico e não descobre o que fazer — e o que fazer
 * quase nunca é com ela: é configuração de domínio, feita uma vez só.
 */
function explicarFalhaEmail(bruto: string, remetente: string) {
  let msg = bruto
  try {
    msg = JSON.parse(bruto)?.message ?? bruto
  } catch {
    // resposta não-JSON: fica o texto bruto mesmo
  }

  if (/domain is not verified/i.test(msg)) {
    const dominio = msg.match(/The (\S+) domain/i)?.[1] ?? remetente.split('@').pop()
    return (
      `o domínio ${dominio} ainda não foi verificado no provedor de e-mail. ` +
      `Enquanto isso, nenhum e-mail sai para fora. Quem resolve: adicionar o ` +
      `domínio em resend.com/domains e publicar os registros de DNS que eles indicam.`
    )
  }

  if (/only send testing emails to your own email/i.test(msg)) {
    const dono = msg.match(/\(([^)]+@[^)]+)\)/)?.[1] ?? 'o e-mail dono da conta'
    return (
      `a conta de e-mail ainda está em modo de teste: só entrega em ${dono}. ` +
      `Para enviar a qualquer destinatário é preciso verificar um domínio em ` +
      `resend.com/domains e usar um remetente desse domínio.`
    )
  }

  return `o provedor recusou o envio — ${msg}`
}

// Amarelo da marca (--color-marca-400) sobre preto. O layout usava azul,
// que não é da paleta — branco, cinza, preto e amarelo.
export const AMARELO = '#ffd21a'

export const layoutEmail = (titulo: string, corpo: string) => `
<div style="font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
  <div style="border-bottom:3px solid ${AMARELO};padding-bottom:12px;margin-bottom:24px">
    <span style="font-size:11px;letter-spacing:2px;color:#171717;font-weight:700;background:${AMARELO};padding:2px 6px">FORMA 9</span>
    <h1 style="margin:10px 0 0;font-size:20px;color:#171717">${titulo}</h1>
  </div>
  ${corpo}
  <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
    Mensagem automática do sistema de solicitações do Forma 9.
  </p>
</div>`
