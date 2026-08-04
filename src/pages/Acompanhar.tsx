import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { invocar } from '../lib/supabase'
import { dataBR } from '../lib/format'
import { STATUS_CLASS, STATUS_LABEL, STATUS_ORDEM, equipeLabel } from '../lib/constants'
import { Aviso, Card, Etiqueta } from '../components/ui'

/** Versão reduzida devolvida pela Edge Function: sem CPF, sem preços. */
type Publica = {
  protocolo: string
  status: string
  destino: string
  hotel: string
  evento_inicio: string
  evento_fim: string
  data_entrada: string
  data_saida: string
  equipe: string
  tipo_hospedagem: string
  precisa_transporte: boolean
  modal: string | null
  aeroporto_saida: string | null
  aeroporto_chegada: string | null
  precisa_locacao_carro: boolean
  diretor: string
  colaboradores: { nome_completo: string }[]
  viagem?: {
    colaborador: string
    voos: {
      trecho: string
      companhia: string | null
      numero_voo: string | null
      partida: string | null
      chegada: string | null
      aeroporto_origem: string | null
      aeroporto_destino: string | null
      localizador: string | null
    }[]
    rodoviario: { empresa: string | null; horario_ida: string | null; horario_volta: string | null } | null
    hospedagem: { hotel: string | null; check_in: string | null; check_out: string | null; codigo_reserva: string | null } | null
  }[]
}

export default function Acompanhar() {
  const { token } = useParams()
  const [dados, setDados] = useState<Publica | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    invocar<Publica>('consultar-solicitacao', { token })
      .then(setDados)
      .catch((e) => setErro(e.message))
  }, [token])

  if (erro)
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Aviso tom="erro">
          Não foi possível carregar esta solicitação. Verifique o link ou fale com a
          operação. <span className="block text-xs opacity-70">({erro})</span>
        </Aviso>
      </div>
    )

  if (!dados)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-neutral-500">
        Carregando…
      </div>
    )

  const idxAtual = STATUS_ORDEM.indexOf(dados.status)

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <p className="font-mono text-sm text-neutral-500">{dados.protocolo}</p>
        <h1 className="mt-1 text-2xl font-bold">
          {dados.destino} — {dados.hotel}
        </h1>
        <Etiqueta className={`mt-2 ${STATUS_CLASS[dados.status]}`}>
          {STATUS_LABEL[dados.status]}
        </Etiqueta>
      </header>

      {/* Linha do tempo */}
      {idxAtual >= 0 && (
        <Card className="mb-5">
          <ol className="flex items-center">
            {STATUS_ORDEM.map((s, i) => (
              <li key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className={
                      'grid size-6 place-items-center rounded-full text-[10px] font-bold ' +
                      (i <= idxAtual
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-200 text-neutral-400')
                    }
                  >
                    {i < idxAtual ? '✓' : i + 1}
                  </span>
                  <span
                    className={
                      'w-16 text-center text-[10px] leading-tight ' +
                      (i <= idxAtual ? 'text-neutral-700' : 'text-neutral-400')
                    }
                  >
                    {STATUS_LABEL[s]}
                  </span>
                </div>
                {i < STATUS_ORDEM.length - 1 && (
                  <span
                    className={
                      'mb-5 h-0.5 flex-1 ' + (i < idxAtual ? 'bg-marca-500' : 'bg-neutral-200')
                    }
                  />
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {dados.status === 'REPROVADA' && (
        <div className="mb-5">
          <Aviso tom="erro">
            Esta solicitação foi reprovada pelo diretor. Fale com a operação para entender
            os próximos passos.
          </Aviso>
        </div>
      )}

      <Card titulo="Dados da solicitação" className="mb-5">
        <dl className="divide-y divide-neutral-100 text-sm">
          <Item t="Evento">
            {dataBR(dados.evento_inicio)} a {dataBR(dados.evento_fim)}
          </Item>
          <Item t="Sua estadia">
            {dataBR(dados.data_entrada)} a {dataBR(dados.data_saida)}
          </Item>
          <Item t="Equipe">{equipeLabel(dados.equipe)}</Item>
          <Item t="Hospedagem">
            {dados.tipo_hospedagem === 'HOTEL_PAX' ? 'Hotel do pax' : 'Fora do hotel do pax'}
          </Item>
          <Item t="Transporte">
            {!dados.precisa_transporte
              ? 'Não solicitado'
              : dados.modal === 'AEREO'
                ? `Aéreo · ${dados.aeroporto_saida} → ${dados.aeroporto_chegada}`
                : 'Rodoviário'}
          </Item>
          <Item t="Locação de carro">{dados.precisa_locacao_carro ? 'Sim' : 'Não'}</Item>
          <Item t="Diretor aprovador">{dados.diretor}</Item>
          <Item t="Colaboradores">
            <ul>
              {dados.colaboradores.map((c, i) => (
                <li key={i}>{c.nome_completo}</li>
              ))}
            </ul>
          </Item>
        </dl>
      </Card>

      {dados.viagem && dados.viagem.length > 0 && (
        <Card titulo="Dados da viagem">
          <div className="space-y-5">
            {dados.viagem.map((v, i) => (
              <div key={i} className="rounded-lg bg-neutral-50 p-3.5 text-sm">
                <p className="font-semibold text-neutral-800">{v.colaborador}</p>
                {v.voos.map((voo, j) => (
                  <p key={j} className="mt-1.5 text-neutral-600">
                    <span className="font-medium text-neutral-700">{voo.trecho}</span>{' '}
                    {voo.companhia} {voo.numero_voo} · {voo.aeroporto_origem} →{' '}
                    {voo.aeroporto_destino}
                    {voo.localizador && (
                      <span className="ml-1 font-mono text-xs">({voo.localizador})</span>
                    )}
                  </p>
                ))}
                {v.rodoviario?.empresa && (
                  <p className="mt-1.5 text-neutral-600">Ônibus: {v.rodoviario.empresa}</p>
                )}
                {v.hospedagem?.hotel && (
                  <p className="mt-1.5 text-neutral-600">
                    Hotel: {v.hospedagem.hotel} · {dataBR(v.hospedagem.check_in)} a{' '}
                    {dataBR(v.hospedagem.check_out)}
                    {v.hospedagem.codigo_reserva && ` · reserva ${v.hospedagem.codigo_reserva}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="mt-8 text-center text-xs text-neutral-400">
        Por segurança, esta página não exibe CPF nem valores.
      </p>
    </div>
  )
}

function Item({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5">
      <dt className="w-36 shrink-0 text-neutral-500">{t}</dt>
      <dd className="flex-1 text-neutral-800">{children}</dd>
    </div>
  )
}
