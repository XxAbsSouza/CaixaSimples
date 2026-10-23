import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import type { Product, ProductCategory } from "../types";
import { PRODUCT_CATEGORIES } from "../types";
import { brl, byName, toNum } from "../format";

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
    <div className="space-y-3 p-3">
      {/* CADASTRO / EDIÇÃO */}
      <div className="space-y-2 rounded-xl bg-white p-3">
        {editId && (
          <div className="rounded-lg bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700">
            ✏️ Editando produto
          </div>
        )}

        <input
          className="inp"
          placeholder="Nome do produto"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            className="inp"
            inputMode="decimal"
            placeholder="Preço"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />

          <select
            className="inp"
            value={category}
            onChange={(e) => setCategory(e.target.value as ProductCategory)}
          >
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            className="btn flex-1 bg-orange-600 text-white"
            onClick={save}
          >
            {editId ? "Salvar alterações" : "Adicionar"}
          </button>

          {editId && (
            <button className="btn border bg-white" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>

      {/* LISTA */}
      <div className="space-y-4">
        {productsByCategory.map(({ category, products }) => (
          <section key={category}>
            <h2 className="mb-2 px-1 text-sm font-bold text-gray-600">
              {category}
            </h2>

            <ul className="space-y-2">
              {products.map((p) => (
                <li
                  key={p.id}
                  className={`rounded-xl bg-white p-3 ${
                    p.active ? "" : "opacity-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>

                      <div className="text-sm text-gray-500">
                        {brl(p.price)}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        className="btn bg-gray-100 !py-1"
                        onClick={() => edit(p)}
                      >
                        Editar
                      </button>

                      <button
                        className={`btn !py-1 ${
                          p.active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-200"
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
          <div className="rounded-xl bg-white p-5 text-center text-gray-500">
            Nenhum produto cadastrado.
          </div>
        )}
      </div>
    </div>
  );
}
