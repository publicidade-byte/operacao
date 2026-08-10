import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Aviso, Botao, Card } from '../components/ui'

export default function Enviado() {
  const { protocolo } = useParams()
  const [params] = useSearchParams()
  const token = params.get('t')
  const [copiado, setCopiado] = useState(false)

  // BASE_URL já termina com '/', então não repetir a barra aqui.
  const link = token
    ? `${window.location.origin}${import.meta.env.BASE_URL}s/${token}`
    : null

  // Painel público de consulta. Montado a partir da URL do próprio site em
  // vez de fixo no código: continua certo em produção, em teste local e no
  // dia em que o domínio próprio entrar.
  const linkConsulta = `${window.location.origin}${import.meta.env.BASE_URL}consulta`

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-2xl">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-bold text-neutral-900">Solicitação enviada!</h1>
        <p className="mt-2 text-sm text-neutral-600">
          A equipe operacional já foi notificada e vai preencher os dados da viagem.
        </p>
      </div>

      <Card>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-neutral-500">Protocolo</p>
          <p className="mt-1 font-mono text-2xl font-bold text-neutral-900">{protocolo}</p>
        </div>

        {link && (
          <div className="mt-6">
            <p className="mb-1.5 text-sm font-medium text-neutral-700">
              Link de acompanhamento
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-600"
              />
              <Botao
                variante="secundario"
                onClick={() => {
                  navigator.clipboard.writeText(link)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 2000)
                }}
              >
                {copiado ? 'Copiado!' : 'Copiar'}
              </Botao>
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">
              Guarde este link — é por ele que você acompanha o andamento.
            </p>
          </div>
        )}

        <div className="mt-6">
          <Aviso>
            <strong>O que acontece agora:</strong>
            <ol className="mt-2 ml-4 list-decimal space-y-1 text-neutral-600">
              <li>A operação cota voos, hospedagem e locação.</li>
              <li>A solicitação vai para aprovação do diretor que você escolheu.</li>
              <li>
                Acompanhe a sua solicitação através do link:{' '}
                {/* Montado a partir da própria URL do site: assim continua
                    certo em produção, em teste local e no dia em que o
                    domínio próprio for configurado. */}
                <a
                  href={linkConsulta}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-medium text-neutral-800 underline decoration-marca-400 decoration-2 underline-offset-2"
                >
                  {linkConsulta}
                </a>
              </li>
            </ol>
          </Aviso>
        </div>
      </Card>

      <div className="mt-6 text-center">
        <Link to="/" className="text-sm font-medium text-neutral-700 hover:underline">
          Fazer outra solicitação
        </Link>
      </div>
    </div>
  )
}
