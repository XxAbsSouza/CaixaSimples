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
     * Segurança adicional:
     *
     * Mesmo que futuramente a consulta seja alterada,
     * pedidos cancelados nunca entram no estado usado
     * pelos cálculos do Controle Geral.
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

    // ==========================================================
    // PEDIDOS POR CLIENTE
    // ==========================================================

    const orderMap = new Map<string, number>();

    const orderCustomerMap = new Map<string, string>();

    for (const order of ordersRes.data || []) {
      if (!order.customer_id) {
        continue;
      }

      /*
       * Pedido cancelado não gera dívida.
       */
      if (order.status === "cancelled") {
        continue;
      }

      orderCustomerMap.set(order.id, order.customer_id);

      orderMap.set(
        order.customer_id,
        (orderMap.get(order.customer_id) || 0) + Number(order.total)
      );
    }

    // ==========================================================
    // PAGAMENTOS POR CLIENTE
    // ==========================================================

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

    // ==========================================================
    // CALCULA DEVEDORES
    // ==========================================================

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
  // TOTAL VENDIDO
  // ============================================================

  const totalSold = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "cancelled")
        .reduce((sum, order) => sum + Number(order.total), 0),
    [orders]
  );

  // ============================================================
  // TOTAL RECEBIDO
  // ============================================================

  const totalPaid = useMemo(
    () => payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    [payments]
  );

  // ============================================================
  // TOTAL PIX
  // ============================================================

  const totalPix = useMemo(
    () =>
      payments
        .filter((p) => p.method === "pix")
        .reduce((sum, p) => sum + Number(p.amount), 0),
    [payments]
  );

  // ============================================================
  // TOTAL DINHEIRO
  // ============================================================

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
      /*
       * Segurança adicional para nunca contabilizar
       * produtos de pedido cancelado.
       */
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

  // ============================================================
  // AGRUPAMENTO POR CATEGORIA
  // ============================================================

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

  // ============================================================
  // ABRIR DEVEDORES
  // ============================================================

  const openDebtors = async () => {
    setShowDebtors(true);
    await loadDebtors();
  };

  // ============================================================
  // TOTAL DA DÍVIDA
  // ============================================================

  const totalDebt = debtors.reduce((sum, debtor) => sum + debtor.balance, 0);

  // ============================================================
  // TOTAL DE ITENS
  // ============================================================

  const totalItems = productsSold.reduce(
    (sum, product) => sum + product.quantity,
    0
  );

  // ============================================================
  // CLIENTES DO PERÍODO
  // ============================================================

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
      <div className="p-5 text-center text-gray-500">
        Carregando controle geral...
      </div>
    );
  }

  // ============================================================
  // TELA PRINCIPAL
  // ============================================================

  return (
    <div className="space-y-4 p-3 pb-28">
      {/* CABEÇALHO */}

      <div>
        <h1 className="text-xl font-bold">Controle Geral</h1>

        <p className="text-sm text-gray-500">
          Visão geral das vendas e pagamentos
        </p>
      </div>

      {/* FILTRO */}

      <div className="rounded-2xl bg-white p-3 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-gray-600">Período</div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">De</label>

            <input
              type="date"
              className="inp"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Até</label>

            <input
              type="date"
              className="inp"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ERRO */}

      {err && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {err}
        </div>
      )}

      {/* FINANCEIRO */}

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-600">
          Financeiro
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <Metric label="Total vendido" value={brl(totalSold)} highlight />

          <Metric label="Total recebido" value={brl(totalPaid)} positive />

          <Metric label="PIX" value={brl(totalPix)} />

          <Metric label="Dinheiro" value={brl(totalCash)} />
        </div>
      </div>

      {/* DEVEDORES */}

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Clientes devedores</div>

            <div className="text-2xl font-bold text-red-600">
              {debtors.length}
            </div>

            {debtors.length > 0 && (
              <div className="text-sm text-red-600">
                Total: {brl(totalDebt)}
              </div>
            )}
          </div>

          <button className="btn bg-red-50 text-red-700" onClick={openDebtors}>
            Ver devedores
          </button>
        </div>
      </div>

      {/* OPERACIONAL */}

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-600">
          Operacional
        </h2>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Pedidos" value={String(orders.length)} />

          <Metric label="Clientes" value={String(customerCount)} />

          <Metric label="Itens" value={String(totalItems)} />
        </div>
      </div>

      {/* PRODUTOS */}

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-600">
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
                className="rounded-2xl bg-white p-3 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">{category}</div>

                  <div className="text-xs text-gray-500">
                    {categoryQuantity} itens · {brl(categoryTotal)}
                  </div>
                </div>

                <div className="space-y-2">
                  {products.map((product) => (
                    <div
                      key={product.productId}
                      className="flex items-center justify-between border-t pt-2 first:border-0 first:pt-0"
                    >
                      <span className="min-w-0 truncate text-sm">
                        {product.productName}
                      </span>

                      <div className="ml-2 flex shrink-0 items-center gap-3">
                        <span className="text-sm font-bold">
                          {product.quantity}x
                        </span>

                        <span className="text-xs text-gray-500">
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
            <div className="rounded-xl bg-white p-5 text-center text-gray-500">
              Nenhum produto vendido no período.
            </div>
          )}
        </div>
      </div>

      {/* MODAL DEVEDORES */}

      {showDebtors && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => setShowDebtors(false)}
        >
          <div
            className="mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Devedores</h2>

                <p className="text-sm text-gray-500">
                  {loadingDebtors
                    ? "Carregando..."
                    : `${debtors.length} cliente(s) · ${brl(totalDebt)}`}
                </p>
              </div>

              <button
                className="btn bg-gray-100 !px-3"
                onClick={() => setShowDebtors(false)}
              >
                ✕
              </button>
            </div>

            {!loadingDebtors && debtors.length === 0 && (
              <div className="rounded-xl bg-green-50 p-4 text-center text-green-700">
                Nenhum cliente devedor.
              </div>
            )}

            <div className="space-y-2">
              {debtors.map((debtor) => (
                <div
                  key={debtor.id}
                  className="flex items-center justify-between rounded-xl bg-red-50 p-3"
                >
                  <span className="font-medium">{debtor.name}</span>

                  <span className="font-bold text-red-600">
                    {brl(debtor.balance)}
                  </span>
                </div>
              ))}
            </div>

            <button
              className="btn mt-4 w-full bg-gray-100"
              onClick={() => setShowDebtors(false)}
            >
              Fechar
            </button>
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
  highlight,
  positive,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-3 shadow-sm ${
        highlight
          ? "bg-orange-600 text-white"
          : positive
          ? "bg-green-50"
          : "bg-white"
      }`}
    >
      <div
        className={`text-xs ${highlight ? "text-orange-100" : "text-gray-500"}`}
      >
        {label}
      </div>

      <div
        className={`mt-1 font-bold ${
          highlight ? "text-xl" : positive ? "text-green-700" : "text-gray-800"
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
