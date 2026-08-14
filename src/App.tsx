import { Navigate, Route, Routes } from 'react-router-dom'
import Solicitar from './pages/Solicitar'
import Enviado from './pages/Enviado'
import Acompanhar from './pages/Acompanhar'
import Consulta from './pages/Consulta'
import Login from './pages/Login'
import NovaSenha from './pages/NovaSenha'
import AdminLayout from './pages/admin/AdminLayout'
import Lista from './pages/admin/Lista'
import Detalhe from './pages/admin/Detalhe'
import Usuarios from './pages/admin/Usuarios'
import AprovacaoLayout from './pages/aprovacao/AprovacaoLayout'
import Pendentes from './pages/aprovacao/Pendentes'
import DetalheAprovacao from './pages/aprovacao/DetalheAprovacao'

export default function App() {
  return (
    <Routes>
      {/* Público */}
      <Route path="/" element={<Solicitar />} />
      <Route path="/enviado/:protocolo" element={<Enviado />} />
      <Route path="/s/:token" element={<Acompanhar />} />
      <Route path="/consulta" element={<Consulta />} />

      {/* Login único — redireciona conforme o perfil */}
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<Navigate to="/login" replace />} />
      {/* Destino do link de recuperação, e também da troca de senha. */}
      <Route path="/nova-senha" element={<NovaSenha />} />

      {/* Operação */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Lista />} />
        {/* O checklist de etapas da operação saiu daqui: é de outro projeto,
            e misturar os dois confunde quem usa o Cypher no dia a dia.
            A tela continua em pages/admin/Painel.tsx para quem for levá-la. */}
        <Route path="solicitacoes/:id" element={<Detalhe />} />
        <Route path="usuarios" element={<Usuarios />} />
      </Route>

      {/* Diretores aprovadores */}
      <Route path="/aprovacao" element={<AprovacaoLayout />}>
        <Route index element={<Pendentes />} />
        <Route path=":id" element={<DetalheAprovacao />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
