import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Customer } from "../types";
import { byName } from "../format";
import ClienteDetalhe from "./ClienteDetalhe";

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
    <div className="space-y-3 p-3">
      {/* Cadastro / edição */}
      <div className="space-y-2 rounded-xl bg-white p-3">
        <div className="flex gap-2">
          <input
            className="inp"
            placeholder={editId ? "Editar nome" : "Novo cliente"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <button className="btn bg-orange-600 text-white" onClick={save}>
            {editId ? "Salvar" : "Add"}
          </button>

          {editId && (
            <button className="btn bg-white border" onClick={cancelEdit}>
              ✕
            </button>
          )}
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>

      {/* Busca */}
      <input
        className="inp"
        placeholder="🔍 Buscar cliente"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {/* Lista */}
      <ul className="space-y-2">
        {shown.map((customer) => (
          <li
            key={customer.id}
            className="flex items-center gap-2 rounded-xl bg-white p-3"
          >
            {/* Cliente */}
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => setSelectedId(customer.id)}
            >
              <div className="truncate font-medium">{customer.name}</div>

              <div className="text-xs text-gray-500">Ver histórico →</div>
            </button>

            {/* Editar */}
            <button
              className="btn bg-gray-100 !py-1"
              onClick={() => startEdit(customer)}
            >
              Editar
            </button>
          </li>
        ))}

        {shown.length === 0 && (
          <li className="py-6 text-center text-gray-500">Nenhum cliente.</li>
        )}
      </ul>
    </div>
  );
}
