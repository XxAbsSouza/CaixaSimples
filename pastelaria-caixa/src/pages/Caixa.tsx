import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Customer, Product } from '../types'
import { brl, toNum, r2, byName } from '../format'

type Mode = 'pix' | 'cash' | 'mixed'

export default function Caixa({ active }: { active: boolean }) {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [customerId, setCustomerId] = useState('')
  const [newName, setNewName] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [mode, setMode] = useState<Mode>('pix')
  const [pixIn, setPixIn] = useState('')
  const [cashIn, setCashIn] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!active) return
    Promise.all([
      supabase.from('products').select('id,name,price,active').eq('active', true),
      supabase.from('customers').select('id,name'),
    ]).then(([p, c]) => {
      if (p.data) setProducts(byName(p.data as Product[]))
      if (c.data) setCustomers(byName(c.data as Customer[]))
    })
  }, [active])

  const total = useMemo(
    () => r2(products.reduce((s, p) => s + p.price * (cart[p.id] || 0), 0)), [products, cart])
  const count = Object.values(cart).reduce((a, b) => a + b, 0)

  const pix = mode === 'pix' ? total : mode === 'cash' ? 0 : toNum(pixIn)
  const cash = mode === 'pix' ? 0 : toNum(cashIn)
  const paid = r2(pix + cash)
  const change = r2(paid - total)
  const ok = total > 0 && paid >= total && pix <= total

  const add = (id: string, d: number) => setCart(c => {
    const q = Math.max(0, (c[id] || 0) + d)
    const n = { ...c }; if (q) n[id] = q; else delete n[id]; return n
  })

  const addCustomer = async () => {
    const name = (newName || '').trim()
    if (!name) return
    const { data, error } = await supabase.from('customers').insert({ name }).select('id,name').single()
    if (error) return setMsg(error.message)
    setCustomers(byName([...customers, data as Customer])); setCustomerId(data!.id); setNewName(null)
  }

  const finish = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('finalize_sale', {
      p_customer_id: customerId || null,
      p_items: Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity })),
      p_pix: pix, p_cash: cash,
    })
    setBusy(false)
    if (error) return setMsg(error.message)
    setMsg(change > 0 && cash > 0 ? `✅ Venda registrada. Troco: ${brl(change)}` : '✅ Venda registrada')
    setCart({}); setCustomerId(''); setPixIn(''); setCashIn(''); setMode('pix'); setPaying(false)
  }

  const quick = (v: number) => setCashIn(String(v).replace('.', ','))

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-10 space-y-2 bg-orange-50 p-3">
        {newName === null ? (
          <div className="flex gap-2">
            <select className="inp" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">Cliente (opcional)</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn bg-white border" onClick={() => setNewName('')}>＋</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input autoFocus className="inp" placeholder="Nome do cliente" value={newName}
              onChange={e => setNewName(e.target.value)} />
            <button className="btn bg-orange-600 text-white" onClick={addCustomer}>OK</button>
            <button className="btn bg-white border" onClick={() => setNewName(null)}>✕</button>
          </div>
        )}
        {msg && <div className="rounded-xl bg-white p-2 text-center text-sm font-medium">{msg}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3 px-3">
        {products.map(p => {
          const q = cart[p.id] || 0
          return (
            <div key={p.id} className={`rounded-2xl border bg-white p-3 ${q ? 'border-orange-500 ring-2 ring-orange-200' : ''}`}>
              <button className="w-full text-left" onClick={() => add(p.id, 1)}>
                <div className="font-semibold leading-tight">{p.name}</div>
                <div className="text-sm text-gray-500">{brl(p.price)}</div>
              </button>
              <div className="mt-2 flex items-center justify-between">
                <button className="btn h-11 w-11 bg-gray-100 !p-0 text-xl" onClick={() => add(p.id, -1)}>−</button>
                <span className="text-xl font-bold">{q}</span>
                <button className="btn h-11 w-11 bg-orange-600 !p-0 text-xl text-white" onClick={() => add(p.id, 1)}>＋</button>
              </div>
            </div>
          )
        })}
        {products.length === 0 && <p className="col-span-2 py-8 text-center text-gray-500">Cadastre produtos na aba Produtos.</p>}
      </div>

      {!paying && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] mx-auto max-w-md p-3">
          <button disabled={!count} onClick={() => { setMsg(''); setPaying(true) }}
            className="btn flex w-full justify-between bg-orange-600 text-white shadow-lg disabled:bg-gray-300">
            <span>{count} {count === 1 ? 'item' : 'itens'}</span><span>Pagar {brl(total)}</span>
          </button>
        </div>
      )}

      {paying && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/40" onClick={() => setPaying(false)}>
          <div className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={e => e.stopPropagation()}>
            <div className="text-center text-3xl font-bold">{brl(total)}</div>
            <div className="grid grid-cols-3 gap-2">
              {([['pix', 'PIX'], ['cash', 'Dinheiro'], ['mixed', 'PIX + Din.']] as const).map(([m, l]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`btn ${mode === m ? 'bg-orange-600 text-white' : 'bg-gray-100'}`}>{l}</button>
              ))}
            </div>
            {mode === 'mixed' && (
              <input className="inp" inputMode="decimal" placeholder="Valor no PIX" value={pixIn} onChange={e => setPixIn(e.target.value)} />
            )}
            {mode !== 'pix' && (
              <>
                <input className="inp" inputMode="decimal" placeholder="Dinheiro recebido" value={cashIn} onChange={e => setCashIn(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <button className="btn bg-gray-100 !py-2" onClick={() => quick(mode === 'mixed' ? r2(Math.max(0, total - pix)) : total)}>Exato</button>
                  {[10, 20, 50, 100].map(v => <button key={v} className="btn bg-gray-100 !py-2" onClick={() => quick(v)}>{v}</button>)}
                </div>
              </>
            )}
            <div className="text-center text-lg">
              {pix > total ? <span className="text-red-600">PIX maior que o total</span>
                : paid < total ? <span className="text-red-600">Falta {brl(r2(total - paid))}</span>
                : <span className="text-green-700">Troco: {brl(change)}</span>}
            </div>
            <button disabled={!ok || busy} onClick={finish}
              className="btn w-full bg-green-600 py-4 text-lg text-white disabled:bg-gray-300">
              {busy ? 'Salvando…' : 'Finalizar venda'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
