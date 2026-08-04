import { useCallback, useEffect, useState } from 'react'
import { supabase, invocarComoUsuario } from '../../lib/supabase'
import { useAdmin } from './AdminLayout'
import { dataHoraBR } from '../../lib/format'
import {
  Aviso,
  Botao,
  Campo,
  Card,
  Etiqueta,
  Input,
  Radios,
  Select,
  Vazio,
} from '../../components/ui'

type Usuario = {
  id: string | null
  nome: string
  email: string
  nivel: 'SUPER_ADMIN' | 'GESTOR' | 'OPERACIONAL' | 'DIRETORIA'
  ativo: boolean
  super_admin: boolean
  created_at: string | null
  diretor_id: string | null
  slack_user_id: string | null
}

const NIVEL_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  GESTOR: 'Gestor',
  OPERACIONAL: 'Operacional',
  DIRETORIA: 'Diretoria',
}

const NIVEL_CLASSE: Record<string, string> = {
  SUPER_ADMIN: 'bg-neutral-900 text-white ring-neutral-900',
  GESTOR: 'bg-marca-100 text-neutral-900 ring-marca-400',
  OPERACIONAL: 'bg-neutral-100 text-neutral-700 ring-neutral-300',
  DIRETORIA: 'bg-white text-neutral-800 ring-neutral-400',
}

const NIVEL_DESCRICAO: Record<string, string> = {
  OPERACIONAL: 'Preenche solicitações e acompanha o fluxo. Não administra usuários.',
  GESTOR: 'Tudo do operacional, mais cadastro e administração de usuários.',
  DIRETORIA: 'Aprova solicitações na área da diretoria. Não vê CPF nem o painel operacional.',
  SUPER_ADMIN: 'Conta protegida do sistema. Não pode ser desativada nem rebaixada.',
}

export default function Usuarios() {
  const admin = useAdmin()
  const [lista, setLista] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  // formulário de criação
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nivel, setNivel] = useState('OPERACIONAL')
  const [diretorId, setDiretorId] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})

  // diretores ainda sem login, para vincular em vez de duplicar
  const [semLogin, setSemLogin] = useState<{ id: string; nome: string }[]>([])

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_usuarios')
      .select('*')
      .order('nivel')
    if (error) setMsg({ tom: 'erro', texto: error.message })
    const us = (data ?? []) as Usuario[]
    setLista(us)
    setSemLogin(
      us
        .filter((u) => u.nivel === 'DIRETORIA' && !u.id)
        .map((u) => ({ id: u.diretor_id!, nome: u.nome })),
    )
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const ehGestor = admin?.role === 'GESTOR'

  function gerarSenha() {
    const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%'
    const s = Array.from(crypto.getRandomValues(new Uint8Array(14)))
      .map((n) => abc[n % abc.length])
      .join('')
    setSenha(s)
  }

  async function criar() {
    const e: Record<string, string> = {}
    if (nome.trim().split(/\s+/).length < 2) e.nome = 'Informe nome e sobrenome.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = 'E-mail inválido.'
    if (senha.length < 8) e.senha = 'Mínimo de 8 caracteres.'
    setErros(e)
    if (Object.keys(e).length) return

    setSalvando(true)
    setMsg(null)
    try {
      await invocarComoUsuario('gerir-usuarios', {
        acao: 'criar',
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        senha,
        nivel,
        diretor_id: nivel === 'DIRETORIA' && diretorId ? diretorId : null,
      })
      setMsg({
        tom: 'sucesso',
        texto: `${nome.trim()} criado. Passe a senha por um canal seguro e peça que troque no primeiro acesso.`,
      })
      setNome('')
      setEmail('')
      setSenha('')
      setDiretorId('')
      carregar()
    } catch (err) {
      setMsg({ tom: 'erro', texto: err instanceof Error ? err.message : 'Erro ao criar.' })
    } finally {
      setSalvando(false)
    }
  }

  async function acao(corpo: Record<string, unknown>, sucesso: string) {
    setSalvando(true)
    setMsg(null)
    try {
      await invocarComoUsuario('gerir-usuarios', corpo)
      setMsg({ tom: 'sucesso', texto: sucesso })
      carregar()
    } catch (err) {
      setMsg({ tom: 'erro', texto: err instanceof Error ? err.message : 'Erro na operação.' })
    } finally {
      setSalvando(false)
    }
  }

  if (!ehGestor)
    return (
      <Aviso tom="erro">
        Esta seção é restrita a gestores. Peça a um gestor para liberar seu acesso.
      </Aviso>
    )

  const operacionais = lista.filter((u) => u.nivel !== 'DIRETORIA')
  const diretoria = lista.filter((u) => u.nivel === 'DIRETORIA')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-neutral-900">Usuários</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cadastre quem acessa o sistema e defina o nível de permissão.
        </p>
      </div>

      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}

      {/* ---------- Cadastro ---------- */}
      <Card
        titulo="Cadastrar novo usuário"
        descricao="A conta é criada já confirmada — a pessoa entra direto com a senha definida aqui."
      >
        <div className="space-y-5">
          <Campo label="Nível de permissão" obrigatorio={false}>
            <Radios
              valor={nivel}
              colunas={1}
              onChange={(v) => setNivel(v)}
              opcoes={[
                {
                  value: 'OPERACIONAL',
                  label: 'Operacional',
                  descricao: NIVEL_DESCRICAO.OPERACIONAL,
                },
                {
                  value: 'GESTOR',
                  label: 'Operacional — Gestor',
                  descricao: NIVEL_DESCRICAO.GESTOR,
                },
                {
                  value: 'DIRETORIA',
                  label: 'Diretoria',
                  descricao: NIVEL_DESCRICAO.DIRETORIA,
                },
              ]}
            />
          </Campo>

          {nivel === 'DIRETORIA' && semLogin.length > 0 && (
            <Campo
              label="Vincular a um diretor já cadastrado"
              obrigatorio={false}
              dica="Escolha se a pessoa já aparece na lista de aprovadores. Deixe em branco para criar um novo."
            >
              <Select value={diretorId} onChange={(e) => setDiretorId(e.target.value)}>
                <option value="">Criar novo diretor</option>
                {semLogin.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </Select>
            </Campo>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nome completo" erro={erros.nome}>
              <Input
                value={nome}
                erro={!!erros.nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Campo>
            <Campo label="E-mail" erro={erros.email}>
              <Input
                type="email"
                value={email}
                erro={!!erros.email}
                autoComplete="off"
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>
          </div>

          <Campo
            label="Senha provisória"
            erro={erros.senha}
            dica="Mínimo 8 caracteres. Envie por canal seguro e peça troca no primeiro acesso."
          >
            <div className="flex gap-2">
              <Input
                value={senha}
                erro={!!erros.senha}
                autoComplete="new-password"
                onChange={(e) => setSenha(e.target.value)}
                className="font-mono"
              />
              <Botao variante="secundario" onClick={gerarSenha} className="shrink-0">
                Gerar
              </Botao>
            </div>
          </Campo>

          <Botao onClick={criar} carregando={salvando}>
            Criar usuário
          </Botao>
        </div>
      </Card>

      {/* ---------- Operacional ---------- */}
      <Card titulo={`Operação (${operacionais.length})`}>
        {carregando ? (
          <Vazio>Carregando…</Vazio>
        ) : operacionais.length === 0 ? (
          <Vazio>Nenhum usuário operacional cadastrado.</Vazio>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {operacionais.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-neutral-900">
                    {u.nome}
                    <Etiqueta className={NIVEL_CLASSE[u.nivel]}>
                      {NIVEL_LABEL[u.nivel]}
                    </Etiqueta>
                    {!u.ativo && (
                      <Etiqueta className="bg-neutral-100 text-neutral-400 ring-neutral-200">
                        inativo
                      </Etiqueta>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {u.email}
                    {u.created_at && ` · desde ${dataHoraBR(u.created_at)}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {u.super_admin ? (
                    <span className="text-xs text-neutral-400">conta protegida</span>
                  ) : (
                    <>
                      <Select
                        value={u.nivel}
                        className="w-auto py-1.5 text-xs"
                        onChange={(e) =>
                          acao(
                            { acao: 'nivel', id: u.id, nivel: e.target.value },
                            `${u.nome} agora é ${NIVEL_LABEL[e.target.value]}.`,
                          )
                        }
                      >
                        <option value="OPERACIONAL">Operacional</option>
                        <option value="GESTOR">Gestor</option>
                      </Select>
                      <Botao
                        variante="secundario"
                        className="px-2.5 py-1.5 text-xs"
                        onClick={() => {
                          const s = prompt(`Nova senha para ${u.nome} (mín. 8):`)
                          if (s) acao({ acao: 'senha', id: u.id, senha: s }, 'Senha alterada.')
                        }}
                      >
                        Senha
                      </Botao>
                      <Botao
                        variante={u.ativo ? 'secundario' : 'primario'}
                        className="px-2.5 py-1.5 text-xs"
                        onClick={() =>
                          acao(
                            { acao: u.ativo ? 'desativar' : 'ativar', id: u.id },
                            u.ativo ? `${u.nome} desativado.` : `${u.nome} reativado.`,
                          )
                        }
                      >
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </Botao>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- Diretoria ---------- */}
      <Card
        titulo={`Diretoria (${diretoria.length})`}
        descricao="Aprovadores. Quem estiver sem login não consegue decidir no sistema."
      >
        {carregando ? (
          <Vazio>Carregando…</Vazio>
        ) : diretoria.length === 0 ? (
          <Vazio>Nenhum diretor cadastrado.</Vazio>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {diretoria.map((u) => (
              <li
                key={u.diretor_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-neutral-900">
                    {u.nome}
                    {!u.id && (
                      <Etiqueta className="bg-red-50 text-red-700 ring-red-300">
                        sem login
                      </Etiqueta>
                    )}
                    {!u.ativo && (
                      <Etiqueta className="bg-neutral-100 text-neutral-400 ring-neutral-200">
                        inativo
                      </Etiqueta>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {u.email}
                    {u.slack_user_id ? ` · Slack ${u.slack_user_id}` : ' · sem ID do Slack'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Botao
                    variante="secundario"
                    className="px-2.5 py-1.5 text-xs"
                    onClick={() => {
                      const s = prompt(
                        `ID do usuário no Slack para ${u.nome} (ex.: U01ABCDEF).\nDeixe vazio para remover:`,
                        u.slack_user_id ?? '',
                      )
                      if (s !== null)
                        acao(
                          { acao: 'slack', diretor_id: u.diretor_id, slack_user_id: s },
                          'ID do Slack atualizado.',
                        )
                    }}
                  >
                    Slack
                  </Botao>
                  {u.id && (
                    <Botao
                      variante="secundario"
                      className="px-2.5 py-1.5 text-xs"
                      onClick={() => {
                        const s = prompt(`Nova senha para ${u.nome} (mín. 8):`)
                        if (s) acao({ acao: 'senha', id: u.id, senha: s }, 'Senha alterada.')
                      }}
                    >
                      Senha
                    </Botao>
                  )}
                  <Botao
                    variante={u.ativo ? 'secundario' : 'primario'}
                    className="px-2.5 py-1.5 text-xs"
                    onClick={() =>
                      acao(
                        {
                          acao: u.ativo ? 'desativar' : 'ativar',
                          diretor_id: u.diretor_id,
                        },
                        u.ativo ? `${u.nome} desativado.` : `${u.nome} reativado.`,
                      )
                    }
                  >
                    {u.ativo ? 'Desativar' : 'Reativar'}
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-center text-xs text-neutral-400">
        Diretores sem login continuam aparecendo no formulário como aprovadores, mas não
        conseguem entrar para decidir. Cadastre o acesso deles antes de usar o fluxo.
      </p>
    </div>
  )
}
