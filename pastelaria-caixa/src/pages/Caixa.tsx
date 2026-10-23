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

      // Se os dois estiverem no cache, não consulta o Supabase
      if (cachedProducts && cachedCustomers) {
        console.log("⚡ Caixa carregado 100% do CACHE");
        setProducts(cachedProducts);
        setCustomers(cachedCustomers);
        return;
        
      }
        console.log("🌐 Buscando dados no Supabase...");


      const [productsRes, customersRes] = await Promise.all([
        cachedProducts
          ? Promise.resolve({
              data: cachedProducts,
              error: null,
            })
          : supabase
              .from("products")
              .select("id,name,price,active,category")
              .eq("active", true)
              .order("name"),

        cachedCustomers
          ? Promise.resolve({
              data: cachedCustomers,
              error: null,
            })
          : supabase.from("customers").select("id,name").order("name"),
      ]);
      console.log("✅ Dados recebidos do Supabase");

      // ----------------------------------------------------------
      // PRODUTOS
      // ----------------------------------------------------------

      if (productsRes.error) {
        setMsg(productsRes.error.message);
      } else {
        const data = byName((productsRes.data || []) as Product[]);

        setProducts(data);
        setProductsCache(data);
      }

      // ----------------------------------------------------------
      // CLIENTES
      // ----------------------------------------------------------

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

  // Busca usada dentro do NOVO PEDIDO
  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!search) {
      return customers.slice(0, 8);
    }

    return customers
      .filter((customer) =>
        customer.name.toLowerCase().includes(search)
      )
      .slice(0, 8);
  }, [customers, customerSearch]);

  // Busca usada na LISTA PRINCIPAL DO CAIXA
  const visibleCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!search) {
      return customers;
    }

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
          (sum, product) =>
            sum + product.price * (cart[product.id] || 0),
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

    // Atualiza estado E cache
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

    const { data, error } = await supabase.rpc(
      "create_order_with_items",
      {
        p_customer_id: customerId,
        p_items: Object.entries(cart).map(
          ([product_id, quantity]) => ({
            product_id,
            quantity,
          })
        ),
      }
    );

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setNewOrder(false);
    setCustomerSearch("");
    setCustomerId("");
    setCart({});

    const customerToOpen =
      selectedCustomer?.id || customerId;

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
      products: products.filter(
        (product) => product.category === category
      ),
    })
  ).filter((group) => group.products.length > 0);

  // ============================================================
  // TELA DE NOVO PEDIDO
  // ============================================================

  if (newOrder) {
    return (
      <div className="min-h-full pb-28">
        {/* ======================================================
            CABEÇALHO
        ====================================================== */}

        <div className="sticky top-0 z-10 space-y-3 bg-orange-50 p-3">
          <div className="flex items-center gap-2">
            <button
              className="btn border bg-white !px-3"
              onClick={cancelOrder}
              disabled={busy}
            >
              ←
            </button>

            <div>
              <div className="font-bold">Novo pedido</div>

              <div className="text-xs text-gray-500">
                {count}{" "}
                {count === 1 ? "item" : "itens"}
                {" · "}
                {brl(total)}
              </div>
            </div>
          </div>

          {/* ==================================================
              CLIENTE
          ================================================== */}

          {!creatingCustomer ? (
            <div className="relative">
              <input
                autoFocus
                className="inp"
                placeholder="🔍 Pesquisar cliente"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerId("");
                }}
              />

              {customerId ? (
                <div className="mt-1 rounded-xl border border-green-200 bg-green-50 p-2 text-sm text-green-800">
                  ✓ Cliente selecionado:{" "}
                  <strong>
                    {selectedCustomer?.name}
                  </strong>
                </div>
              ) : (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border bg-white shadow-lg">
                  {filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      className="block w-full border-b px-3 py-3 text-left last:border-0 hover:bg-orange-50"
                      onClick={() =>
                        selectCustomer(customer)
                      }
                    >
                      {customer.name}
                    </button>
                  ))}

                  {filteredCustomers.length === 0 && (
                    <div className="p-3 text-sm text-gray-500">
                      Nenhum cliente encontrado.
                    </div>
                  )}

                  <button
                    className="w-full bg-orange-50 px-3 py-3 text-left font-medium text-orange-700"
                    onClick={() => {
                      setCreatingCustomer(true);
                      setNewCustomerName(
                        customerSearch.trim()
                      );
                    }}
                  >
                    ＋ Cadastrar novo cliente
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-white p-3">
              <div className="mb-2 text-sm font-semibold">
                Novo cliente
              </div>

              <div className="flex gap-2">
                <input
                  autoFocus
                  className="inp"
                  placeholder="Nome do cliente"
                  value={newCustomerName}
                  onChange={(e) =>
                    setNewCustomerName(e.target.value)
                  }
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
            <div className="rounded-xl bg-white p-2 text-center text-sm font-medium text-red-600">
              {msg}
            </div>
          )}
        </div>

        {/* ======================================================
            PRODUTOS
        ====================================================== */}

        <div className="space-y-5 px-3">
          {groupedProducts.map((group) => (
            <section key={group.category}>
              <h2 className="mb-2 text-lg font-bold">
                {group.category}
              </h2>

              <div className="grid grid-cols-2 gap-3">
                {group.products.map((product) => {
                  const quantity =
                    cart[product.id] || 0;

                  return (
                    <div
                      key={product.id}
                      className={`rounded-2xl border bg-white p-3 ${
                        quantity
                          ? "border-orange-500 ring-2 ring-orange-200"
                          : ""
                      }`}
                    >
                      {/* PRODUTO */}

                      <button
                        className="w-full text-left"
                        disabled={busy}
                        onClick={() =>
                          add(product.id, 1)
                        }
                      >
                        <div className="font-semibold leading-tight">
                          {product.name}
                        </div>

                        <div className="text-sm text-gray-500">
                          {brl(product.price)}
                        </div>
                      </button>

                      {/* QUANTIDADE */}

                      <div className="mt-2 flex items-center justify-between">
                        <button
                          className="btn h-11 w-11 bg-gray-100 !p-0 text-xl"
                          disabled={
                            quantity === 0 || busy
                          }
                          onClick={() =>
                            add(product.id, -1)
                          }
                        >
                          −
                        </button>

                        <span className="text-xl font-bold">
                          {quantity}
                        </span>

                        <button
                          className="btn h-11 w-11 bg-orange-600 !p-0 text-xl text-white disabled:bg-gray-300"
                          disabled={busy}
                          onClick={() =>
                            add(product.id, 1)
                          }
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

        {/* ======================================================
            RODAPÉ
        ====================================================== */}

        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] mx-auto max-w-md p-3">
          <button
            disabled={!customerId || !count || busy}
            onClick={finishOrder}
            className="btn flex w-full justify-between bg-orange-600 text-white shadow-lg disabled:bg-gray-300"
          >
            <span>
              {busy ? "Criando..." : "Criar pedido"}
            </span>

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
    <div className="space-y-3 p-3 pb-28">
      <button
        className="btn w-full bg-orange-600 py-4 text-lg text-white shadow"
        onClick={startOrder}
      >
        ＋ Novo pedido
      </button>

      {msg && (
        <div className="rounded-xl bg-white p-3 text-center text-sm">
          {msg}
        </div>
      )}

      <div className="text-sm font-semibold text-gray-600">
        Clientes
      </div>

      {/* ======================================================
          BUSCA DE CLIENTE NA VISÃO DO CAIXA
      ====================================================== */}

      {customers.length > 0 && (
        <div>
          <input
            className="inp"
            placeholder="🔍 Buscar cliente..."
            value={customerSearch}
            onChange={(e) =>
              setCustomerSearch(e.target.value)
            }
          />
        </div>
      )}

      {/* ======================================================
          LISTA DE CLIENTES
      ====================================================== */}

      {customers.length === 0 ? (
        <div className="rounded-xl bg-white p-5 text-center text-gray-500">
          Nenhum cliente cadastrado.
        </div>
      ) : visibleCustomers.length === 0 ? (
        <div className="rounded-xl bg-white p-5 text-center text-gray-500">
          Nenhum cliente encontrado para "
          {customerSearch}".
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCustomers.map((customer) => (
            <button
              key={customer.id}
              className="flex w-full items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm"
              onClick={() =>
                onOpenCustomer?.(customer.id)
              }
            >
              <span className="font-medium">
                {customer.name}
              </span>

              <span className="text-gray-400">
                →
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}