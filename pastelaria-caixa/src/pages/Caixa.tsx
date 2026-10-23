import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import type { Customer, Product, ProductCategory } from "../types";
import { PRODUCT_CATEGORIES } from "../types";
import { brl, byName, r2 } from "../format";
import {
  getCustomersCache,
  getProductsCache,
  setCustomersCache,
  setProductsCache,
} from "../cache";

type Props = {
  active: boolean;
  onOpenCustomer?: (customerId: string) => void;
};

const CATEGORY_EMOJI: Record<ProductCategory, string> = {
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

export default function Caixa({ active, onOpenCustomer }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [newOrder, setNewOrder] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");

  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // ============================================================
  // CARREGAMENTO
  // ============================================================

  useEffect(() => {
    if (!active) return;

    const loadData = async () => {
      setMsg("");

      const cachedProducts = getProductsCache();
      const cachedCustomers = getCustomersCache();

      console.log("📦 Cache Caixa:", {
        produtos: cachedProducts ? "CACHE" : "SUPABASE",
        clientes: cachedCustomers ? "CACHE" : "SUPABASE",
      });

      if (cachedProducts && cachedCustomers) {
        console.log("⚡ Caixa carregado 100% do CACHE");
        setProducts(cachedProducts);
        setCustomers(cachedCustomers);
        return;
      }

      console.log("🌐 Buscando dados no Supabase...");

      const [productsRes, customersRes] = await Promise.all([
        cachedProducts
          ? Promise.resolve({ data: cachedProducts, error: null })
          : supabase
              .from("products")
              .select("id,name,price,active,category")
              .eq("active", true)
              .order("name"),

        cachedCustomers
          ? Promise.resolve({ data: cachedCustomers, error: null })
          : supabase.from("customers").select("id,name").order("name"),
      ]);

      console.log("✅ Dados recebidos do Supabase");

      if (productsRes.error) {
        setMsg(productsRes.error.message);
      } else {
        const data = byName((productsRes.data || []) as Product[]);
        setProducts(data);
        setProductsCache(data);
      }

      if (customersRes.error) {
        setMsg(customersRes.error.message);
      } else {
        const data = byName((customersRes.data || []) as Customer[]);
        setCustomers(data);
        setCustomersCache(data);
      }
    };

    loadData();
  }, [active]);

  // ============================================================
  // CLIENTE
  // ============================================================

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );

  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!search) return customers.slice(0, 8);

    return customers
      .filter((customer) => customer.name.toLowerCase().includes(search))
      .slice(0, 8);
  }, [customers, customerSearch]);

  const visibleCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!search) return customers;

    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(search)
    );
  }, [customers, customerSearch]);

  // ============================================================
  // TOTAL
  // ============================================================

  const total = useMemo(
    () =>
      r2(
        products.reduce(
          (sum, product) => sum + product.price * (cart[product.id] || 0),
          0
        )
      ),
    [products, cart]
  );

  const count = Object.values(cart).reduce(
    (sum, quantity) => sum + quantity,
    0
  );

  // ============================================================
  // CARRINHO
  // ============================================================

  const add = (id: string, delta: number) => {
    setCart((current) => {
      const quantity = Math.max(0, (current[id] || 0) + delta);
      const next = { ...current };

      if (quantity === 0) {
        delete next[id];
      } else {
        next[id] = quantity;
      }

      return next;
    });
  };

  // ============================================================
  // PEDIDO
  // ============================================================

  const startOrder = () => {
    setNewOrder(true);
    setCustomerSearch("");
    setCustomerId("");
    setCart({});
    setMsg("");
    setCreatingCustomer(false);
    setNewCustomerName("");
  };

  const cancelOrder = () => {
    if (busy) return;

    setNewOrder(false);
    setCustomerSearch("");
    setCustomerId("");
    setCart({});
    setMsg("");
    setCreatingCustomer(false);
    setNewCustomerName("");
  };

  const selectCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerSearch(customer.name);
  };

  // ============================================================
  // NOVO CLIENTE
  // ============================================================

  const createCustomer = async () => {
    const name = newCustomerName.trim();

    if (!name) return;

    setBusy(true);
    setMsg("");

    const { data, error } = await supabase
      .from("customers")
      .insert({ name })
      .select("id,name")
      .single();

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    const customer = data as Customer;

    setCustomers((current) => {
      const updated = byName([...current, customer]);
      setCustomersCache(updated);
      return updated;
    });

    setCustomerId(customer.id);
    setCustomerSearch(customer.name);

    setCreatingCustomer(false);
    setNewCustomerName("");
  };

  // ============================================================
  // FINALIZA PEDIDO
  // ============================================================

  const finishOrder = async () => {
    if (!customerId) {
      setMsg("Selecione um cliente.");
      return;
    }

    if (count === 0) {
      setMsg("Adicione pelo menos um item.");
      return;
    }

    setBusy(true);
    setMsg("");

    const { data, error } = await supabase.rpc("create_order_with_items", {
      p_customer_id: customerId,
      p_items: Object.entries(cart).map(([product_id, quantity]) => ({
        product_id,
        quantity,
      })),
    });

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setNewOrder(false);
    setCustomerSearch("");
    setCustomerId("");
    setCart({});

    const customerToOpen = selectedCustomer?.id || customerId;

    if (onOpenCustomer) {
      onOpenCustomer(customerToOpen);
    } else {
      setMsg("Pedido criado com sucesso.");
    }

    console.log("Pedido criado:", data);
  };

  // ============================================================
  // PRODUTOS AGRUPADOS
  // ============================================================

  const groupedProducts = PRODUCT_CATEGORIES.map(
    (category: ProductCategory) => ({
      category,
      products: products.filter((product) => product.category === category),
    })
  ).filter((group) => group.products.length > 0);

  // ============================================================
  // TELA DE NOVO PEDIDO
  // ============================================================

  if (newOrder) {
    return (
      <div className="flex min-h-full flex-col">
        {/* CABEÇALHO */}

        <div className="sticky top-0 z-20 space-y-3 rounded-b-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl text-white transition active:scale-95 disabled:opacity-50"
              onClick={cancelOrder}
              disabled={busy}
            >
              ←
            </button>

            <div className="flex-1 text-white">
              <div className="text-lg font-bold leading-tight">Novo pedido</div>
              <div className="text-xs text-orange-100">
                {count} {count === 1 ? "item" : "itens"} · {brl(total)}
              </div>
            </div>
          </div>

          {/* CLIENTE */}

          {!creatingCustomer ? (
            <div className="relative">
              <input
                autoFocus
                className="inp !rounded-2xl !border-0 shadow-sm"
                placeholder="🔍 Pesquisar cliente"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerId("");
                }}
              />

              {customerId ? (
                <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white/95 p-2 text-sm text-green-800 shadow-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-xs font-bold">
                    {initials(selectedCustomer?.name ?? "")}
                  </span>
                  <span>
                    Cliente: <strong>{selectedCustomer?.name}</strong>
                  </span>
                  <span className="ml-auto text-green-600">✓</span>
                </div>
              ) : (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                  {filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-3 text-left transition last:border-0 active:bg-orange-50"
                      onClick={() => selectCustomer(customer)}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                        {initials(customer.name)}
                      </span>
                      {customer.name}
                    </button>
                  ))}

                  {filteredCustomers.length === 0 && (
                    <div className="p-3 text-sm text-gray-500">
                      Nenhum cliente encontrado.
                    </div>
                  )}

                  <button
                    className="w-full bg-orange-50 px-3 py-3 text-left font-semibold text-orange-700"
                    onClick={() => {
                      setCreatingCustomer(true);
                      setNewCustomerName(customerSearch.trim());
                    }}
                  >
                    ＋ Cadastrar novo cliente
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-gray-700">
                Novo cliente
              </div>

              <div className="flex gap-2">
                <input
                  autoFocus
                  className="inp"
                  placeholder="Nome do cliente"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />

                <button
                  className="btn bg-orange-600 text-white"
                  disabled={busy}
                  onClick={createCustomer}
                >
                  {busy ? "..." : "Criar"}
                </button>

                <button
                  className="btn border bg-white"
                  disabled={busy}
                  onClick={() => {
                    setCreatingCustomer(false);
                    setNewCustomerName("");
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {msg && (
            <div className="rounded-2xl bg-white p-2 text-center text-sm font-medium text-red-600 shadow-sm">
              {msg}
            </div>
          )}
        </div>

        {/* PRODUTOS */}

        <div className="flex-1 space-y-6 px-3 pt-5 pb-4">
          {groupedProducts.map((group) => (
            <section key={group.category}>
              <h2 className="mb-3 flex items-center gap-2 px-1 text-base font-bold text-gray-800">
                <span className="text-xl">
                  {CATEGORY_EMOJI[group.category]}
                </span>
                {group.category}
              </h2>

              <div className="grid grid-cols-2 gap-3">
                {group.products.map((product) => {
                  const quantity = cart[product.id] || 0;

                  return (
                    <div
                      key={product.id}
                      className={`flex flex-col rounded-2xl bg-white p-3 shadow-sm transition ${
                        quantity
                          ? "ring-2 ring-orange-400"
                          : "ring-1 ring-black/5"
                      }`}
                    >
                      <button
                        className="w-full flex-1 text-left active:opacity-70"
                        disabled={busy}
                        onClick={() => add(product.id, 1)}
                      >
                        <div className="font-semibold leading-tight text-gray-800">
                          {product.name}
                        </div>

                        <div className="mt-1 text-sm font-bold text-orange-600">
                          {brl(product.price)}
                        </div>
                      </button>

                      <div className="mt-3 flex items-center justify-between rounded-xl bg-orange-50 p-1">
                        <button
                          className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-xl shadow-sm transition active:scale-90 disabled:opacity-30"
                          disabled={quantity === 0 || busy}
                          onClick={() => add(product.id, -1)}
                        >
                          −
                        </button>

                        <span
                          className={`text-xl font-bold ${
                            quantity ? "text-orange-600" : "text-gray-400"
                          }`}
                        >
                          {quantity}
                        </span>

                        <button
                          className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600 text-xl text-white shadow-sm transition active:scale-90 disabled:bg-gray-300"
                          disabled={busy}
                          onClick={() => add(product.id, 1)}
                        >
                          ＋
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {products.length === 0 && (
            <p className="py-8 text-center text-gray-500">
              Cadastre produtos na aba Produtos.
            </p>
          )}
        </div>

        {/* RODAPÉ (sticky dentro da área rolável) */}

        <div className="sticky bottom-0 z-20 bg-gradient-to-t from-orange-50 via-orange-50/95 to-transparent p-3 pt-6">
          <button
            disabled={!customerId || !count || busy}
            onClick={finishOrder}
            className="btn flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 py-4 text-lg font-bold text-white shadow-lg transition active:scale-[0.98] disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
          >
            <span>{busy ? "Criando..." : "Criar pedido"}</span>
            <span>{brl(total)}</span>
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // TELA PRINCIPAL
  // ============================================================

  return (
    <div className="min-h-full">
      <div className="rounded-b-3xl bg-gradient-to-br from-orange-500 to-orange-600 px-4 pb-6 pt-5 shadow-lg">
        <div className="mb-4 text-white">
          <div className="text-2xl font-extrabold">🥟 Caixa</div>
          <div className="text-sm text-orange-100">
            {customers.length} {customers.length === 1 ? "cliente" : "clientes"}{" "}
            cadastrados
          </div>
        </div>

        <button
          className="w-full rounded-2xl bg-white py-4 text-lg font-bold text-orange-600 shadow-md transition active:scale-[0.98]"
          onClick={startOrder}
        >
          ＋ Novo pedido
        </button>
      </div>

      <div className="space-y-3 p-3 pb-6">
        {msg && (
          <div className="rounded-2xl bg-white p-3 text-center text-sm shadow-sm">
            {msg}
          </div>
        )}

        <div className="px-1 pt-1 text-sm font-semibold text-gray-600">
        </div>

        {customers.length > 0 && (
          <input
            className="inp !rounded-2xl shadow-sm"
            placeholder="Buscar cliente..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
          />
        )}

        {customers.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
            Nenhum cliente cadastrado.
          </div>
        ) : visibleCustomers.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
            Nenhum cliente encontrado para "{customerSearch}".
          </div>
        ) : (
          <div className="space-y-2">
            {visibleCustomers.map((customer) => (
              <button
                key={customer.id}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.99] active:bg-orange-50"
                onClick={() => onOpenCustomer?.(customer.id)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
                  {initials(customer.name)}
                </span>

                <span className="flex-1 truncate font-medium text-gray-800">
                  {customer.name}
                </span>

                <span className="text-lg text-gray-300">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
