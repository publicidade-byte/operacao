import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { carregarPerfil } from '../Login'
import { Aviso, Botao, Marca } from '../../components/ui'

type Diretor = {
  id: string
  nome: string
  /**
   * Quem está aqui é o super admin, não o diretor dono das solicitações.
   * As telas usam isto para deixar claro em nome de quem se está decidindo.
   */
  super_admin?: boolean
}
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
      // O super admin entra aqui de propósito: ele administra o sistema
      // inteiro e precisa ver esta área para saber o que melhorar. A conta
      // dele tem papel ADMIN, então checar só o papel o barrava.
      const ehDiretor = perfil?.papel === 'DIRETOR'
      const ehSuper = !!perfil?.super_admin
      if (!perfil || (!ehDiretor && !ehSuper)) return setEstado('negado')
      setDiretor({ id: perfil.id, nome: perfil.nome, super_admin: !ehDiretor && ehSuper })
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
              {/* Quem veio do painel operacional precisa do caminho de volta. */}
              {diretor?.super_admin && (
                <Link
                  to="/admin"
                  className="rounded px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                >
                  Painel operacional
                </Link>
              )}
              {/* O diretor também troca a própria senha. */}
              <Link
                to="/nova-senha"
                className="rounded px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Minha senha
              </Link>
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
        <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
          {/* Sem este aviso o super admin poderia decidir achando que está
              apenas olhando. O que ele decidir vai para o histórico com o
              nome dele, e é justo que ele saiba disso antes de clicar. */}
          {diretor?.super_admin && (
            <Aviso tom="destaque">
              Você está aqui como <strong>super admin</strong>, vendo as aprovações de
              todos os diretores. Se decidir alguma coisa, o histórico vai registrar o seu
              nome — não o do diretor responsável.
            </Aviso>
          )}
          <Outlet />
        </main>
      </div>
    </Ctx.Provider>
  )
}
