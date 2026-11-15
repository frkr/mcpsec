/*
   Copyright 2026 Davi Saranszky Mesquita

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { del, get, post, put } from '../api/client'
import type { TeamResponse } from '../bindings/TeamResponse'
import type { TeamDetailResponse } from '../bindings/TeamDetailResponse'
import type { UserSummaryResponse } from '../bindings/UserSummaryResponse'
import type { CreateTeamRequest } from '../bindings/CreateTeamRequest'
import type { UpdateTeamRequest } from '../bindings/UpdateTeamRequest'
import type { AddTeamMemberRequest } from '../bindings/AddTeamMemberRequest'

export function TeamsPage() {
  const queryClient = useQueryClient()
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'user' | 'manager'>('user')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: () => get<TeamResponse[]>('/api/teams/'),
  })

  const usersQuery = useQuery({
    queryKey: ['team-users'],
    queryFn: () => get<UserSummaryResponse[]>('/api/teams/users'),
    retry: false,
  })

  const detailQuery = useQuery({
    queryKey: ['team-detail', selectedTeamId],
    queryFn: () => get<TeamDetailResponse>(`/api/teams/${selectedTeamId}`),
    enabled: selectedTeamId !== null,
  })

  const createMutation = useMutation({
    mutationFn: (body: CreateTeamRequest) => post<TeamResponse>('/api/teams/', body),
    onSuccess: (created) => {
      setName('')
      setDescription('')
      setErrorMsg(null)
      setSelectedTeamId(created.id)
      setEditName(created.name)
      setEditDescription(created.description ?? '')
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateTeamRequest }) =>
      put<TeamResponse>(`/api/teams/${id}`, body),
    onSuccess: () => {
      setErrorMsg(null)
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['team-detail', selectedTeamId] })
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => del(`/api/teams/${id}`),
    onSuccess: () => {
      setErrorMsg(null)
      setSelectedTeamId(null)
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const addMemberMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: AddTeamMemberRequest }) =>
      post(`/api/teams/${id}/members`, body),
    onSuccess: () => {
      setMemberEmail('')
      setErrorMsg(null)
      queryClient.invalidateQueries({ queryKey: ['team-detail', selectedTeamId] })
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) =>
      del(`/api/teams/${teamId}/members/${userId}`),
    onSuccess: () => {
      setErrorMsg(null)
      queryClient.invalidateQueries({ queryKey: ['team-detail', selectedTeamId] })
    },
    onError: (err: Error) => setErrorMsg(err.message),
  })

  const selectTeam = (t: TeamResponse) => {
    setSelectedTeamId(t.id)
    setEditName(t.name)
    setEditDescription(t.description ?? '')
    setErrorMsg(null)
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
      <h1>Times</h1>
      <p>Gerencie times, usuários regulares e gerentes de time (Team Managers).</p>

      {errorMsg && (
        <div style={{ padding: '0.75rem', marginBottom: '1rem', border: '1px solid #c0392b', color: '#c0392b', borderRadius: 6 }}>
          {errorMsg}
        </div>
      )}

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--border, #333)', borderRadius: 8 }}>
        <h2>Criar novo time</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate({ name, description: description || null })
          }}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            type="text"
            placeholder="Nome do time"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Criando...' : 'Criar time'}
          </button>
        </form>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
        <section>
          <h2>Lista de times</h2>
          {teamsQuery.isLoading && <p>Carregando times...</p>}
          {teamsQuery.data?.length === 0 && <p>Nenhum time cadastrado.</p>}
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {teamsQuery.data?.map((t) => (
              <li
                key={t.id}
                onClick={() => selectTeam(t)}
                style={{
                  padding: '0.75rem',
                  border: '1px solid var(--border, #333)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: selectedTeamId === t.id ? 600 : 400,
                }}
              >
                <div>{t.name}</div>
                {t.description && <small style={{ opacity: 0.75 }}>{t.description}</small>}
              </li>
            ))}
          </ul>
        </section>

        <section>
          {selectedTeamId === null ? (
            <p>Selecione um time para editar ou gerenciar membros.</p>
          ) : detailQuery.isLoading ? (
            <p>Carregando detalhes...</p>
          ) : detailQuery.data ? (
            <div>
              <h2>{detailQuery.data.team.name}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  updateMutation.mutate({
                    id: detailQuery.data.team.id,
                    body: { name: editName, description: editDescription || null },
                  })
                }}
                style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="Descrição"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                <button type="submit" disabled={updateMutation.isPending}>
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(detailQuery.data.team.id)}
                  disabled={deleteMutation.isPending}
                >
                  Excluir time
                </button>
              </form>

              <h3>Membros</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  addMemberMutation.mutate({
                    id: detailQuery.data.team.id,
                    body: { user_id: null, email: memberEmail, role: memberRole },
                  })
                }}
                style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
              >
                <input
                  type="email"
                  list="instance-users-list"
                  placeholder="E-mail do usuário"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  required
                />
                <datalist id="instance-users-list">
                  {usersQuery.data?.map((u) => (
                    <option key={u.id} value={u.email}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </datalist>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as 'user' | 'manager')}
                >
                  <option value="user">Usuário regular (user)</option>
                  <option value="manager">Gerente de time (manager)</option>
                </select>
                <button type="submit" disabled={addMemberMutation.isPending}>
                  Adicionar membro
                </button>
              </form>

              {detailQuery.data.members.length === 0 ? (
                <p>Nenhum membro neste time.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Nome</th>
                      <th style={{ textAlign: 'left' }}>E-mail</th>
                      <th style={{ textAlign: 'left' }}>Papel no time</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailQuery.data.members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{m.email}</td>
                        <td>{m.team_role === 'manager' ? 'Team Manager' : 'Usuário regular'}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              removeMemberMutation.mutate({
                                teamId: detailQuery.data.team.id,
                                userId: Number(m.user_id),
                              })
                            }
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
