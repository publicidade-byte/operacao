import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Aviso, Botao, Campo, Card, Input, Marca } from '../components/ui'

/** Perfil resolvido pela função meu_perfil() no banco. */
export type Perfil = {
  papel: 'ADMIN' | 'DIRETOR'
  id: string
  nome: string
  /** Super admin: enxerga e opera também a área dos diretores. */
  super_admin?: boolean
}

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
  const [avisoReset, setAvisoReset] = useState('')
  const [enviandoReset, setEnviandoReset] = useState(false)
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

  /**
   * Manda o link de recuperação para o e-mail digitado.
   *
   * A resposta é sempre a mesma, tenha a conta existido ou não: dizer "esse
   * e-mail não existe" entregaria de graça quem tem acesso ao sistema.
   */
  async function recuperar() {
    setErro('')
    setAvisoReset('')
    if (!email.trim()) return setErro('Escreva seu e-mail acima para receber o link.')

    setEnviandoReset(true)
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}nova-senha`,
    })
    setEnviandoReset(false)
    setAvisoReset(
      `Se ${email.trim()} tiver conta aqui, o link para criar uma nova senha chega em instantes. Confira também o spam.`,
    )
  }

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
            {avisoReset && <Aviso tom="sucesso">{avisoReset}</Aviso>}
            <Botao type="submit" className="w-full" carregando={carregando}>
              Entrar
            </Botao>
          </form>
          <button
            type="button"
            onClick={recuperar}
            disabled={enviandoReset}
            className="mt-3 w-full text-center text-xs text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition hover:text-neutral-800 disabled:opacity-50"
          >
            {enviandoReset ? 'Enviando…' : 'Esqueci minha senha'}
          </button>
        </Card>
        <p className="mt-4 text-center text-xs leading-relaxed text-neutral-500">
          Equipe operacional e diretores aprovadores usam o mesmo login — o sistema
          direciona para a área correta.
        </p>
      </div>
    </div>
  )
}
