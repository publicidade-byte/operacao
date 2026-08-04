import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Aviso, Botao, Campo, Card, Input, Marca } from '../components/ui'

/** Perfil resolvido pela função meu_perfil() no banco. */
type Perfil = { papel: 'ADMIN' | 'DIRETOR'; id: string; nome: string }

export async function carregarPerfil(): Promise<Perfil | null> {
  const { data, error } = await supabase.rpc('meu_perfil')
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null
  return (Array.isArray(data) ? data[0] : data) as Perfil
}

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [verificando, setVerificando] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) return setVerificando(false)
      const perfil = await carregarPerfil()
      if (perfil) navigate(destino(perfil), { replace: true })
      else setVerificando(false)
    })()
  }, [navigate])

  const destino = (p: Perfil) => (p.papel === 'ADMIN' ? '/admin' : '/aprovacao')

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })
    if (error) {
      setCarregando(false)
      setErro(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message,
      )
      return
    }
    const perfil = await carregarPerfil()
    setCarregando(false)
    if (!perfil) {
      await supabase.auth.signOut()
      setErro(
        'Sua conta existe, mas ainda não tem perfil liberado. Fale com a equipe operacional.',
      )
      return
    }
    navigate(destino(perfil), { replace: true })
  }

  if (verificando)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-neutral-500">
        Verificando acesso…
      </div>
    )

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Marca sub="Área restrita" />
        </div>
        <Card>
          <form onSubmit={entrar} className="space-y-4">
            <Campo label="E-mail">
              <Input
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Campo>
            <Campo label="Senha">
              <Input
                type="password"
                value={senha}
                autoComplete="current-password"
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </Campo>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <Botao type="submit" className="w-full" carregando={carregando}>
              Entrar
            </Botao>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs leading-relaxed text-neutral-500">
          Equipe operacional e diretores aprovadores usam o mesmo login — o sistema
          direciona para a área correta.
        </p>
      </div>
    </div>
  )
}
