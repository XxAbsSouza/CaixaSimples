import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import type { OrderRow, OrderStatus, Payment } from "../types";
import { brl, today } from "../format";

type ReceivedPayment = Pick<Payment, "method" | "amount">;

const STATUS_BADGE: Record<OrderStatus, { label: string; className: string }> =
  {
    pending: { label: "Pendente", className: "bg-red-100 text-red-700" },
    paid: { label: "Pago", className: "bg-green-100 text-green-700" },
    cancelled: { label: "Cancelado", className: "bg-gray-100 text-gray-500" },
  };

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function Historico() {
  const [day, setDay] = useState(today());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [received, setReceived] = useState<ReceivedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ignore = false;

    const start = new Date(`${day}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    setLoading(true);

    Promise.all([
      /*
       * VENDAS DO DIA: pedidos CRIADOS no dia (cancelados ficam de fora).
       */
      supabase
        .from("orders")
        .select(
          `
            id,
            order_number,
            total,
            change_amount,
            created_at,
            status,
            customers(name),
            order_items(
              id,
              quantity,
              unit_price,
              products(name,category)
            ),
            payments(
              id,
              method,
              amount,
              created_at,
              order_id
            )
          `
        )
        .neq("status", "cancelled")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: false }),

      /*
       * RECEBIDO NO DIA: pagamentos FEITOS no dia, mesmo que o pedido
       * tenha sido criado antes.
       */
      supabase
        .from("payments")
        .select("method,amount")
        .gte("created_at", startIso)
        .lt("created_at", endIso),
    ]).then(([ordersRes, paymentsRes]) => {
      if (ignore) return;

      const error = ordersRes.error || paymentsRes.error;

      setErr(error?.message || "");
      setOrders((ordersRes.data || []) as unknown as OrderRow[]);
      setReceived((paymentsRes.data || []) as ReceivedPayment[]);
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [day]);

  const totalSold = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.total), 0),
    [orders]
  );

  const sumMethod = (method: "pix" | "cash") =>
    received
      .filter((payment) => payment.method === method)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const totalPix = sumMethod("pix");
  const totalCash = sumMethod("cash");
  const totalReceived = totalPix + totalCash;

  return (
    <div className="mx-auto min-h-full  pb-6">
      {/* CABEÇALHO + FILTRO */}

      <div className="rounded-b-3xl bg-gradient-to-br from-orange-500 to-orange-600 px-4 pb-5 pt-5 shadow-lg">
        <div className="mb-4 text-white">
          <h1 className="text-2xl font-extrabold">🧾 Histórico</h1>

          <p className="text-sm text-orange-100">
            Vendas e recebimentos do dia
          </p>
        </div>

        <input
          type="date"
          className="inp !rounded-2xl !border-0 shadow-sm"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>

      <div className="space-y-4 p-3 pt-4">
        {/* RESUMO */}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-3 text-white shadow-sm">
            <div className="text-xs font-medium text-orange-100">Vendido</div>

            <div className="mt-1 text-xl font-extrabold">{brl(totalSold)}</div>
          </div>

          <div className="rounded-2xl bg-green-50 p-3 shadow-sm ring-1 ring-green-100">
            <div className="text-xs font-medium text-gray-500">Recebido</div>

            <div className="mt-1 text-xl font-extrabold text-green-700">
              {brl(totalReceived)}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
            <div className="text-xs font-medium text-gray-500">⚡ PIX</div>

            <div className="mt-1 text-lg font-bold text-gray-800">
              {brl(totalPix)}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
            <div className="text-xs font-medium text-gray-500">💵 Dinheiro</div>

            <div className="mt-1 text-lg font-bold text-gray-800">
              {brl(totalCash)}
            </div>
          </div>
        </div>

        <div className="text-center text-sm text-gray-500">
          {loading
            ? "Carregando..."
            : `${orders.length} ${orders.length === 1 ? "venda" : "vendas"}`}
        </div>

        {err && (
          <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">
            {err}
          </p>
        )}

        {/* LISTA */}

        <ul className="space-y-3">
          {orders.map((order) => {
            const badge = STATUS_BADGE[order.status];

            return (
              <li
                key={order.id}
                className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-gray-800">
                      {order.customers?.name || "Sem cliente"}
                    </div>

                    <div className="text-xs text-gray-500">
                      #{order.order_number} · 🕒 {formatTime(order.created_at)}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                <div className="mt-2 space-y-0.5 text-sm text-gray-700">
                  {order.order_items.map((item) => (
                    <div key={item.id}>
                      <span className="font-semibold text-orange-600">
                        {item.quantity}×
                      </span>{" "}
                      {item.products?.name ?? "?"}
                    </div>
                  ))}
                </div>

                {order.payments.length > 0 && (
                  <div className="mt-3 space-y-1 rounded-2xl bg-green-50/60 p-3 text-xs">
                    {order.payments.map((payment) => (
                      <div key={payment.id} className="flex justify-between">
                        <span className="text-gray-600">
                          {payment.method === "pix" ? "PIX" : "Dinheiro"}
                          {" · "}
                          {formatTime(payment.created_at)}
                        </span>

                        <span className="font-semibold text-green-700">
                          {brl(Number(payment.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-end justify-between border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-500">
                    {order.change_amount > 0 &&
                      `Troco ${brl(order.change_amount)}`}
                  </span>

                  <span className="text-xl font-extrabold text-gray-800">
                    {brl(Number(order.total))}
                  </span>
                </div>
              </li>
            );
          })}

          {!loading && orders.length === 0 && (
            <li className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
              Nenhuma venda neste dia.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
