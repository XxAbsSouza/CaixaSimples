import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Product } from '../types'
import { brl, byName, toNum } from '../format'

export default function Produtos() {
  const [list, setList] = useState<Product[]>([])
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const { data } = await supabase.from('products').select('id,name,price,active')
    setList(byName((data || []) as Product[]))
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    const n = name.trim(); if (!n || !price) return
    const row = { name: n, price: toNum(price) }
    const { error } = editId
      ? await supabase.from('products').update(row).eq('id', editId)
      : await supabase.from('products').insert(row)
    if (error) return setErr(error.message)
    setErr(''); setName(''); setPrice(''); setEditId(null); load()
  }
  const toggle = async (p: Product) => {
    await supabase.from('products').update({ active: !p.active }).eq('id', p.id); load()
  }

  return (
    <div className="space-y-3 p-3">
      <div className="space-y-2 rounded-xl bg-white p-3">
        <input className="inp" placeholder="Nome do produto" value={name} onChange={e => setName(e.target.value)} />
        <div className="flex gap-2">
          <input className="inp" inputMode="decimal" placeholder="Preço (ex: 8,50)" value={price} onChange={e => setPrice(e.target.value)} />
          <button className="btn bg-orange-600 text-white" onClick={save}>{editId ? 'Salvar' : 'Add'}</button>
          {editId && <button className="btn bg-white border" onClick={() => { setEditId(null); setName(''); setPrice('') }}>✕</button>}
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
      <ul className="space-y-2">
        {list.map(p => (
          <li key={p.id} className={`flex items-center justify-between gap-2 rounded-xl bg-white p-3 ${p.active ? '' : 'opacity-50'}`}>
            <div className="min-w-0"><div className="truncate font-medium">{p.name}</div><div className="text-sm text-gray-500">{brl(p.price)}</div></div>
            <div className="flex gap-2">
              <button className="btn bg-gray-100 !py-1" onClick={() => { setEditId(p.id); setName(p.name); setPrice(String(p.price).replace('.', ',')) }}>Editar</button>
              <button className={`btn !py-1 ${p.active ? 'bg-green-100 text-green-800' : 'bg-gray-200'}`} onClick={() => toggle(p)}>{p.active ? 'Ativo' : 'Inativo'}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
