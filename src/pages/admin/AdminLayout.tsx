import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom'
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

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!vivo) return
      if (!data.session) return setEstado('deslogado')

      const perfil = await carregarPerfil()
      if (!vivo) return
      if (perfil?.papel === 'DIRETOR') return setEstado('diretor')
      if (perfil?.papel !== 'ADMIN') return setEstado('negado')

      const { data: reg } = await supabase
        .from('admin_users')
        .select('*')
        .eq('id', data.session.user.id)
        .maybeSingle()
      if (!vivo) return
      setAdmin(reg as AdminUser)
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
            <Link to="/admin">
              <Marca sub="Painel operacional" />
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-neutral-500 sm:block">
                {admin?.nome} · {admin?.role === 'GESTOR' ? 'Gestor' : 'Operacional'}
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
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </AdminCtx.Provider>
  )
}
