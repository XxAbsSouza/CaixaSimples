import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Customer } from '../types'
import { byName } from '../format'

export default function Clientes() {
  const [list, setList] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const { data } = await supabase.from('customers').select('id,name')
    setList(byName((data || []) as Customer[]))
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    const n = name.trim(); if (!n) return
    const { error } = editId
      ? await supabase.from('customers').update({ name: n }).eq('id', editId)
      : await supabase.from('customers').insert({ name: n })
    if (error) return setErr(error.message)
    setErr(''); setName(''); setEditId(null); load()
  }

  const shown = list.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2">
        <input className="inp" placeholder={editId ? 'Editar nome' : 'Novo cliente'} value={name} onChange={e => setName(e.target.value)} />
        <button className="btn bg-orange-600 text-white" onClick={save}>{editId ? 'Salvar' : 'Add'}</button>
        {editId && <button className="btn bg-white border" onClick={() => { setEditId(null); setName('') }}>✕</button>}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <input className="inp" placeholder="🔍 Buscar cliente" value={q} onChange={e => setQ(e.target.value)} />
      <ul className="space-y-2">
        {shown.map(c => (
          <li key={c.id} className="flex items-center justify-between rounded-xl bg-white p-3">
            <span>{c.name}</span>
            <button className="btn bg-gray-100 !py-1" onClick={() => { setEditId(c.id); setName(c.name) }}>Editar</button>
          </li>
        ))}
        {shown.length === 0 && <li className="py-6 text-center text-gray-500">Nenhum cliente.</li>}
      </ul>
    </div>
  )
}
