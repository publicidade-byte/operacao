import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Aviso, Botao, Campo, Card, Input, Marca } from '../components/ui'

/**
 * Define uma senha nova.
 *
 * Serve a dois caminhos: quem chegou pelo link de "esqueci minha senha" (o
 * Supabase entrega a sessão de recuperação na própria URL) e quem já está
 * logado e quer trocar. Nos dois casos a troca é feita pelo próprio dono da
 * conta — ninguém digita a senha de outra pessoa.
 */
export default function NovaSenha() {
  const navigate = useNavigate()
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [temSessao, setTemSessao] = useState<boolean | null>(null)

  useEffect(() => {
    // O link de recuperação chega com o token no fragmento da URL; o
    // supabase-js troca isso por uma sessão sozinho, mas leva um instante.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sessao) =>
      setTemSessao(!!sessao),
    )
    supabase.auth.getSession().then(({ data }) => setTemSessao((v) => v ?? !!data.session))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 8) return setErro('A senha precisa ter ao menos 8 caracteres.')
    if (senha !== repetir) return setErro('As duas senhas não são iguais.')

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) return setErro(error.message)
    // Carimba a troca para o painel saber quem ainda está com a senha que o
    // admin definiu. Falhar aqui não invalida a troca, que já aconteceu.
    await supabase.rpc('registrar_troca_senha')
    setOk(true)
  }

  if (temSessao === false)
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Marca sub="Área restrita" />
        <Card className="mt-6">
          <Aviso tom="erro">
            Este link de recuperação não vale mais. Peça um novo na tela de login.
          </Aviso>
          <Botao className="mt-4 w-full" onClick={() => navigate('/login')}>
            Ir para o login
          </Botao>
        </Card>
      </div>
    )

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Marca sub="Área restrita" />
      <Card titulo="Definir nova senha" className="mt-6">
        {ok ? (
          <>
            <Aviso tom="sucesso">Senha alterada. Use a nova senha da próxima vez.</Aviso>
            <Botao className="mt-4 w-full" onClick={() => navigate('/login')}>
              Continuar
            </Botao>
          </>
        ) : (
          <form onSubmit={salvar} className="space-y-4">
            <Campo label="Nova senha" dica="Ao menos 8 caracteres.">
              <Input
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </Campo>
            <Campo label="Repita a nova senha">
              <Input
                type="password"
                autoComplete="new-password"
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
              />
            </Campo>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <Botao type="submit" className="w-full" carregando={salvando}>
              Salvar senha
            </Botao>
          </form>
        )}
      </Card>
    </div>
  )
}
