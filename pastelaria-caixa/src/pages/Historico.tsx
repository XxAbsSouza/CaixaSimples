import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { OrderRow } from '../types'
import { brl, today } from '../format'

export default function Historico() {
  const [day, setDay] = useState(today())
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    const start = new Date(day + 'T00:00:00'); const end = new Date(start); end.setDate(end.getDate() + 1)
    supabase.from('orders')
      .select('id,total,change_amount,paid_at,customers(name),order_items(quantity,unit_price,products(name)),payments(method,amount)')
      .gte('paid_at', start.toISOString()).lt('paid_at', end.toISOString())
      .order('paid_at', { ascending: false })
      .then(({ data, error }) => { setErr(error?.message || ''); setOrders((data || []) as unknown as OrderRow[]) })
  }, [day])

  const sum = (m: 'pix' | 'cash') =>
    orders.reduce((s, o) => s + o.payments.filter(p => p.method === m).reduce((a, p) => a + Number(p.amount), 0), 0)
  const total = orders.reduce((s, o) => s + Number(o.total), 0)

  return (
    <div className="space-y-3 p-3">
      <input type="date" className="inp" value={day} onChange={e => setDay(e.target.value)} />
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-orange-600 p-2 text-white"><div className="text-xs">Vendido</div><div className="font-bold">{brl(total)}</div></div>
        <div className="rounded-xl bg-white p-2"><div className="text-xs text-gray-500">PIX</div><div className="font-bold">{brl(sum('pix'))}</div></div>
        <div className="rounded-xl bg-white p-2"><div className="text-xs text-gray-500">Dinheiro</div><div className="font-bold">{brl(sum('cash'))}</div></div>
      </div>
      <div className="text-center text-sm text-gray-500">{orders.length} venda(s)</div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <ul className="space-y-2">
        {orders.map(o => (
          <li key={o.id} className="rounded-xl bg-white p-3">
            <div className="flex justify-between">
              <span className="font-medium">{o.customers?.name || 'Sem cliente'}</span>
              <span className="text-sm text-gray-500">{new Date(o.paid_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="text-sm text-gray-700">
              {o.order_items.map(i => `${i.quantity}× ${i.products?.name ?? '?'}`).join(', ')}
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-500">
                {o.payments.map(p => `${p.method === 'pix' ? 'PIX' : 'Dinheiro'} ${brl(p.amount)}`).join(' + ')}
                {o.change_amount > 0 && ` (troco ${brl(o.change_amount)})`}
              </span>
              <span className="font-bold">{brl(o.total)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
