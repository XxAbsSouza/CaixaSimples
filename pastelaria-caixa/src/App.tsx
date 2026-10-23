import { useState } from "react";
import Caixa from "./pages/Caixa";
import Clientes from "./pages/Clientes";
import Produtos from "./pages/Produtos";
import Historico from "./pages/Historico";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import ControleGeral from "./pages/ControleGeral";

const tabs = [
  ["caixa", "🛒", "Caixa"],
  ["clientes", "👤", "Clientes"],
  ["produtos", "🥟", "Produtos"],
  ["historico", "🧾", "Histórico"],
  ["controle", "📊", "Controle"],
] as const;

type Tab = (typeof tabs)[number][0];

export default function App() {
  const [tab, setTab] = useState<Tab>("caixa");
  const [customerId, setCustomerId] = useState<string | null>(null);

  const openCustomer = (id: string) => {
    setCustomerId(id);
  };

  const closeCustomer = () => {
    setCustomerId(null);
  };

  /*
   * Cliente aberto pelo Caixa ou pela aba Clientes.
   */
  if (customerId) {
    return (
      <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-orange-50">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ClienteDetalhe customerId={customerId} onBack={closeCustomer} />
        </main>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-orange-50">
      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "caixa" && (
          <Caixa active={tab === "caixa"} onOpenCustomer={openCustomer} />
        )}

        {tab === "clientes" && <Clientes />}

        {tab === "produtos" && <Produtos />}

        {tab === "historico" && <Historico />}

        {tab === "controle" && <ControleGeral />}
      </main>

      <nav className="grid grid-cols-5 border-t bg-white pb-[env(safe-area-inset-bottom)]">
        {tabs.map(([key, icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`py-2 text-xs ${
              tab === key ? "font-bold text-orange-600" : "text-gray-500"
            }`}
          >
            <div className="text-xl">{icon}</div>

            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
