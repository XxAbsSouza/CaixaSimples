import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import type { Product, ProductCategory } from "../types";
import { PRODUCT_CATEGORIES } from "../types";
import { brl, byName, toNum } from "../format";
import { clearProductsCache } from "../cache";
import { invalidateProductsCache } from "./ClienteDetalhe";

const CATEGORY_EMOJI: Record<ProductCategory, string> = {
  Pastéis: "🥟",
  Bebidas: "🥤",
  Doces: "🍬",
  Salgados: "🥐",
  SPA: "💆",
  Brechó: "👗",
  Outros: "📦",
};

export default function Produtos() {
  const [list, setList] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<ProductCategory>("Outros");
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,price,active,category");

    if (error) {
      setErr(error.message);
      return;
    }

    setList(byName((data || []) as Product[]));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const n = name.trim();
    const p = toNum(price);

    if (!n || !price || p < 0) return;

    const row = {
      name: n,
      price: p,
      category,
    };

    const { error } = editId
      ? await supabase.from("products").update(row).eq("id", editId)
      : await supabase.from("products").insert(row);

    if (error) {
      setErr(error.message);
      return;
    }

    // Caixa e ClienteDetalhe não podem continuar com preço/lista antigos.
    clearProductsCache();
    invalidateProductsCache();

    setErr("");
    setName("");
    setPrice("");
    setCategory("Outros");
    setEditId(null);

    load();
  };

  const edit = (p: Product) => {
    setEditId(p.id);
    setName(p.name);
    setPrice(String(p.price).replace(".", ","));
    setCategory(p.category);
    setErr("");

    // Leva o usuário de volta ao formulário (que fica no topo da lista).
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditId(null);
    setName("");
    setPrice("");
    setCategory("Outros");
    setErr("");
  };

  const toggle = async (p: Product) => {
    const { error } = await supabase
      .from("products")
      .update({ active: !p.active })
      .eq("id", p.id);

    if (error) {
      setErr(error.message);
      return;
    }

    clearProductsCache();
    invalidateProductsCache();

    load();
  };

  const productsByCategory = useMemo(() => {
    return PRODUCT_CATEGORIES.map((category) => ({
      category,
      products: list
        .filter((product) => product.category === category)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    })).filter((group) => group.products.length > 0);
  }, [list]);

  return (
    <div className="mx-auto min-h-full  pb-6">
      {/* CABEÇALHO + CADASTRO / EDIÇÃO */}

      <div className="rounded-b-3xl bg-gradient-to-br from-orange-500 to-orange-600 px-4 pb-5 pt-5 shadow-lg">
        <div className="mb-4 flex items-end justify-between text-white">
          <div>
            <h1 className="text-2xl font-extrabold">🥟 Produtos</h1>

            <p className="text-sm text-orange-100">
              {list.length} {list.length === 1 ? "produto" : "produtos"}{" "}
              cadastrados
            </p>
          </div>

          {editId && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
              ✏️ Editando
            </span>
          )}
        </div>

        <div className="space-y-2 rounded-3xl bg-white p-3 shadow-md">
          <input
            className="inp !rounded-2xl"
            placeholder="Nome do produto"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              className="inp !rounded-2xl"
              inputMode="decimal"
              placeholder="Preço"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />

            <select
              className="inp !rounded-2xl"
              value={category}
              onChange={(e) => setCategory(e.target.value as ProductCategory)}
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_EMOJI[c]} {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 py-3 font-bold text-white shadow-md transition active:scale-[0.98]"
              onClick={save}
            >
              {editId ? "Salvar alterações" : "＋ Adicionar"}
            </button>

            {editId && (
              <button
                className="rounded-2xl bg-gray-100 px-4 py-3 font-semibold text-gray-600 transition active:scale-[0.98]"
                onClick={cancelEdit}
              >
                Cancelar
              </button>
            )}
          </div>

          {err && (
            <p className="rounded-xl bg-red-50 p-2 text-center text-sm text-red-600">
              {err}
            </p>
          )}
        </div>
      </div>

      {/* LISTA */}

      <div className="space-y-5 p-3 pt-5">
        {productsByCategory.map(({ category, products }) => (
          <section key={category}>
            <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-gray-700">
              <span className="text-lg">{CATEGORY_EMOJI[category]}</span>
              {category}
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                {products.length}
              </span>
            </h2>

            <ul className="space-y-2">
              {products.map((p) => (
                <li
                  key={p.id}
                  className={`rounded-2xl bg-white p-3 shadow-sm transition ${
                    editId === p.id
                      ? "ring-2 ring-orange-400"
                      : "ring-1 ring-black/5"
                  } ${p.active ? "" : "opacity-60"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-800">
                        {p.name}
                      </div>

                      <div className="text-sm font-bold text-orange-600">
                        {brl(p.price)}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition active:scale-95"
                        onClick={() => edit(p)}
                      >
                        ✏️ Editar
                      </button>

                      <button
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                          p.active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-200 text-gray-600"
                        }`}
                        onClick={() => toggle(p)}
                      >
                        {p.active ? "Ativo" : "Inativo"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {productsByCategory.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
            Nenhum produto cadastrado.
          </div>
        )}
      </div>
    </div>
  );
}
