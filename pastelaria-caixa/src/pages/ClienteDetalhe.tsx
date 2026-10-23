import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import type {
  CustomerOrder,
  Payment,
  Product,
  ProductCategory,
} from "../types";
import { brl } from "../format";

type Props = {
  customerId: string;
  onBack: () => void;
};

type PaymentMode = "pix" | "cash";

type PaymentTarget = { type: "order"; orderId: string } | { type: "total" };

type NewOrderItem = {
  product_id: string;
  quantity: number;
};

type EditOrderItem = {
  product_id: string;
  quantity: number;
};

const CATEGORY_ORDER: ProductCategory[] = [
  "Pastéis",
  "Bebidas",
  "Doces",
  "Salgados",
  "SPA",
  "Brechó",
  "Outros",
];

/*
 * ============================================================
 * CACHE GLOBAL DE PRODUTOS
 * ============================================================
 *
 * O cache fica FORA do componente.
 *
 * Isso significa que:
 *
 * Cliente A
 *   -> busca produtos no banco
 *
 * Cliente B
 *   -> reutiliza produtos do cache
 *
 * Cliente C
 *   -> reutiliza produtos do cache
 *
 * Assim, trocar de cliente não dispara novamente a consulta
 * de produtos.
 *
 * O TTL evita que o cache fique eternamente desatualizado.
 */

const PRODUCTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

let productsCache: Product[] | null = null;
let productsCacheTimestamp = 0;

/*
 * Guarda a Promise da consulta atual.
 *
 * Isso evita duas consultas simultâneas caso, por exemplo,
 * Novo Pedido e Editar Pedido sejam abertos praticamente
 * ao mesmo tempo.
 */
let productsFetchPromise: Promise<Product[]> | null = null;

const getProductsFromCache = (): Product[] | null => {
  if (!productsCache) {
    console.log("[CACHE PRODUTOS] MISS - cache vazio");
    return null;
  }

  const age = Date.now() - productsCacheTimestamp;

  if (age >= PRODUCTS_CACHE_TTL) {
    console.log(
      `[CACHE PRODUTOS] MISS - cache expirado (${Math.round(age / 1000)}s)`
    );

    productsCache = null;
    productsCacheTimestamp = 0;

    return null;
  }

  console.log(
    `[CACHE PRODUTOS] HIT - reutilizando ${
      productsCache.length
    } produtos (${Math.round(age / 1000)}s de idade)`
  );

  return productsCache;
};

const fetchProducts = async (): Promise<Product[]> => {
  /*
   * Se já existe uma consulta acontecendo, reutiliza a mesma
   * Promise em vez de disparar outra consulta.
   */
  if (productsFetchPromise) {
    console.log(
      "[CACHE PRODUTOS] WAIT - consulta já em andamento, reutilizando Promise"
    );

    return productsFetchPromise;
  }

  console.log("[CACHE PRODUTOS] FETCH - consultando Supabase...");

  productsFetchPromise = (async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,price,active,category")
      .order("category")
      .order("name");

    if (error) {
      console.error("[CACHE PRODUTOS] FETCH ERROR:", error.message);
      throw new Error(error.message);
    }

    const loadedProducts = (data || []) as Product[];

    productsCache = loadedProducts;
    productsCacheTimestamp = Date.now();

    console.log(
      `[CACHE PRODUTOS] SAVE - ${loadedProducts.length} produtos armazenados no cache`
    );

    return loadedProducts;
  })();

  try {
    return await productsFetchPromise;
  } finally {
    productsFetchPromise = null;
  }
};

const loadProductsFromCache = async (): Promise<Product[]> => {
  const cachedProducts = getProductsFromCache();

  if (cachedProducts) {
    return cachedProducts;
  }

  return fetchProducts();
};

/*
 * Função auxiliar para limpar o cache.
 *
 * Não está sendo chamada automaticamente neste componente.
 *
 * Se futuramente a tela de Produtos alterar um produto, podemos
 * chamar:
 *
 * invalidateProductsCache();
 *
 * para obrigar a próxima tela a buscar novamente no banco.
 */
export const invalidateProductsCache = () => {
  console.log("[CACHE PRODUTOS] INVALIDATE - cache limpo");

  productsCache = null;
  productsCacheTimestamp = 0;
};

/*
 * ============================================================
 * COMPONENTE
 * ============================================================
 */

export default function ClienteDetalhe({ customerId, onBack }: Props) {
  const [customerName, setCustomerName] = useState("");
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(
    null
  );

  const [paymentMode, setPaymentMode] = useState<PaymentMode>("pix");

  /*
   * ============================================================
   * PRODUTOS
   * ============================================================
   */

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);

  /*
   * ============================================================
   * NOVO PEDIDO
   * ============================================================
   */

  const [showNewOrder, setShowNewOrder] = useState(false);
  const [orderItems, setOrderItems] = useState<NewOrderItem[]>([]);
  const [orderError, setOrderError] = useState("");

  /*
   * ============================================================
   * EDITAR PEDIDO
   * ============================================================
   */

  const [editingOrder, setEditingOrder] = useState<CustomerOrder | null>(null);

  const [editItems, setEditItems] = useState<EditOrderItem[]>([]);
  const [editError, setEditError] = useState("");

  /*
   * ============================================================
   * CARREGAR PRODUTOS
   * ============================================================
   */

  const loadProducts = useCallback(async () => {
    /*
     * Cache local do componente.
     *
     * Se este componente já carregou os produtos, não precisa
     * nem consultar o cache global novamente.
     */
    if (productsLoaded) {
      console.log(
        "[LOAD PRODUTOS] LOCAL HIT - produtos já carregados neste componente"
      );

      return products;
    }

    if (productsLoading) {
      console.log(
        "[LOAD PRODUTOS] IGNORADO - carregamento já está em andamento"
      );

      return products;
    }

    setProductsLoading(true);

    try {
      console.log(
        `[LOAD PRODUTOS] Solicitando produtos para cliente ${customerId}`
      );

      const loadedProducts = await loadProductsFromCache();

      setProducts(loadedProducts);
      setProductsLoaded(true);

      console.log(
        `[LOAD PRODUTOS] OK - ${loadedProducts.length} produtos disponíveis`
      );

      return loadedProducts;
    } catch (error) {
      console.error("[LOAD PRODUTOS] ERROR:", error);

      throw error;
    } finally {
      setProductsLoading(false);
    }
  }, [customerId, productsLoaded, productsLoading, products]);

  /*
   * ============================================================
   * CARREGAMENTO DO CLIENTE
   * ============================================================
   */

  const load = useCallback(async () => {
    console.log(
      `[LOAD CLIENTE] Iniciando carregamento do cliente ${customerId}`
    );

    setLoading(true);
    setErr("");

    try {
      /*
       * As duas consultas são feitas em paralelo.
       */
      const [customerRes, ordersRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id,name")
          .eq("id", customerId)
          .single(),

        supabase
          .from("orders")
          .select(
            `
              id,
              order_number,
              total,
              change_amount,
              paid_at,
              status,
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
          .eq("customer_id", customerId)
          .order("order_number", {
            ascending: false,
          }),
      ]);

      if (customerRes.error) {
        console.error(
          "[LOAD CLIENTE] ERRO cliente:",
          customerRes.error.message
        );

        setErr(customerRes.error.message);
        return;
      }

      if (ordersRes.error) {
        console.error("[LOAD CLIENTE] ERRO pedidos:", ordersRes.error.message);

        setErr(ordersRes.error.message);
        return;
      }

      setCustomerName(customerRes.data.name);

      const loadedOrders = (ordersRes.data || []) as unknown as CustomerOrder[];

      setOrders(loadedOrders);

      const loadedPayments: Payment[] = loadedOrders.flatMap(
        (order) => order.payments || []
      );

      setPayments(loadedPayments);

      console.log(
        `[LOAD CLIENTE] OK - cliente "${customerRes.data.name}" | ${loadedOrders.length} pedidos | ${loadedPayments.length} pagamentos`
      );
    } catch (error) {
      console.error("[LOAD CLIENTE] ERROR:", error);

      setErr(
        error instanceof Error
          ? error.message
          : "Erro ao carregar os dados do cliente."
      );
    } finally {
      setLoading(false);

      console.log(`[LOAD CLIENTE] Finalizado para cliente ${customerId}`);
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * ============================================================
   * NOVO PEDIDO
   * ============================================================
   */

  const openNewOrder = async () => {
    console.log("[NOVO PEDIDO] Abrindo modal");

    setShowNewOrder(true);
    setOrderItems([]);
    setOrderError("");

    try {
      const loadedProducts = await loadProducts();

      /*
       * IMPORTANTE:
       *
       * Não alteramos o estado global "products" para somente
       * ativos.
       *
       * O cache mantém TODOS os produtos.
       *
       * O filtro de ativos acontece somente na hora de montar
       * a lista do Novo Pedido.
       */
      console.log(
        `[NOVO PEDIDO] ${
          loadedProducts.filter((p) => p.active).length
        } produtos ativos disponíveis`
      );
    } catch (error) {
      setOrderError(
        error instanceof Error ? error.message : "Erro ao carregar produtos."
      );
    }
  };

  const closeNewOrder = () => {
    if (busy) return;

    console.log("[NOVO PEDIDO] Fechando modal");

    setShowNewOrder(false);
    setOrderItems([]);
    setOrderError("");
  };

  const changeQuantity = (productId: string, delta: number) => {
    setOrderItems((currentItems) => {
      const currentQuantity =
        currentItems.find((item) => item.product_id === productId)?.quantity ??
        0;

      const newQuantity = currentQuantity + delta;

      if (newQuantity < 0) {
        return currentItems;
      }

      if (newQuantity === 0) {
        return currentItems.filter((item) => item.product_id !== productId);
      }

      const exists = currentItems.some((item) => item.product_id === productId);

      if (exists) {
        return currentItems.map((item) =>
          item.product_id === productId
            ? {
                ...item,
                quantity: newQuantity,
              }
            : item
        );
      }

      return [
        ...currentItems,
        {
          product_id: productId,
          quantity: newQuantity,
        },
      ];
    });
  };

  const getQuantity = (productId: string) =>
    orderItems.find((item) => item.product_id === productId)?.quantity || 0;

  const newOrderTotal = useMemo(
    () =>
      orderItems.reduce((sum, item) => {
        const product = products.find((p) => p.id === item.product_id);

        if (!product) {
          return sum;
        }

        return sum + Number(product.price) * item.quantity;
      }, 0),
    [orderItems, products]
  );

  const createOrder = async () => {
    if (busy) return;

    if (orderItems.length === 0) {
      setOrderError("Adicione pelo menos um produto.");
      return;
    }

    console.log(
      `[NOVO PEDIDO] Criando pedido com ${orderItems.length} produtos`
    );

    setBusy(true);
    setOrderError("");

    try {
      const { error } = await supabase.rpc("create_order_with_items", {
        p_customer_id: customerId,
        p_items: orderItems,
      });

      if (error) {
        console.error("[NOVO PEDIDO] ERRO:", error.message);

        setOrderError(error.message);
        return;
      }

      console.log("[NOVO PEDIDO] Pedido criado com sucesso");

      setShowNewOrder(false);
      setOrderItems([]);

      await load();
    } catch (error) {
      console.error("[NOVO PEDIDO] ERROR:", error);

      setOrderError(
        error instanceof Error ? error.message : "Erro ao criar pedido."
      );
    } finally {
      setBusy(false);
    }
  };

  /*
   * ============================================================
   * PRODUTOS POR CATEGORIA
   * ============================================================
   */

  const productsByCategory = useMemo(() => {
    /*
     * Apenas produtos ativos aparecem no Novo Pedido.
     *
     * Na edição, produtos inativos continuam aparecendo caso
     * já estejam no pedido.
     */
    const filteredProducts = showNewOrder
      ? products.filter((product) => product.active)
      : products;

    return CATEGORY_ORDER.map((category) => ({
      category,
      products: filteredProducts.filter(
        (product) => product.category === category
      ),
    })).filter((group) => group.products.length > 0);
  }, [products, showNewOrder]);

  /*
   * ============================================================
   * EDITAR PEDIDO
   * ============================================================
   */

  const openEditOrder = async (order: CustomerOrder) => {
    if (order.status !== "pending") {
      setErr("Somente pedidos pendentes podem ser editados.");
      return;
    }

    console.log(`[EDITAR PEDIDO] Abrindo pedido #${order.order_number}`);

    setEditingOrder(order);
    setEditItems([]);
    setEditError("");

    try {
      /*
       * Reutiliza o cache global de produtos.
       */
      const loadedProducts = await loadProducts();

      setProducts(loadedProducts);

      console.log(
        `[EDITAR PEDIDO] Produtos disponíveis: ${loadedProducts.length}`
      );

      /*
       * Busca somente os itens do pedido.
       */
      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select("product_id,quantity")
        .eq("order_id", order.id);

      if (itemsError) {
        console.error(
          "[EDITAR PEDIDO] ERRO ao carregar itens:",
          itemsError.message
        );

        setEditError(itemsError.message);
        return;
      }

      const loadedItems = (itemsData || []).map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity),
      }));

      setEditItems(loadedItems);

      console.log(`[EDITAR PEDIDO] ${loadedItems.length} itens carregados`);
    } catch (error) {
      console.error("[EDITAR PEDIDO] ERROR:", error);

      setEditError(
        error instanceof Error
          ? error.message
          : "Erro ao carregar o pedido para edição."
      );
    }
  };

  const closeEditOrder = () => {
    if (busy) return;

    console.log("[EDITAR PEDIDO] Fechando modal");

    setEditingOrder(null);
    setEditItems([]);
    setEditError("");
  };

  const changeEditQuantity = (productId: string, delta: number) => {
    setEditItems((currentItems) => {
      const currentQuantity =
        currentItems.find((item) => item.product_id === productId)?.quantity ??
        0;

      const newQuantity = currentQuantity + delta;

      if (newQuantity < 0) {
        return currentItems;
      }

      if (newQuantity === 0) {
        return currentItems.filter((item) => item.product_id !== productId);
      }

      const exists = currentItems.some((item) => item.product_id === productId);

      if (exists) {
        return currentItems.map((item) =>
          item.product_id === productId
            ? {
                ...item,
                quantity: newQuantity,
              }
            : item
        );
      }

      return [
        ...currentItems,
        {
          product_id: productId,
          quantity: newQuantity,
        },
      ];
    });
  };

  const getEditQuantity = (productId: string) =>
    editItems.find((item) => item.product_id === productId)?.quantity || 0;

  const editOrderTotal = useMemo(
    () =>
      editItems.reduce((sum, item) => {
        const product = products.find((p) => p.id === item.product_id);

        if (!product) {
          return sum;
        }

        return sum + Number(product.price) * item.quantity;
      }, 0),
    [editItems, products]
  );

  const updateOrder = async () => {
    if (busy || !editingOrder) return;

    if (editingOrder.status !== "pending") {
      setEditError("Somente pedidos pendentes podem ser editados.");
      return;
    }

    if (editItems.length === 0) {
      setEditError("O pedido precisa ter pelo menos um produto.");
      return;
    }

    console.log(
      `[EDITAR PEDIDO] Salvando pedido #${editingOrder.order_number} com ${editItems.length} produtos`
    );

    setBusy(true);
    setEditError("");

    try {
      const { error } = await supabase.rpc("update_order_with_items", {
        p_order_id: editingOrder.id,
        p_items: editItems,
      });

      if (error) {
        console.error("[EDITAR PEDIDO] ERRO:", error.message);

        setEditError(error.message);
        return;
      }

      console.log("[EDITAR PEDIDO] Pedido atualizado com sucesso");

      setEditingOrder(null);
      setEditItems([]);

      await load();
    } catch (error) {
      console.error("[EDITAR PEDIDO] ERROR:", error);

      setEditError(
        error instanceof Error ? error.message : "Erro ao atualizar pedido."
      );
    } finally {
      setBusy(false);
    }
  };

  /*
   * ============================================================
   * CANCELAR PEDIDO
   * ============================================================
   */

  const cancelOrder = async (order: CustomerOrder) => {
    if (busy) return;

    if (order.status !== "pending") {
      setErr("Somente pedidos pendentes podem ser cancelados.");
      return;
    }

    const confirmed = window.confirm(
      `Deseja realmente cancelar o pedido #${order.order_number}?`
    );

    if (!confirmed) {
      return;
    }

    console.log(`[CANCELAR PEDIDO] Cancelando pedido #${order.order_number}`);

    setBusy(true);
    setErr("");

    try {
      const { error } = await supabase.rpc("cancel_order", {
        p_order_id: order.id,
      });

      if (error) {
        console.error("[CANCELAR PEDIDO] ERRO:", error.message);

        setErr(error.message);
        return;
      }

      console.log("[CANCELAR PEDIDO] Pedido cancelado com sucesso");

      await load();
    } catch (error) {
      console.error("[CANCELAR PEDIDO] ERROR:", error);

      setErr(
        error instanceof Error ? error.message : "Erro ao cancelar pedido."
      );
    } finally {
      setBusy(false);
    }
  };

  /*
   * ============================================================
   * PAGAMENTOS
   * ============================================================
   */

  const totalOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "cancelled")
        .reduce((sum, order) => sum + Number(order.total), 0),
    [orders]
  );

  const totalPayments = useMemo(
    () => payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    [payments]
  );

  const balance = useMemo(
    () => Math.round((totalPayments - totalOrders) * 100) / 100,
    [totalPayments, totalOrders]
  );

  const remainingForOrder = (order: CustomerOrder) => {
    const paid = (order.payments || []).reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );

    return Math.max(0, Number(order.total) - paid);
  };

  const totalRemaining = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "cancelled")
        .reduce((sum, order) => sum + remainingForOrder(order), 0),
    [orders]
  );

  const openPayment = (target: PaymentTarget) => {
    console.log("[PAGAMENTO] Abrindo modal", target);

    setPaymentTarget(target);
    setPaymentMode("pix");
    setErr("");
  };

  const closePayment = () => {
    if (busy) return;

    console.log("[PAGAMENTO] Fechando modal");

    setPaymentTarget(null);
    setErr("");
  };

  const pay = async () => {
    if (busy || !paymentTarget) {
      return;
    }

    console.log(
      `[PAGAMENTO] Iniciando pagamento | tipo=${paymentTarget.type} | método=${paymentMode}`
    );

    setBusy(true);
    setErr("");

    try {
      /*
       * PAGAMENTO DE PEDIDO
       */

      if (paymentTarget.type === "order") {
        const order = orders.find((o) => o.id === paymentTarget.orderId);

        if (!order) {
          setErr("Pedido não encontrado.");
          return;
        }

        const amount = remainingForOrder(order);

        if (amount <= 0) {
          setErr("Este pedido já está quitado.");
          return;
        }

        const { error } = await supabase.rpc("pay_order", {
          p_order_id: order.id,
          p_method: paymentMode,
          p_amount: amount,
        });

        if (error) {
          console.error("[PAGAMENTO] ERRO:", error.message);

          setErr(error.message);
          return;
        }

        console.log(
          `[PAGAMENTO] Pedido #${order.order_number} pago: ${brl(amount)}`
        );
      }

      /*
       * PAGAMENTO TOTAL
       */

      if (paymentTarget.type === "total") {
        if (totalRemaining <= 0) {
          setErr("Não há saldo pendente.");
          return;
        }

        const { error } = await supabase.rpc("pay_customer_total", {
          p_customer_id: customerId,
          p_method: paymentMode,
          p_amount: totalRemaining,
        });

        if (error) {
          console.error("[PAGAMENTO] ERRO:", error.message);

          setErr(error.message);
          return;
        }

        console.log(
          `[PAGAMENTO] Total do cliente pago: ${brl(totalRemaining)}`
        );
      }

      setPaymentTarget(null);

      await load();
    } catch (error) {
      console.error("[PAGAMENTO] ERROR:", error);

      setErr(
        error instanceof Error ? error.message : "Erro ao registrar pagamento."
      );
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Carregando...</div>;
  }

  /*
   * ============================================================
   * TELA
   * ============================================================
   */

  return (
    <div className="space-y-3 p-3 pb-28">
      {/* CABEÇALHO */}

      <div className="flex items-center gap-2">
        <button className="btn border bg-white !px-3" onClick={onBack}>
          ←
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{customerName}</h1>

          <p className="text-sm text-gray-500">
            {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
          </p>
        </div>

        <button
          className="btn shrink-0 bg-orange-600 text-white"
          onClick={openNewOrder}
        >
          + Pedido
        </button>
      </div>

      {/* ERRO */}

      {err && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {err}
        </div>
      )}

      {/* SALDO */}

      <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
        <div className="text-sm text-gray-500">
          {balance < 0
            ? "Total devedor"
            : balance > 0
            ? "Crédito do cliente"
            : "Saldo"}
        </div>

        <div
          className={`text-3xl font-bold ${
            balance < 0
              ? "text-red-600"
              : balance > 0
              ? "text-green-600"
              : "text-gray-800"
          }`}
        >
          {brl(Math.abs(balance))}
        </div>

        <div className="text-sm">
          {balance < 0 ? (
            <span className="text-red-600">Cliente deve</span>
          ) : balance > 0 ? (
            <span className="text-green-600">Cliente tem crédito</span>
          ) : (
            <span className="text-gray-500">Tudo quitado</span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-gray-50 p-2">
            <div className="text-gray-500">Consumo</div>

            <div className="font-bold">{brl(totalOrders)}</div>
          </div>

          <div className="rounded-xl bg-gray-50 p-2">
            <div className="text-gray-500">Pagamentos</div>

            <div className="font-bold">{brl(totalPayments)}</div>
          </div>
        </div>

        {totalRemaining > 0 && (
          <button
            className="btn mt-3 w-full bg-green-600 text-white"
            onClick={() =>
              openPayment({
                type: "total",
              })
            }
          >
            Pagar total · {brl(totalRemaining)}
          </button>
        )}
      </div>

      {/* HISTÓRICO */}

      <div className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-gray-600">
          Histórico de pedidos
        </h2>

        {orders.length === 0 && (
          <div className="rounded-xl bg-white p-5 text-center text-gray-500">
            Nenhum pedido.
          </div>
        )}

        {orders.map((order) => {
          const paid = (order.payments || []).reduce(
            (sum, payment) => sum + Number(payment.amount),
            0
          );

          const remaining = remainingForOrder(order);

          return (
            <div key={order.id} className="rounded-2xl bg-white p-3 shadow-sm">
              {/* PEDIDO */}

              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">
                    Pedido #{order.order_number}
                  </div>

                  <div className="mt-2 space-y-2">
                    {CATEGORY_ORDER.map((category) => {
                      const categoryItems = (order.order_items || []).filter(
                        (item) => item.products?.category === category
                      );

                      if (categoryItems.length === 0) {
                        return null;
                      }

                      return (
                        <div key={category}>
                          <div className="text-xs font-semibold text-gray-500">
                            {category}
                          </div>

                          <div className="mt-0.5 space-y-0.5 text-sm text-gray-700">
                            {categoryItems.map((item) => (
                              <div key={item.id}>
                                {item.quantity}× {item.products?.name ?? "?"}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="font-bold">{brl(Number(order.total))}</div>

                  {order.status === "paid" ? (
                    <div className="text-xs font-medium text-green-600">
                      Pago
                    </div>
                  ) : order.status === "cancelled" ? (
                    <div className="text-xs font-medium text-gray-500">
                      Cancelado
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-red-600">
                      Pendente
                    </div>
                  )}
                </div>
              </div>

              {/* AÇÕES DO PEDIDO */}

              {order.status === "pending" && (
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    className="btn bg-orange-100 text-orange-700 !py-1.5"
                    disabled={busy}
                    onClick={() => openEditOrder(order)}
                  >
                    ✏️ Editar
                  </button>

                  <button
                    className="btn bg-red-100 text-red-700 !py-1.5"
                    disabled={busy}
                    onClick={() => cancelOrder(order)}
                  >
                    🗑️ Cancelar
                  </button>
                </div>
              )}

              {/* PAGAMENTO */}

              {paid > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  Pago: {brl(paid)}
                </div>
              )}

              {/* RESTANTE */}

              {remaining > 0 && order.status !== "cancelled" && (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-red-600">
                    Restante: {brl(remaining)}
                  </span>

                  <button
                    className="btn bg-green-600 !py-1 text-white"
                    onClick={() =>
                      openPayment({
                        type: "order",
                        orderId: order.id,
                      })
                    }
                  >
                    Pagar pedido
                  </button>
                </div>
              )}

              {/* PAGAMENTOS */}

              {(order.payments || []).length > 0 && (
                <div className="mt-2 space-y-1 border-t pt-2">
                  {order.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex justify-between text-xs"
                    >
                      <span className="text-gray-500">
                        {formatDate(payment.created_at)}
                        {" · "}
                        {payment.method === "pix" ? "PIX" : "Dinheiro"}
                      </span>

                      <span className="font-medium text-green-700">
                        {brl(Number(payment.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL NOVO PEDIDO */}

      {showNewOrder && (
        <NewOrderModal
          productsByCategory={productsByCategory}
          productsLoading={productsLoading}
          orderItems={orderItems}
          total={newOrderTotal}
          error={orderError}
          busy={busy}
          getQuantity={getQuantity}
          onChangeQuantity={changeQuantity}
          onClose={closeNewOrder}
          onConfirm={createOrder}
        />
      )}

      {/* MODAL EDITAR PEDIDO */}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          productsByCategory={productsByCategory}
          productsLoading={productsLoading}
          total={editOrderTotal}
          error={editError}
          busy={busy}
          getQuantity={getEditQuantity}
          onChangeQuantity={changeEditQuantity}
          onClose={closeEditOrder}
          onConfirm={updateOrder}
        />
      )}

      {/* MODAL PAGAMENTO */}

      {paymentTarget && (
        <PaymentModal
          amount={
            paymentTarget.type === "total"
              ? totalRemaining
              : (() => {
                  const order = orders.find(
                    (o) => o.id === paymentTarget.orderId
                  );

                  return order ? remainingForOrder(order) : 0;
                })()
          }
          mode={paymentMode}
          busy={busy}
          onModeChange={setPaymentMode}
          onClose={closePayment}
          onConfirm={pay}
          title={
            paymentTarget.type === "total"
              ? "Pagar total do cliente"
              : "Pagar pedido"
          }
        />
      )}
    </div>
  );
}

/*
 * ============================================================
 * MODAL NOVO PEDIDO
 * ============================================================
 */

type NewOrderModalProps = {
  productsByCategory: {
    category: ProductCategory;
    products: Product[];
  }[];

  productsLoading: boolean;
  orderItems: NewOrderItem[];
  total: number;
  error: string;
  busy: boolean;

  getQuantity: (productId: string) => number;

  onChangeQuantity: (productId: string, delta: number) => void;

  onClose: () => void;
  onConfirm: () => void;
};

function NewOrderModal({
  productsByCategory,
  productsLoading,
  total,
  error,
  busy,
  getQuantity,
  onChangeQuantity,
  onClose,
  onConfirm,
}: NewOrderModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-auto flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <div className="text-lg font-bold">Novo pedido</div>

            <div className="text-xs text-gray-500">Selecione os produtos</div>
          </div>

          <button
            disabled={busy}
            className="btn bg-gray-100 !px-3"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {productsLoading ? (
            <div className="py-8 text-center text-gray-500">
              Carregando produtos...
            </div>
          ) : productsByCategory.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Nenhum produto disponível.
            </div>
          ) : (
            <div className="space-y-5">
              {productsByCategory.map(({ category, products }) => (
                <section key={category}>
                  <h3 className="mb-2 text-sm font-bold text-gray-600">
                    {category}
                  </h3>

                  <div className="space-y-2">
                    {products.map((product) => {
                      const quantity = getQuantity(product.id);

                      return (
                        <div
                          key={product.id}
                          className="flex items-center gap-2 rounded-xl bg-gray-50 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {product.name}
                            </div>

                            <div className="text-sm text-gray-500">
                              {brl(Number(product.price))}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-lg shadow-sm disabled:opacity-40"
                            disabled={quantity === 0 || busy}
                            onClick={() => onChangeQuantity(product.id, -1)}
                          >
                            −
                          </button>

                          <div className="w-6 shrink-0 text-center font-bold">
                            {quantity}
                          </div>

                          <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-lg text-white disabled:opacity-40"
                            disabled={busy}
                            onClick={() => onChangeQuantity(product.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Total</span>

            <span className="text-2xl font-bold">{brl(total)}</span>
          </div>

          <button
            disabled={busy || productsLoading || total <= 0}
            onClick={onConfirm}
            className="btn w-full bg-green-600 py-4 text-lg text-white disabled:bg-gray-300"
          >
            {busy ? "Criando pedido..." : "Confirmar pedido"}
          </button>

          <button
            disabled={busy}
            onClick={onClose}
            className="btn w-full bg-gray-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/*
 * ============================================================
 * MODAL EDITAR PEDIDO
 * ============================================================
 */

type EditOrderModalProps = {
  order: CustomerOrder;

  productsByCategory: {
    category: ProductCategory;
    products: Product[];
  }[];

  productsLoading: boolean;
  total: number;
  error: string;
  busy: boolean;

  getQuantity: (productId: string) => number;

  onChangeQuantity: (productId: string, delta: number) => void;

  onClose: () => void;
  onConfirm: () => void;
};

function EditOrderModal({
  order,
  productsByCategory,
  productsLoading,
  total,
  error,
  busy,
  getQuantity,
  onChangeQuantity,
  onClose,
  onConfirm,
}: EditOrderModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-auto flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold">
                ✏️ Editar pedido #{order.order_number}
              </div>

              <div className="text-xs font-medium text-orange-600">
                Modo de edição · pedido pendente
              </div>
            </div>

            <button
              disabled={busy}
              className="btn bg-gray-100 !px-3"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {productsLoading ? (
            <div className="py-8 text-center text-gray-500">
              Carregando produtos...
            </div>
          ) : productsByCategory.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Nenhum produto disponível.
            </div>
          ) : (
            <div className="space-y-5">
              {productsByCategory.map(({ category, products }) => (
                <section key={category}>
                  <h3 className="mb-2 text-sm font-bold text-gray-600">
                    {category}
                  </h3>

                  <div className="space-y-2">
                    {products.map((product) => {
                      const quantity = getQuantity(product.id);

                      return (
                        <div
                          key={product.id}
                          className={`flex items-center gap-2 rounded-xl p-3 ${
                            quantity > 0
                              ? "bg-orange-50 ring-1 ring-orange-200"
                              : "bg-gray-50"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {product.name}
                            </div>

                            <div className="text-sm text-gray-500">
                              {brl(Number(product.price))}

                              {!product.active && (
                                <span className="ml-1 text-red-500">
                                  · inativo
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-lg shadow-sm disabled:opacity-40"
                            disabled={quantity === 0 || busy}
                            onClick={() => onChangeQuantity(product.id, -1)}
                          >
                            −
                          </button>

                          <div className="w-6 shrink-0 text-center font-bold">
                            {quantity}
                          </div>

                          <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-lg text-white disabled:opacity-40"
                            disabled={busy || !product.active}
                            onClick={() => onChangeQuantity(product.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Novo total</span>

            <span className="text-2xl font-bold">{brl(total)}</span>
          </div>

          <button
            disabled={busy || productsLoading || total <= 0}
            onClick={onConfirm}
            className="btn w-full bg-green-600 py-4 text-lg text-white disabled:bg-gray-300"
          >
            {busy ? "Salvando..." : "Salvar alterações"}
          </button>

          <button
            disabled={busy}
            onClick={onClose}
            className="btn w-full bg-gray-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/*
 * ============================================================
 * MODAL DE PAGAMENTO
 * ============================================================
 */

type PaymentModalProps = {
  amount: number;
  mode: PaymentMode;
  busy: boolean;
  title: string;

  onModeChange: (mode: PaymentMode) => void;

  onClose: () => void;
  onConfirm: () => void;
};

function PaymentModal({
  amount,
  mode,
  busy,
  title,
  onModeChange,
  onClose,
  onConfirm,
}: PaymentModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-sm text-gray-500">{title}</div>

          <div className="text-3xl font-bold">{brl(amount)}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`btn ${
              mode === "pix" ? "bg-orange-600 text-white" : "bg-gray-100"
            }`}
            onClick={() => onModeChange("pix")}
          >
            PIX
          </button>

          <button
            type="button"
            className={`btn ${
              mode === "cash" ? "bg-orange-600 text-white" : "bg-gray-100"
            }`}
            onClick={() => onModeChange("cash")}
          >
            Dinheiro
          </button>
        </div>

        <button
          type="button"
          disabled={busy || amount <= 0}
          onClick={onConfirm}
          className="btn w-full bg-green-600 py-4 text-lg text-white disabled:bg-gray-300"
        >
          {busy ? "Registrando..." : `Confirmar pagamento · ${brl(amount)}`}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="btn w-full bg-gray-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
