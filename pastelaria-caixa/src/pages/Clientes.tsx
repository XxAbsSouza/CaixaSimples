import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Customer } from "../types";
import { byName } from "../format";
import ClienteDetalhe from "./ClienteDetalhe";

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export default function Clientes() {
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("customers").select("id,name");

    if (error) {
      setErr(error.message);
      return;
    }

    setList(byName((data || []) as Customer[]));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const n = name.trim();

    if (!n) return;

    const { error } = editId
      ? await supabase.from("customers").update({ name: n }).eq("id", editId)
      : await supabase.from("customers").insert({ name: n });

    if (error) {
      setErr(error.message);
      return;
    }

    setErr("");
    setName("");
    setEditId(null);
    load();
  };

  const startEdit = (customer: Customer) => {
    setEditId(customer.id);
    setName(customer.name);
    setErr("");

    // Leva o usuário de volta ao formulário, que fica no topo.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditId(null);
    setName("");
    setErr("");
  };

  const shown = list.filter((c) =>
    c.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  /*
   * Se um cliente foi selecionado,
   * mostramos a tela individual dele.
   */
  if (selectedId) {
    return (
      <ClienteDetalhe
        customerId={selectedId}
        onBack={() => {
          setSelectedId(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-md pb-6">
      {/* CABEÇALHO + CADASTRO / EDIÇÃO */}

      <div className="rounded-b-3xl bg-gradient-to-br from-orange-500 to-orange-600 px-4 pb-5 pt-5 shadow-lg">
        <div className="mb-4 flex items-end justify-between text-white">
          <div>
            <h1 className="text-2xl font-extrabold">👤 Clientes</h1>

            <p className="text-sm text-orange-100">
              {list.length} {list.length === 1 ? "cliente" : "clientes"}{" "}
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
          <div className="flex gap-2">
            <input
              className="inp !rounded-2xl"
              placeholder={editId ? "Editar nome" : "Novo cliente"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <button
              className="shrink-0 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 font-bold text-white shadow-md transition active:scale-95"
              onClick={save}
            >
              {editId ? "Salvar" : "＋ Add"}
            </button>

            {editId && (
              <button
                className="shrink-0 rounded-2xl bg-gray-100 px-3 font-semibold text-gray-600 transition active:scale-95"
                onClick={cancelEdit}
              >
                ✕
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

      <div className="space-y-3 p-3 pt-4">
        {/* BUSCA */}

        <input
          className="inp !rounded-2xl shadow-sm"
          placeholder="Buscar cliente"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {/* LISTA */}

        <ul className="space-y-2">
          {shown.map((customer) => (
            <li
              key={customer.id}
              className={`flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm transition ${
                editId === customer.id
                  ? "ring-2 ring-orange-400"
                  : "ring-1 ring-black/5"
              }`}
            >
              {/* Cliente */}
              <button
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition active:bg-orange-50"
                onClick={() => setSelectedId(customer.id)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
                  {initials(customer.name)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-gray-800">
                    {customer.name}
                  </div>

                  <div className="text-xs text-gray-500">Ver histórico ›</div>
                </div>
              </button>

              {/* Editar */}
              <button
                className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition active:scale-95"
                onClick={() => startEdit(customer)}
              >
                ✏️ Editar
              </button>
            </li>
          ))}

          {shown.length === 0 && (
            <li className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
              Nenhum cliente.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
