import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { brl } from "../format";

type ProductSale = {
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  total: number;
};

type Debtor = {
  id: string;
  name: string;
  balance: number;
};

type PaymentRow = {
  method: "pix" | "cash";
  amount: number;
  created_at: string;
};

type OrderRow = {
  id: string;
  total: number;
  customer_id: string | null;
  paid_at: string;
  status: string;
  order_items: {
    quantity: number;
    unit_price: number;
    products: {
      id: string;
      name: string;
      category: string;
    } | null;
  }[];
};

const categories = [
  "Pastéis",
  "Bebidas",
  "Doces",
  "Salgados",
  "SPA",
  "Brechó",
  "Outros",
];

const CATEGORY_EMOJI: Record<string, string> = {
  Pastéis: "🥟",
  Bebidas: "🥤",
  Doces: "🍬",
  Salgados: "🥐",
  SPA: "💆",
  Brechó: "👗",
  Outros: "📦",
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export default function ControleGeral() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>(
    []
  );

  const [from, setFrom] = useState(() => today());
  const [to, setTo] = useState(() => today());

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showDebtors, setShowDebtors] = useState(false);

  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loadingDebtors, setLoadingDebtors] = useState(false);

  const debtorRequestRef = useRef(0);

  // ============================================================
  // CARREGAMENTO PRINCIPAL
  // ============================================================

  const load = async () => {
    setLoading(true);
    setErr("");

    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);

    end.setDate(end.getDate() + 1);

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const [ordersRes, paymentsRes, customersRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          `
            id,
            total,
            customer_id,
            paid_at,
            status,
            order_items(
              quantity,
              unit_price,
              products(
                id,
                name,
                category
              )
            )
          `
        )
        .neq("status", "cancelled")
        .gte("paid_at", startIso)
        .lt("paid_at", endIso),

      supabase
        .from("payments")
        .select("method,amount,created_at")
        .gte("created_at", startIso)
        .lt("created_at", endIso),

      supabase.from("customers").select("id,name"),
    ]);

    if (ordersRes.error) {
      setErr(ordersRes.error.message);
      setLoading(false);
      return;
    }

    if (paymentsRes.error) {
      setErr(paymentsRes.error.message);
      setLoading(false);
      return;
    }

    if (customersRes.error) {
      setErr(customersRes.error.message);
      setLoading(false);
      return;
    }

    /*
     * Segurança adicional: pedidos cancelados nunca entram no
     * estado usado pelos cálculos do Controle Geral.
     */
    const validOrders = (
      (ordersRes.data || []) as unknown as OrderRow[]
    ).filter((order) => order.status !== "cancelled");

    setOrders(validOrders);
    setPayments((paymentsRes.data || []) as PaymentRow[]);
    setCustomers(customersRes.data || []);

    setLoading(false);
  };

  // ============================================================
  // CARREGAMENTO DOS DEVEDORES
  // ============================================================

  const loadDebtors = async () => {
    const requestId = ++debtorRequestRef.current;

    setLoadingDebtors(true);

    const [ordersRes, paymentsRes, customersRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id,customer_id,total,status")
        .not("customer_id", "is", null),

      supabase.from("payments").select("order_id,customer_id,amount"),

      supabase.from("customers").select("id,name"),
    ]);

    if (requestId !== debtorRequestRef.current) {
      return;
    }

    if (ordersRes.error) {
      console.error("Erro ao carregar pedidos dos devedores:", ordersRes.error);
      setLoadingDebtors(false);
      return;
    }

    if (paymentsRes.error) {
      console.error(
        "Erro ao carregar pagamentos dos devedores:",
        paymentsRes.error
      );
      setLoadingDebtors(false);
      return;
    }

    if (customersRes.error) {
      console.error(
        "Erro ao carregar clientes dos devedores:",
        customersRes.error
      );
      setLoadingDebtors(false);
      return;
    }

    // PEDIDOS POR CLIENTE

    const orderMap = new Map<string, number>();
    const orderCustomerMap = new Map<string, string>();

    for (const order of ordersRes.data || []) {
      if (!order.customer_id) {
        continue;
      }

      // Pedido cancelado não gera dívida.
      if (order.status === "cancelled") {
        continue;
      }

      orderCustomerMap.set(order.id, order.customer_id);

      orderMap.set(
        order.customer_id,
        (orderMap.get(order.customer_id) || 0) + Number(order.total)
      );
    }

    // PAGAMENTOS POR CLIENTE

    const paymentMap = new Map<string, number>();

    for (const payment of paymentsRes.data || []) {
      let customerId: string | null = null;

      if (payment.customer_id) {
        customerId = payment.customer_id;
      }

      if (!customerId && payment.order_id) {
        customerId = orderCustomerMap.get(payment.order_id) || null;
      }

      if (!customerId) {
        continue;
      }

      paymentMap.set(
        customerId,
        (paymentMap.get(customerId) || 0) + Number(payment.amount)
      );
    }

    // CALCULA DEVEDORES

    const result: Debtor[] = [];

    for (const customer of customersRes.data || []) {
      const consumed = orderMap.get(customer.id) || 0;
      const paid = paymentMap.get(customer.id) || 0;

      const balance = Math.round((consumed - paid) * 100) / 100;

      if (balance > 0) {
        result.push({
          id: customer.id,
          name: customer.name,
          balance,
        });
      }
    }

    result.sort((a, b) => b.balance - a.balance);

    if (requestId === debtorRequestRef.current) {
      setDebtors(result);
      setLoadingDebtors(false);
    }
  };

  // ============================================================
  // CARREGAMENTO INICIAL / MUDANÇA DE PERÍODO
  // ============================================================

  useEffect(() => {
    load();
    loadDebtors();
  }, [from, to]);

  // ============================================================
  // ATUALIZAÇÃO AUTOMÁTICA
  // ============================================================

  useEffect(() => {
    const channel = supabase
      .channel("controle-geral-devedores")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
        },
        () => {
          load();
          loadDebtors();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          load();
          loadDebtors();
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [from, to]);

  // ============================================================
  // TOTAIS
  // ============================================================

  const totalSold = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "cancelled")
        .reduce((sum, order) => sum + Number(order.total), 0),
    [orders]
  );

  const totalPaid = useMemo(
    () => payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    [payments]
  );

  const totalPix = useMemo(
    () =>
      payments
        .filter((p) => p.method === "pix")
        .reduce((sum, p) => sum + Number(p.amount), 0),
    [payments]
  );

  const totalCash = useMemo(
    () =>
      payments
        .filter((p) => p.method === "cash")
        .reduce((sum, p) => sum + Number(p.amount), 0),
    [payments]
  );

  // ============================================================
  // PRODUTOS VENDIDOS
  // ============================================================

  const productsSold = useMemo<ProductSale[]>(() => {
    const map = new Map<string, ProductSale>();

    for (const order of orders) {
      // Nunca contabiliza produtos de pedido cancelado.
      if (order.status === "cancelled") {
        continue;
      }

      for (const item of order.order_items) {
        if (!item.products) {
          continue;
        }

        const product = item.products;

        const quantity = Number(item.quantity);
        const total = quantity * Number(item.unit_price);

        const current = map.get(product.id);

        if (current) {
          current.quantity += quantity;
          current.total += total;
        } else {
          map.set(product.id, {
            productId: product.id,
            productName: product.name,
            category: product.category || "Outros",
            quantity,
            total,
          });
        }
      }
    }

    return [...map.values()].sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category, "pt-BR");
      }

      return b.quantity - a.quantity;
    });
  }, [orders]);

  const byCategory = useMemo(() => {
    const map = new Map<string, ProductSale[]>();

    for (const category of categories) {
      map.set(category, []);
    }

    for (const product of productsSold) {
      const category = categories.includes(product.category)
        ? product.category
        : "Outros";

      map.get(category)!.push(product);
    }

    return map;
  }, [productsSold]);

  const openDebtors = async () => {
    setShowDebtors(true);
    await loadDebtors();
  };

  const totalDebt = debtors.reduce((sum, debtor) => sum + debtor.balance, 0);

  const totalItems = productsSold.reduce(
    (sum, product) => sum + product.quantity,
    0
  );

  const customerCount = new Set(
    orders
      .map((order) => order.customer_id)
      .filter((id): id is string => Boolean(id))
  ).size;

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-gray-500">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-600" />
        <span className="text-sm">Carregando controle geral...</span>
      </div>
    );
  }

  // ============================================================
  // TELA PRINCIPAL
  // ============================================================

  return (
    <div className="mx-auto min-h-full max-w-md pb-6">
      {/* CABEÇALHO + FILTRO */}

      <div className="rounded-b-3xl bg-gradient-to-br from-orange-500 to-orange-600 px-4 pb-5 pt-5 shadow-lg">
        <div className="mb-4 text-white">
          <h1 className="text-2xl font-extrabold">Controle Geral</h1>

          <p className="text-sm text-orange-100">
            Visão geral das vendas e pagamentos
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-orange-100">
              De
            </label>

            <input
              type="date"
              className="inp !rounded-2xl !border-0 shadow-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-orange-100">
              Até
            </label>

            <input
              type="date"
              className="inp !rounded-2xl !border-0 shadow-sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-5 p-3 pt-4">
        {/* ERRO */}

        {err && (
          <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600 ring-1 ring-red-100">
            {err}
          </div>
        )}

        {/* FINANCEIRO */}

        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-gray-700">
            💰 Financeiro
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Total vendido"
              value={brl(totalSold)}
              variant="highlight"
            />

            <Metric
              label="Total recebido"
              value={brl(totalPaid)}
              variant="positive"
            />

            <Metric label="⚡ PIX" value={brl(totalPix)} />

            <Metric label="💵 Dinheiro" value={brl(totalCash)} />
          </div>
        </section>

        {/* DEVEDORES */}

        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Clientes devedores
              </div>

              <div className="mt-1 text-3xl font-extrabold text-red-600">
                {debtors.length}
              </div>

              {debtors.length > 0 && (
                <div className="text-sm font-medium text-red-600">
                  Total: {brl(totalDebt)}
                </div>
              )}
            </div>

            <button
              className="shrink-0 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition active:scale-95"
              onClick={openDebtors}
            >
              Ver devedores
            </button>
          </div>
        </section>

        {/* OPERACIONAL */}

        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-gray-700">
            📋 Operacional
          </h2>

          <div className="grid grid-cols-3 gap-3">
            <Metric label="Pedidos" value={String(orders.length)} center />

            <Metric label="Clientes" value={String(customerCount)} center />

            <Metric label="Itens" value={String(totalItems)} center />
          </div>
        </section>

        {/* PRODUTOS */}

        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-gray-700">
            Produtos vendidos
          </h2>

          <div className="space-y-3">
            {[...byCategory.entries()].map(([category, products]) => {
              if (products.length === 0) {
                return null;
              }

              const categoryQuantity = products.reduce(
                (sum, product) => sum + product.quantity,
                0
              );

              const categoryTotal = products.reduce(
                (sum, product) => sum + product.total,
                0
              );

              return (
                <div
                  key={category}
                  className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5"
                >
                  <div className="flex items-center justify-between bg-orange-50 px-4 py-3">
                    <div className="flex items-center gap-2 font-bold text-gray-800">
                      <span className="text-lg">
                        {CATEGORY_EMOJI[category] ?? "📦"}
                      </span>
                      {category}
                    </div>

                    <div className="text-right text-xs text-gray-500">
                      <div className="font-semibold text-orange-700">
                        {brl(categoryTotal)}
                      </div>

                      <div>{categoryQuantity} itens</div>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100 px-4">
                    {products.map((product) => (
                      <div
                        key={product.productId}
                        className="flex items-center justify-between py-2.5"
                      >
                        <span className="min-w-0 truncate text-sm text-gray-800">
                          {product.productName}
                        </span>

                        <div className="ml-2 flex shrink-0 items-center gap-3">
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-sm font-bold text-orange-700">
                            {product.quantity}×
                          </span>

                          <span className="w-20 text-right text-xs text-gray-500">
                            {brl(product.total)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {productsSold.length === 0 && (
              <div className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
                Nenhum produto vendido no período.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* MODAL DEVEDORES */}

      {showDebtors && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-[1px]"
          onClick={() => setShowDebtors(false)}
        >
          <div
            className="mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-3xl bg-gradient-to-br from-red-500 to-red-600 p-4 pt-3">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/40" />

              <div className="flex items-center justify-between">
                <div className="text-white">
                  <h2 className="text-lg font-bold leading-tight">Devedores</h2>

                  <p className="text-xs text-red-100">
                    {loadingDebtors
                      ? "Carregando..."
                      : `${debtors.length} cliente(s) · ${brl(totalDebt)}`}
                  </p>
                </div>

                <button
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white transition active:scale-95"
                  onClick={() => setShowDebtors(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!loadingDebtors && debtors.length === 0 && (
                <div className="rounded-2xl bg-green-50 p-5 text-center font-medium text-green-700">
                  🎉 Nenhum cliente devedor.
                </div>
              )}

              <div className="space-y-2">
                {debtors.map((debtor) => (
                  <div
                    key={debtor.id}
                    className="flex items-center gap-3 rounded-2xl bg-red-50 p-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                      {initials(debtor.name)}
                    </span>

                    <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                      {debtor.name}
                    </span>

                    <span className="shrink-0 font-bold text-red-600">
                      {brl(debtor.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                className="w-full rounded-2xl bg-gray-100 py-3 font-semibold text-gray-600 transition active:scale-[0.98]"
                onClick={() => setShowDebtors(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MÉTRICA
// ============================================================

function Metric({
  label,
  value,
  variant = "default",
  center,
}: {
  label: string;
  value: string;
  variant?: "default" | "highlight" | "positive";
  center?: boolean;
}) {
  const styles = {
    default: "bg-white ring-1 ring-black/5",
    highlight: "bg-gradient-to-br from-orange-500 to-orange-600 text-white",
    positive: "bg-green-50 ring-1 ring-green-100",
  }[variant];

  const labelColor =
    variant === "highlight" ? "text-orange-100" : "text-gray-500";

  const valueColor =
    variant === "highlight"
      ? "text-white"
      : variant === "positive"
      ? "text-green-700"
      : "text-gray-800";

  return (
    <div
      className={`rounded-2xl p-3 shadow-sm ${styles} ${
        center ? "text-center" : ""
      }`}
    >
      <div className={`text-xs font-medium ${labelColor}`}>{label}</div>

      <div
        className={`mt-1 font-extrabold ${valueColor} ${
          variant === "default" && center ? "text-2xl" : "text-xl"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// DATA ATUAL
// ============================================================

function today() {
  const d = new Date();

  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());

  return d.toISOString().slice(0, 10);
}
