export type Customer = { id: string; name: string }
export type Product = { id: string; name: string; price: number; active: boolean }
export type OrderRow = {
  id: string; total: number; change_amount: number; paid_at: string
  customers: { name: string } | null
  order_items: { quantity: number; unit_price: number; products: { name: string } | null }[]
  payments: { method: 'pix' | 'cash'; amount: number }[]
}
