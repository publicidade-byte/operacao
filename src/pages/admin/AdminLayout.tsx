import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { carregarPerfil } from '../Login'
import type { AdminUser } from '../../lib/types'
import { Aviso, Botao, Marca } from '../../components/ui'

const AdminCtx = createContext<AdminUser | null>(null)
export const useAdmin = () => useContext(AdminCtx)

export default function AdminLayout() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<'carregando' | 'deslogado' | 'diretor' | 'negado' | 'ok'>(
    'carregando',
  )
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  /** Também é diretor aprovador: ganha o atalho para a outra área. */
  const [ehDiretor, setEhDiretor] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!vivo) return
      if (!data.session) return setEstado('deslogado')

      const perfil = await carregarPerfil()
      if (!vivo) return
      // A pergunta é "tem cadastro de operação?", não "é diretor?". Quem tem
      // os dois — o diretor geral do departamento, que também acompanha as
      // demandas — entra aqui e continua entrando na área de aprovação.
      if (!perfil?.tem_admin)
        return setEstado(perfil?.tem_diretor ? 'diretor' : 'negado')

      const { data: reg } = await supabase
        .from('admin_users')
        .select('*')
        .eq('id', data.session.user.id)
        .maybeSingle()
      if (!vivo) return
      setAdmin(reg as AdminUser)
      setEhDiretor(!!perfil.tem_diretor)
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
  if (estado === 'diretor') return <Navigate to="/aprovacao" replace />

  if (estado === 'negado')
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Aviso tom="erro">
          Sua conta está autenticada, mas não tem perfil de administrador ativo. Peça ao
          gestor da operação para liberar seu acesso.
        </Aviso>
        <Botao
          variante="secundario"
          className="mt-4 w-full"
          onClick={async () => {
            await supabase.auth.signOut()
            navigate('/login')
          }}
        >
          Sair
        </Botao>
      </div>
    )

  return (
    <AdminCtx.Provider value={admin}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-5">
              <Link to="/admin">
                <Marca sub="Painel operacional" />
              </Link>
              <nav className="flex items-center gap-1 text-xs font-semibold">
                <NavLink
                  to="/admin"
                  end
                  className={({ isActive }) =>
                    'rounded px-2.5 py-1.5 transition ' +
                    (isActive
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100')
                  }
                >
                  Solicitações
                </NavLink>
                {admin?.role === 'GESTOR' && (
                  <NavLink
                    to="/admin/usuarios"
                    className={({ isActive }) =>
                      'rounded px-2.5 py-1.5 transition ' +
                      (isActive
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-600 hover:bg-neutral-100')
                    }
                  >
                    Usuários
                  </NavLink>
                )}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-neutral-500 sm:block">
                {admin?.nome} · {admin?.role === 'GESTOR' ? 'Gestor' : 'Operacional'}
              </span>
              {/* Quem também é diretor aprovador troca de área por aqui, com
                  o mesmo login — sem sair e entrar de novo. */}
              {ehDiretor && (
                <NavLink
                  to="/aprovacao"
                  className="rounded px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                >
                  Minhas aprovações
                </NavLink>
              )}
              {/* Cada pessoa troca a própria senha — ninguém precisa pedir
                  isso para a operação. */}
              <NavLink
                to="/nova-senha"
                className="rounded px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Minha senha
              </NavLink>
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
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </AdminCtx.Provider>
  )
}
