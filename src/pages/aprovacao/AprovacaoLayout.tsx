import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { carregarPerfil } from '../Login'
import { Aviso, Botao, Marca } from '../../components/ui'

type Diretor = { id: string; nome: string }
const Ctx = createContext<Diretor | null>(null)
export const useDiretor = () => useContext(Ctx)

export default function AprovacaoLayout() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<'carregando' | 'deslogado' | 'negado' | 'ok'>(
    'carregando',
  )
  const [diretor, setDiretor] = useState<Diretor | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!vivo) return
      if (!data.session) return setEstado('deslogado')
      const perfil = await carregarPerfil()
      if (!vivo) return
      if (perfil?.papel !== 'DIRETOR') return setEstado('negado')
      setDiretor({ id: perfil.id, nome: perfil.nome })
      setEstado('ok')
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) setEstado('deslogado')
    })
    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (estado === 'carregando')
    return (
      <div className="grid min-h-screen place-items-center text-sm text-neutral-500">
        Verificando acesso…
      </div>
    )

  if (estado === 'deslogado') return <Navigate to="/login" replace />

  if (estado === 'negado')
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Aviso tom="erro">
          Esta área é exclusiva dos diretores aprovadores. Se você é da equipe
          operacional, acesse o painel operacional.
        </Aviso>
        <div className="mt-4 flex gap-2">
          <Botao variante="secundario" onClick={() => navigate('/admin')}>
            Ir para o painel operacional
          </Botao>
          <Botao
            variante="fantasma"
            onClick={async () => {
              await supabase.auth.signOut()
              navigate('/login')
            }}
          >
            Sair
          </Botao>
        </div>
      </div>
    )

  return (
    <Ctx.Provider value={diretor}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link to="/aprovacao">
              <Marca sub="Aprovações" />
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-neutral-500 sm:block">
                {diretor?.nome}
              </span>
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  navigate('/login')
                }}
                className="rounded px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-red-600"
              >
                Sair
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </Ctx.Provider>
  )
}
